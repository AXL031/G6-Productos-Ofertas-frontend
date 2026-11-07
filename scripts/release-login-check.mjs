import { chromium } from "playwright";
import { permittedRequest, verifyIntegrations, verifyNoRedirect, verifyPreviewLocation } from "./release-login-policy.mjs";

// Runs with a fresh, disposable context: no traces, HAR, screenshots, passwords,
// response bodies, OTP or tokens in logs/artifacts. HTTP loopback is test-only.
export async function verifyReleaseLogin(policy, { email, password, manualMfa = false, onMfaPending = () => {} }) {
  if (!email || !password) throw new Error("RELEASE_CREDENTIALS_MISSING");
  const browser = await chromium.launch({ headless: !manualMfa });
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
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
      if (!permittedRequest(policy, { url: request.url(), method: request.method(), resourceType: request.resourceType() }) || request.redirectedFrom()) {
        deny(); await route.abort(); return;
      }
      try {
        const headers = { ...request.headers() }; delete headers.cookie;
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15000, headers });
        verifyNoRedirect(response.status());
        const responseHeaders = { ...response.headers() }; delete responseHeaders["set-cookie"];
        await route.fulfill({ response, headers: responseHeaders });
      } catch {
        deny();
        await route.abort().catch(() => undefined);
      }
    });
    await context.routeWebSocket("**", socket => { deny(); socket.close(); });
    const preview = await context.request.get(policy.preview + "/cupones", { maxRedirects: 0, maxRetries: 0, timeout: 15000 });
    verifyNoRedirect(preview.status());
    if (!preview.ok()) throw new Error("RELEASE_PREVIEW_UNAVAILABLE");
    const page = await context.newPage();
    page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(15000);
    let readComplete;
    const providerRead = new Promise(resolve => { readComplete = resolve; });
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin === policy.gateway && url.pathname === "/api/v1/cupones" && response.request().method() === "GET" && response.status() === 200) readComplete();
    });
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
      mfaCompleted = true;
    }
    if (manualMfa && !mfaCompleted) throw new Error("RELEASE_MFA_NOT_EXERCISED");
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("heading", { name: "Cupones de descuento", exact: true }).waitFor();
    let timeout;
    try {
      await Promise.race([providerRead, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("RELEASE_READ_NOT_CONFIRMED")), 15000); })]);
    } finally { clearTimeout(timeout); }
    await page.getByRole("link", { name: "Consultar precios", exact: true }).click();
    await page.getByRole("heading", { level: 1 }).waitFor();
    healthy(); verifyPreviewLocation(policy, page.url());
    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await page.waitForURL(policy.preview + "/login");
    healthy();
    return { isolatedFixture: policy.isolatedFixture, mfaCompleted };
  } finally { await context.close(); await browser.close(); }
}
