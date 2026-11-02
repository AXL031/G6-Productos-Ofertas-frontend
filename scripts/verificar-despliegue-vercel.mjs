import assert from "node:assert/strict";
import { readFile, appendFile } from "node:fs/promises";

const PROJECT_NAME = "g6-productos-ofertas";
const REPOSITORY = "Taller-SW-Web/G6-Productos-Ofertas-frontend";

function fail(message) {
  throw new Error(message);
}

async function getJson(url, headers, descripcion) {
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(`No fue posible consultar ${descripcion}.`);
  }
  if (!response.ok) {
    fail(`La consulta autenticada de ${descripcion} respondió HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    fail(`La respuesta de ${descripcion} no contiene JSON válido.`);
  }
}

function requireValue(value, message) {
  assert.ok(typeof value === "string" && value.length > 0, message);
  return value;
}

const deploymentId = requireValue(
  process.env.VERCEL_DEPLOYMENT_ID,
  "El evento no contiene un identificador de despliegue.",
);
const vercelToken = requireValue(
  process.env.VERCEL_TOKEN,
  "Falta el secreto VERCEL_TOKEN del entorno protegido.",
);
const teamId = requireValue(
  process.env.VERCEL_TEAM_ID,
  "Falta la variable VERCEL_TEAM_ID.",
);
const projectId = requireValue(
  process.env.VERCEL_PROJECT_ID,
  "Falta la variable VERCEL_PROJECT_ID.",
);
const githubToken = requireValue(
  process.env.GITHUB_TOKEN,
  "No está disponible GITHUB_TOKEN para consultar la rama maestra.",
);
assert.match(deploymentId, /^dpl_[A-Za-z0-9]+$/, "El identificador de despliegue no tiene el formato esperado.");
assert.match(teamId, /^team_[A-Za-z0-9]+$/, "VERCEL_TEAM_ID no tiene el formato esperado.");
assert.match(projectId, /^prj_[A-Za-z0-9]+$/, "VERCEL_PROJECT_ID no tiene el formato esperado.");

const eventPath = requireValue(process.env.GITHUB_EVENT_PATH, "No está disponible el contenido del evento de GitHub.");
let event;
try {
  event = JSON.parse(await readFile(eventPath, "utf8"));
} catch {
  fail("El contenido del evento de GitHub no contiene JSON válido.");
}
const payload = event.client_payload;
assert.ok(payload && typeof payload === "object", "El evento no contiene client_payload válido.");
assert.equal(payload.id, deploymentId, "El identificador del evento no coincide.");
assert.equal(payload.environment, "production", "El evento no corresponde al entorno production.");
assert.equal(payload.project?.name, PROJECT_NAME, "El nombre de proyecto del evento no coincide.");
assert.equal(payload.project?.id, projectId, "El ID de proyecto del evento no coincide.");
assert.equal(payload.git?.ref, "master", "El evento no identifica la rama master.");
assert.match(payload.git?.sha ?? "", /^[a-f0-9]{40}$/, "El evento no contiene un SHA completo válido.");

const deployment = await getJson(
  `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(teamId)}&withGitRepoInfo=1`,
  { Authorization: `Bearer ${vercelToken}` },
  "el despliegue en Vercel",
);

assert.equal(deployment.id, deploymentId, "Vercel devolvió un despliegue diferente al solicitado.");
assert.equal(deployment.projectId, projectId, "El despliegue pertenece a otro proyecto.");
assert.equal(deployment.ownerId, teamId, "El despliegue pertenece a otro equipo.");
assert.equal(deployment.name, PROJECT_NAME, "El nombre del proyecto autenticado no coincide.");
assert.equal(deployment.target, "production", "El despliegue no es de producción.");
assert.equal(deployment.readyState, "READY", "El despliegue autenticado aún no está listo.");

const metadata = deployment.meta;
assert.ok(metadata && typeof metadata === "object", "Vercel no devolvió metadata del repositorio.");
assert.equal(metadata.githubOrg, "Taller-SW-Web", "La organización GitHub del despliegue no coincide.");
assert.equal(metadata.githubRepo, "G6-Productos-Ofertas-frontend", "El repositorio GitHub del despliegue no coincide.");
assert.equal(metadata.githubCommitRef, "master", "La rama del despliegue no coincide con master.");
assert.match(metadata.githubCommitSha ?? "", /^[a-f0-9]{40}$/, "Vercel no devolvió un SHA completo válido.");
assert.equal(metadata.githubCommitSha, payload.git.sha, "El SHA autenticado por Vercel no coincide con el evento.");
assert.equal(metadata.githubCommitRef, payload.git.ref, "La rama autenticada por Vercel no coincide con el evento.");

const latestMaster = await getJson(
  `https://api.github.com/repos/${REPOSITORY}/commits/master`,
  {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  "la versión actual de master en GitHub",
);
assert.equal(metadata.githubCommitSha, latestMaster.sha, "El despliegue corresponde a una versión obsoleta de master.");

const deploymentHostname = requireValue(deployment.url, "Vercel no devolvió la URL del despliegue.");
assert.match(
  deploymentHostname,
  /^g6-productos-ofertas-[a-z0-9-]+\.vercel\.app$/,
  "La URL autenticada no pertenece al dominio inmutable del proyecto.",
);
const deploymentUrl = new URL(`https://${deploymentHostname}`);
assert.equal(deploymentUrl.protocol, "https:", "La URL del despliegue no usa HTTPS.");
assert.equal(deploymentUrl.hostname, deploymentHostname, "La URL del despliegue contiene una autoridad inválida.");
assert.equal(deploymentUrl.port, "", "La URL del despliegue contiene un puerto inesperado.");
assert.equal(deploymentUrl.pathname, "/", "La URL del despliegue contiene una ruta inesperada.");

const outputPath = requireValue(process.env.GITHUB_OUTPUT, "No está disponible GITHUB_OUTPUT.");
await appendFile(outputPath, `deployment_url=${deploymentUrl.origin}\ncommit_sha=${metadata.githubCommitSha}\n`);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `### Versión autenticada lista para verificación\n\n- SHA: \`${metadata.githubCommitSha}\`\n- Proyecto: \`${PROJECT_NAME}\`\n- Rama: \`master\`\n- URL inmutable: ${deploymentUrl.origin}\n- Dominio público: pendiente de asignación por Vercel hasta superar el control.\n`,
  );
}

console.log(`Identidad verificada para el SHA ${metadata.githubCommitSha} en ${deploymentUrl.origin}.`);
