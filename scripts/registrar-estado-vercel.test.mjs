import test from "node:test";
import assert from "node:assert/strict";
import { determinarEstadoFinal, CONTEXTO_ESTADO } from "./registrar-estado-vercel.mjs";

const shaVigente = "a".repeat(40);
const shaObsoleto = "b".repeat(40);

test("publica éxito cuando el smoke pasa y el SHA sigue vigente", () => {
  assert.deepEqual(
    determinarEstadoFinal({ resultadoComprobacion: "success", shaDespliegue: shaVigente, shaMaster: shaVigente }),
    { estado: "success", descripcion: "Despliegue verificado y vigente en master." },
  );
});

test("publica fallo cuando falla la comprobación remota", () => {
  for (const resultadoComprobacion of ["failure", "cancelled", "skipped", "timed_out"]) {
    assert.equal(
      determinarEstadoFinal({ resultadoComprobacion, shaDespliegue: shaVigente, shaMaster: shaVigente }).estado,
      "failure",
      resultadoComprobacion,
    );
  }
});

test("publica fallo cuando el SHA quedó obsoleto", () => {
  const resultado = determinarEstadoFinal({
    resultadoComprobacion: "success",
    shaDespliegue: shaObsoleto,
    shaMaster: shaVigente,
  });
  assert.equal(resultado.estado, "failure");
  assert.match(resultado.descripcion, /obsoleto/);
});

test("publica fallo si no se pudo consultar master", () => {
  assert.equal(
    determinarEstadoFinal({
      resultadoComprobacion: "success",
      shaDespliegue: shaVigente,
      errorConsultaMaster: true,
    }).estado,
    "failure",
  );
});

test("conserva el contexto de control configurado en Vercel", () => {
  assert.equal(CONTEXTO_ESTADO, "verificacion-despliegue-produccion");
});
