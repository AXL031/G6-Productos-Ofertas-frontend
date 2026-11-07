import { chromium } from "playwright";

// Run only against the candidate preview built with its actual public URLs.
// Credentials belong to the Node environment, never VITE_*, artifacts or logs.
const base = process.env.G6_RELEASE_PREVIEW_URL;
const email = process.env.G6_RELEASE_TEST_EMAIL;
const password = process.env.G6_RELEASE_TEST_PASSWORD;
if (!base || !email || !password) {
  console.error("NO APTO PARA LIBERAR: falta preview o credenciales de prueba externas a Vite.");
  process.exit(1);
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  const providerRead = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/cupones" && response.request().method() === "GET" && response.status() === 200);
  // Attach the rejection handler immediately while login is attempted.
  void providerRead.catch(() => undefined);
  await page.goto(new URL("/cupones", base).href);
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
  // MFA requires the real provider's interactive flow. This unattended gate
  // cannot declare success while MFA is pending or credentials are rejected.
  await page.getByRole("navigation", { name: "Navegación de la aplicación" }).waitFor();
  await page.getByRole("heading", { name: "Cupones de descuento", exact: true }).waitFor();
  await providerRead;
  await page.getByRole("link", { name: "Consultar precios", exact: true }).click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await page.waitForURL("**/login");
  console.log("PASS login, navegación y logout de la configuración candidata; revisar aparte cada provider comercial.");
} catch {
  console.error("NO APTO PARA LIBERAR: no se comprobó login y navegación reales. Ninguna credencial se incluye en este registro.");
  process.exitCode = 1;
} finally { await browser.close(); }
