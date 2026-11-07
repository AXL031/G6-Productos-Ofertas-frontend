import { chromium } from "playwright";
import { permittedRequest, verifyIntegrations, verifyNoRedirect, verifyPreviewLocation } from "./release-login-policy.mjs";
import { ReleaseSessionEvidence } from "./release-session-evidence.mjs";

// Runs with a fresh, disposable context: no traces, HAR, screenshots, passwords,
// response bodies, OTP or tokens in logs/artifacts. HTTP loopback is test-only.
export async function verifyReleaseLogin(policy, { email, password, manualMfa = false, onMfaPending = () => {} }) {
  if (!email || !password) throw new Error("RELEASE_CREDENTIALS_MISSING");
  const browser = await chromium.launch({ headless: !manualMfa });
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const evidence = new ReleaseSessionEvidence({ email, password });
  let violation = false;
  let rejectBoundary;
  const blocked = new Promise((_, reject) => { rejectBoundary = reject; });
  void blocked.catch(() => undefined);
  const deny = () => { violation = true; rejectBoundary(new Error("RELEASE_NETWORK_NOT_APPROVED")); };
  const healthy = () => { if (violation) throw new Error("RELEASE_NETWORK_NOT_APPROVED"); };
  try {
    // Fetch each request without following redirects, including POST: do not
    // allow a 307/308 to forward credentials. No automatic network retries.
    await context.route("**/*", async route => {
      const request = route.request();
      if (!permittedRequest(policy, { url: request.url(), method: request.method(), resourceType: request.resourceType() }, evidence) || request.redirectedFrom()) {
        deny(); await route.abort(); return;
      }
      let stamp;
      try {
        stamp = evidence.before(policy, request);
        const headers = { ...request.headers() }; delete headers.cookie;
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15000, headers });
        verifyNoRedirect(response.status());
        await evidence.after(stamp, response);
        const responseHeaders = { ...response.headers() }; delete responseHeaders["set-cookie"];
        await route.fulfill({ response, headers: responseHeaders });
      } catch {
        if (!evidence.failed(stamp)) deny();
        await route.abort().catch(() => undefined);
      }
    });
    await context.routeWebSocket("**", socket => { deny(); socket.close(); });
    const preview = await context.request.get(policy.preview + "/cupones", { maxRedirects: 0, maxRetries: 0, timeout: 15000 });
    verifyNoRedirect(preview.status());
    if (!preview.ok()) throw new Error("RELEASE_PREVIEW_UNAVAILABLE");
    const page = await context.newPage();
    page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(15000);
    await page.goto(policy.preview + "/cupones");
    await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).waitFor();
    verifyPreviewLocation(policy, page.url());
    const effective = await page.locator('meta[name="g6-auth-integrations"]').getAttribute("content");
    verifyIntegrations(policy, JSON.parse(effective ?? "null"));
    // Anonymous transport probes only, before entering any credential. OPTIONS
    // targets the published login URL; GET is the published coupon read.
    for (const [method, url] of [["OPTIONS", policy.g7Base + "/auth/login"], ["GET", policy.gateway + "/api/v1/cupones"]]) {
      const response = await context.request.fetch(url, { method, maxRedirects: 0, maxRetries: 0, timeout: 15000 });
      verifyNoRedirect(response.status());
      if (!(method === "OPTIONS" ? [200, 204] : [401, 403]).includes(response.status())) throw new Error("RELEASE_PROBE_NOT_ACCEPTABLE");
    }
    verifyIntegrations(policy, JSON.parse(await page.locator('meta[name="g6-auth-integrations"]').getAttribute("content") ?? "null"));
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill(email);
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "Navegación de la aplicación", exact: true });
    const pending = page.getByRole("heading", { name: "Verificar identidad", exact: true });
    await Promise.race([navigation.or(pending).waitFor(), blocked]);
    healthy(); verifyPreviewLocation(policy, page.url());
    let mfaCompleted = false;
    if (await pending.isVisible()) {
      if (!manualMfa) throw new Error("RELEASE_MFA_PENDING");
      onMfaPending();
      // The authorized operator sends and enters the real OTP in this same
      // browser. It is never supplied through env, CLI arguments or fixtures.
      await Promise.race([navigation.waitFor({ timeout: 180000 }), blocked]);
      evidence.confirmMfa();
      mfaCompleted = true;
    }
    if (manualMfa && !mfaCompleted) throw new Error("RELEASE_MFA_NOT_EXERCISED");
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("heading", { name: "Cupones de descuento", exact: true }).waitFor();
    await Promise.race([evidence.waitForRead(), blocked]);
    // Wait for the coupon view to settle, including parent enrichment, before
    // navigating away and aborting a legitimate pending read.
    await page.getByText("Todavía no hay cupones", { exact: true }).or(page.locator("caption", { hasText: "Cupones de descuento" })).first().waitFor();
    await page.getByRole("link", { name: "Consultar precios", exact: true }).click();
    await page.waitForURL(policy.preview + "/precios");
    await page.getByRole("heading", { name: "Gestión de precios", exact: true, level: 1 }).waitFor();
    await page.getByText("Consulta los precios vigentes de productos y variantes (SKU).", { exact: true }).waitFor();
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await page.waitForURL(policy.preview + "/login");
    await page.getByRole("button", { name: "Ingresar al panel", exact: true }).waitFor();
    // Logout replaces the URL synchronously, then reloads the JS realm. Let
    // that navigation settle before issuing Back or racing its keepalive POST.
    await page.waitForLoadState("networkidle");
    await page.goBack();
    // A fresh browser can have no previous app entry. about:blank contains no
    // panel; also revisit the protected entry explicitly in either case.
    if (page.url() !== "about:blank") {
      verifyPreviewLocation(policy, page.url());
      await page.getByRole("button", { name: "Ingresar al panel", exact: true }).waitFor();
      if (await navigation.isVisible()) throw new Error("RELEASE_LOCAL_LOGOUT_NOT_CONFIRMED");
    }
    await page.goto(policy.preview + "/cupones");
    await page.waitForURL(policy.preview + "/login");
    await page.reload();
    await page.waitForURL(policy.preview + "/login");
    await page.getByRole("button", { name: "Ingresar al panel", exact: true }).waitFor();
    if (await navigation.isVisible()) throw new Error("RELEASE_LOCAL_LOGOUT_NOT_CONFIRMED");
    await evidence.confirmLogout();
    healthy();
    return { isolatedFixture: policy.isolatedFixture, mfaCompleted, logout204Observed: true, localLogoutVerified: true };
  } finally { evidence.dispose(); await context.close(); await browser.close(); }
}
