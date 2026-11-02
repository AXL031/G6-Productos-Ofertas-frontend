import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CONTEXTO_ESTADO = "verificacion-despliegue-produccion";

export function determinarEstadoFinal({ resultadoComprobacion, shaDespliegue, shaMaster, errorConsultaMaster }) {
  if (resultadoComprobacion !== "success") {
    return {
      estado: "failure",
      descripcion: "La comprobación remota no terminó correctamente.",
    };
  }
  if (errorConsultaMaster) {
    return {
      estado: "failure",
      descripcion: "No se pudo confirmar la versión actual de master.",
    };
  }
  if (!shaDespliegue || !shaMaster || shaDespliegue !== shaMaster) {
    return {
      estado: "failure",
      descripcion: "El despliegue quedó obsoleto frente a master.",
    };
  }
  return {
    estado: "success",
    descripcion: "Despliegue verificado y vigente en master.",
  };
}

function exigirVariable(nombre) {
  const valor = process.env[nombre];
  assert.ok(valor, `Falta la variable requerida ${nombre}.`);
  return valor;
}

async function consultarShaMaster({ token, repositorio }) {
  const response = await fetch(`https://api.github.com/repos/${repositorio}/commits/master`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`La consulta de master respondió HTTP ${response.status}.`);
  const body = await response.json();
  assert.match(body.sha ?? "", /^[a-f0-9]{40}$/, "GitHub no devolvió el SHA actual completo de master.");
  return body.sha;
}

async function publicarEstado({ token, repositorio, sha, estado, descripcion, runUrl }) {
  const response = await fetch(`https://api.github.com/repos/${repositorio}/statuses/${sha}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state: estado,
      context: CONTEXTO_ESTADO,
      description: descripcion,
      target_url: runUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub no aceptó el estado final (HTTP ${response.status}).`);
  console.log(`Estado ${estado} registrado para el SHA ${sha} en ${CONTEXTO_ESTADO}.`);
}

async function main() {
  const fase = exigirVariable("FASE_ESTADO");
  assert.ok(fase === "pendiente" || fase === "final", "FASE_ESTADO debe ser pendiente o final.");
  const token = exigirVariable("GITHUB_TOKEN");
  const repositorio = exigirVariable("GITHUB_REPOSITORY");
  const sha = exigirVariable("DEPLOYMENT_SHA");
  assert.match(repositorio, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "GITHUB_REPOSITORY no tiene un formato válido.");
  assert.match(sha, /^[a-f0-9]{40}$/, "DEPLOYMENT_SHA debe contener el SHA completo.");

  const runUrl = `${exigirVariable("GITHUB_SERVER_URL")}/${repositorio}/actions/runs/${exigirVariable("GITHUB_RUN_ID")}`;
  let resultado;
  if (fase === "pendiente") {
    resultado = { estado: "pending", descripcion: "Identidad validada; comprobación de producción en curso." };
  } else {
    let shaMaster;
    let errorConsultaMaster = false;
    try {
      shaMaster = await consultarShaMaster({ token, repositorio });
    } catch {
      errorConsultaMaster = true;
    }
    resultado = determinarEstadoFinal({
      resultadoComprobacion: process.env.RESULTADO_COMPROBACION,
      shaDespliegue: sha,
      shaMaster,
      errorConsultaMaster,
    });
  }

  await publicarEstado({
    token,
    repositorio,
    sha,
    ...resultado,
    runUrl,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`No se pudo registrar el estado de verificación: ${error.message}`);
    process.exitCode = 1;
  });
}
