import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:5174");
assert(["https:", "http:"].includes(base.protocol) && !base.username && !base.password, "URL http(s) sin credenciales requerida");
assert.equal(base.search, "", "La URL base no puede contener parámetros.");
assert.equal(base.hash, "", "La URL base no puede contener fragmentos.");
assert.equal(base.pathname, "/", "La URL base debe identificar el origen, sin ruta adicional.");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (bypassSecret) {
  assert.equal(base.protocol, "https:", "El bypass solo puede usarse con HTTPS.");
  assert.equal(base.port, "", "El bypass no puede usarse con un puerto personalizado.");
  assert.match(
    base.hostname,
    /^g6-productos-ofertas-[a-z0-9-]+\.vercel\.app$/,
    "El bypass solo puede usarse con la URL inmutable validada del proyecto.",
  );
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20_000);
const failures = [];
const assets = new Set();
page.on("pageerror", (error) => failures.push(`Error de JavaScript: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error") failures.push(`Error de consola: ${message.text()}`); });
page.on("requestfailed", (request) => failures.push(`Solicitud fallida: ${new URL(request.url()).pathname}`));
await page.route("**/*", async (route) => {
  const requestUrl = new URL(route.request().url());
  if (requestUrl.origin !== base.origin) {
    if (route.request().isNavigationRequest() || route.request().redirectedFrom()) {
      failures.push(`Navegación o redirección a un origen externo bloqueada: ${requestUrl.origin}`);
      await route.abort();
      return;
    }
    // Los recursos decorativos externos pueden cargarse, pero nunca reciben
    // el encabezado de bypass reservado para el host del despliegue.
    await route.continue();
    return;
  }
  if (bypassSecret) {
    const headers = { ...route.request().headers() };
    headers["x-vercel-protection-bypass"] = bypassSecret;
    headers["x-vercel-set-bypass-cookie"] = "true";
    await route.continue({ headers });
    return;
  }
  await route.continue();
});
page.on("response", (response) => {
  const request = response.request();
  if (["script", "stylesheet"].includes(request.resourceType())) {
    assets.add(response.url());
    // Chromium puede revalidar el caché al abrir otra ruta o refrescar.
    if (!response.ok() && response.status() !== 304) failures.push(`Recurso HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
  }
});
try {
  for (const path of ["/", "/precios", "/productos", "/categorias", "/carga-masiva"]) {
    const response = await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, `${path}: se esperaba HTTP 200 y se recibió ${response?.status()}`);
    assert.match(response.headers()["content-type"] ?? "", /text\/html/, `${path}: tipo MIME HTML esperado`);
    await page.locator("main").waitFor();
    const heading = page.getByRole("heading", { level: 1 });
    await heading.waitFor();
    const text = await heading.innerText();
    const expected = path === "/" || path === "/precios" ? /precios/i : path === "/productos" ? /productos/i : path === "/categorias" ? /categor[ií]as/i : /carga|importaci[oó]n/i;
    assert.match(text, expected, `${path}: no se encontró el contenido esperado`);
    assert.doesNotMatch(text, /no encontrad|no disponible|error/i, `${path}: se detectó contenido de error`);
    if (["/", "/precios", "/productos", "/categorias"].includes(path)) await page.getByRole("table").first().waitFor();
    if (path === "/productos") {
      const reload = await page.reload({ waitUntil: "networkidle" });
      assert.equal(reload?.status(), 200, "La recarga de /productos debe responder HTTP 200");
      await page.getByRole("table").first().waitFor();
      assert.match(await heading.innerText(), /productos/i);
    }
    console.log(`Correcto: ${path}${path === "/productos" ? " y recarga" : ""}`);
  }
  assert([...assets].some((url) => /\.js(?:\?|$)/.test(url)), "No se cargó ningún recurso JavaScript.");
  assert([...assets].some((url) => /\.css(?:\?|$)/.test(url)), "No se cargó ningún recurso CSS.");
  for (const url of assets) {
    const assetUrl = new URL(url);
    assert.equal(assetUrl.origin, base.origin, "Se detectó un recurso fuera del origen del despliegue.");
    const headers = bypassSecret
      ? {
          "x-vercel-protection-bypass": bypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined;
    const response = await page.request.get(url, { headers });
    assert(response.ok(), `El recurso respondió HTTP ${response.status()}.`);
    const mime = response.headers()["content-type"] ?? "";
    assert.match(mime, /\.css(?:\?|$)/.test(url) ? /text\/css/ : /javascript/, `Tipo MIME inesperado en ${new URL(url).pathname}`);
  }
  assert.deepEqual(failures, [], "Se detectaron errores críticos de aplicación, consola o red.");
  console.log(`Verificación correcta: cinco rutas, recarga, ${assets.size} recursos JS/CSS y cero errores; ${base.origin}`);
} finally {
  await browser.close();
}
