import assert from "node:assert/strict";

const expectedSha = process.env.DEPLOYMENT_SHA;
const token = process.env.GITHUB_TOKEN;
assert.match(expectedSha ?? "", /^[a-f0-9]{40}$/, "No se recibió el SHA completo del despliegue.");
assert.ok(token, "No está disponible GITHUB_TOKEN para comprobar la rama master.");

let response;
try {
  response = await fetch(
    "https://api.github.com/repos/Taller-SW-Web/G6-Productos-Ofertas-frontend/commits/master",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
} catch {
  throw new Error("No fue posible volver a consultar la versión actual de master.");
}
assert.equal(response.status, 200, `La consulta de master respondió HTTP ${response.status}.`);
const result = await response.json();
assert.equal(result.sha, expectedSha, "La rama master avanzó durante la verificación; el despliegue quedó obsoleto.");
console.log(`El SHA ${expectedSha} continúa siendo la versión actual de master.`);
