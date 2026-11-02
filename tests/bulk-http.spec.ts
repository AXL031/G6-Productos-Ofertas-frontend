import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

const root = "/api/v1/carga-masiva/productos";
const iso = "2026-11-02T12:00:00.000Z";
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:5173" });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function batch(status = "COMPLETED") {
  return { batch_id: "http-batch", status, total_rows: 1, completed_rows: 0, failed_rows: 1,
    needs_reconciliation: true, rows: [{ row_id: "9", sku: "SKU-HTTP-9", nombre: "HTTP producto", status: "FAILED",
      applied_domains: ["CATALOGO"], failed_domain: "PRICING", needs_reconciliation: true,
      code: "PRECIO_INVALIDO", detail: "Precio rechazado", steps: [{ dominio: "CATALOGO", status: "COMPLETED" },
        { dominio: "PRICING", status: "FAILED", code: "PRECIO_INVALIDO", detail: "Precio rechazado" }] }] };
}
async function withServer(work: (origin: string, requests: Array<{ method?: string; url?: string; contentType?: string; auth?: string }>) => Promise<void>) {
  const requests: Array<{ method?: string; url?: string; contentType?: string; auth?: string }> = [];
  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "authorization, content-type, x-correlation-id" });
      response.end(); return;
    }
    requests.push({ method: request.method, url: request.url, contentType: request.headers["content-type"], auth: request.headers.authorization });
    const path = request.url ?? "";
    if (request.headers.authorization !== "Bearer test.header.signature") return json(response, 401, { status: 401, code: "TOKEN_INVALIDO" });
    if (request.method === "GET" && path.startsWith(`${root}/plantilla`)) {
      response.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="plantilla-h4.csv"', "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-expose-headers": "content-disposition" }); response.end("sku,nombre\n"); return;
    }
    if (request.method === "POST" && path === `${root}/importaciones`) {
      const multipart = await body(request);
      if (!request.headers["content-type"]?.startsWith("multipart/form-data; boundary=") || !multipart.toString().includes('name="archivo"') || !multipart.toString().includes('filename="upload.csv"') || !multipart.toString().includes('name="template_version"')) return json(response, 400, { status: 400, code: "ARCHIVO_INVALIDO" });
      return json(response, 202, { batch_id: "http-batch", status: "QUEUED", template_version: 2, correlation_id: "00000000-0000-4000-8000-000000000000" });
    }
    if (request.method === "GET" && path === `${root}/importaciones/http-batch`) return json(response, 200, batch());
    if (request.method === "GET" && path === `${root}/importaciones/missing`) return json(response, 404, { status: 404, code: "LOTE_NO_ENCONTRADO" });
    if (request.method === "GET" && path === `${root}/importaciones/unauthorized`) return json(response, 401, { status: 401, code: "TOKEN_INVALIDO" });
    if (request.method === "GET" && path === `${root}/importaciones/forbidden`) return json(response, 403, { status: 403, code: "SCOPE_INSUFICIENTE" });
    if (request.method === "GET" && path === `${root}/importaciones/unavailable`) return json(response, 503, { status: 503, code: "SERVICIO_NO_DISPONIBLE" });
    if (request.method === "GET" && path === `${root}/importaciones/network`) { request.socket.destroy(); return; }
    if (request.method === "GET" && path === `${root}/importaciones/conflict-batch`) return json(response, 200, { ...batch(), batch_id: "conflict-batch" });
    if (request.method === "GET" && path === `${root}/importaciones/http-batch/reporte`) { response.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="errores.csv"', "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-expose-headers": "content-disposition" }); response.end("row_id,code\n9,PRECIO_INVALIDO\n"); return; }
    if (request.method === "POST" && path === `${root}/importaciones/conflict-batch/reanudar`) return json(response, 409, { status: 409, code: "VERSION_CONFLICT" });
    if (request.method === "POST" && path === `${root}/importaciones/http-batch/reanudar`) return json(response, 202, { batch_id: "http-batch", status: "QUEUED", template_version: 2, correlation_id: "00000000-0000-4000-8000-000000000000" });
    if (request.method === "POST" && path === `${root}/exportaciones`) return json(response, 202, { export_id: "http-export", status: "QUEUED", formato: "CSV", created_at: iso });
    if (request.method === "GET" && path === `${root}/exportaciones/http-export`) return json(response, 200, { export_id: "http-export", status: "COMPLETED", formato: "CSV", created_at: iso, completed_at: iso, download_url: null });
    if (request.method === "GET" && path === `${root}/exportaciones/http-export/archivo`) { response.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="export.csv"', "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-expose-headers": "content-disposition" }); response.end("sku\nSKU-HTTP-9\n"); return; }
    return json(response, 404, { status: 404, code: "LOTE_NO_ENCONTRADO" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try { await work(`http://127.0.0.1:${port}`, requests); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("Bulk en provider API usa servidor HTTP aislado para upload, lotes, errores, reportes y exportación", async ({ page }) => {
  await withServer(async (gateway, requests) => {
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva`);
    await page.locator('input[type="file"]').setInputFiles({ name: "upload.csv", mimeType: "text/csv", buffer: Buffer.from("sku,nombre\nSKU-HTTP-9,HTTP producto\n") });
    await page.getByRole("button", { name: "Continuar a revisión" }).click();
    await page.getByRole("button", { name: "Confirmar importación" }).first().click();
    await expect(page).toHaveURL(/http-batch$/);
    await expect(page.getByText("SKU-HTTP-9")).toBeVisible();
    await expect(page.getByText("Precio rechazado").first()).toBeVisible();
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/http-batch/resultado`);
    await expect(page.getByText("SKU-HTTP-9")).toBeVisible();
    const reportDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar reporte de errores" }).click();
    expect((await reportDownload).suggestedFilename()).toBe("errores.csv");
    await page.getByRole("button", { name: "Reanudar operaciones pendientes" }).click();
    await page.getByRole("button", { name: "Confirmar reanudación" }).click();
    await expect(page).toHaveURL(/http-batch$/);

    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/descargas`);
    const template = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar CSV de ejemplo" }).click();
    expect((await template).suggestedFilename()).toBe("plantilla-h4.csv");
    await page.getByRole("button", { name: "Solicitar exportación" }).click();
    await expect(page.getByText("Trabajo de exportación: http-export")).toBeVisible();
    await page.getByRole("button", { name: "Actualizar estado" }).click();
    await expect(page.getByRole("button", { name: "Descargar archivo CSV consolidado" })).toBeEnabled();
    const exported = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar archivo CSV consolidado" }).click();
    expect((await exported).suggestedFilename()).toBe("export.csv");

    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/unauthorized`);
    await expect(page.getByText(/sesión expiró o no es válida/i)).toBeVisible();
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/forbidden`);
    await expect(page.getByText(/no tiene permiso/i)).toBeVisible();
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/missing`);
    await expect(page.getByText("Lote no encontrado")).toBeVisible();
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/unavailable`);
    await expect(page.getByText(/no está disponible temporalmente/i)).toBeVisible();
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/network`);
    await expect(page.getByText(/no se pudo conectar con Gateway/i)).toBeVisible();
    await page.goto(`/tests/harness/bulk-http.html?gateway=${encodeURIComponent(gateway)}#/carga-masiva/importaciones/conflict-batch/resultado`);
    await page.getByRole("button", { name: "Reanudar operaciones pendientes" }).click();
    await page.getByRole("button", { name: "Confirmar reanudación" }).click();
    await expect(page.getByText(/HTTP 409.*conflicto/i)).toBeVisible();
    expect(requests.every((request) => request.auth === "Bearer test.header.signature")).toBe(true);
    expect(requests.some((request) => request.method === "POST" && request.url === `${root}/importaciones` && request.contentType?.startsWith("multipart/form-data; boundary="))).toBe(true);
    expect(requests.some((request) => request.url === `${root}/exportaciones`)).toBe(true);
  });
});
