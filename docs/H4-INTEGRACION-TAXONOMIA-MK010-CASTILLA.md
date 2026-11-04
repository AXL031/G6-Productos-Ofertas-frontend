# H4 — Recuperación e integración de Taxonomía MK-010

Fecha: 2026-11-04. Estado de esta entrega: adaptador frontend implementado y validado localmente; integración con Gateway desplegado y JWT G7 real pendientes.

## Trazabilidad

| Referencia | SHA / estado | Nota |
| --- | --- | --- |
| Frontend `master` base | `095a591a3e096614e76b4d99e623ecbba43f6c1f` | HEAD consultado antes de crear la rama. |
| Frontend PR #65 | `715ae909b1fc8cf45598c863f787b284dd2367ec` | Commit de López preservado mediante `git cherry-pick -x`. |
| Commit recuperado | `3378f19` | Único conflicto en README; se conservaron los cambios actuales de `master` y la fila nueva de Taxonomía. |
| Rama de trabajo | `castilla-mk010-gateway-h4` | Nombre alternativo: Git ya contiene la rama local `castilla`, por lo que no admite `castilla/mk010-gateway-h4` como referencia anidada. |
| Docs consultados | `cb7eec179f812d38929e20c5ab6f7a77139c4090` | OpenAPI, SPEC/HU/FLOW-010 y fuentes UX locales. |
| Backend consultado | `5abfffc9b86306df87d19695817aa678588e0341` | Solo lectura para el contrato y guías. No se modificó el repositorio Backend. |

PR #65 permanece abierta e intacta. PR #63 no fue modificada. El checkout frontend preexistente `feat/taxonomy-gateway` con siete archivos locales modificados se conservó sin cambios.

## Cambios MK-010

- `GET /api/v1/tipos-producto` valida `items`, todos los campos de `PageMeta`, tamaño y página solicitados, cantidad de resultados, total estable entre páginas, IDs no vacíos y únicos, nombres no vacíos, `schemaVersion` positivo y estados publicados `ACTIVO`/`INACTIVO`.
- Paginación usa tamaño 200, el máximo de OpenAPI. No hay límite artificial de páginas ni truncamiento silencioso. Características asignadas y límite quedan no disponibles porque el endpoint no los entrega.
- Cada consulta tiene timeout acotado y comparte cancelación con la señal del hook. La UI conserva loading, éxito, lista vacía, error visible y reintento; el modo `api` nunca cambia a fixtures ante un fallo.
- La sesión G7 humana existente se reutiliza. Solo ante `401 TOKEN_INVALIDO` se renueva y repite el GET una vez; errores 401 desconocidos, 403, 5xx, conexión fallida y ausencia de sesión no se reintentan. Las rutas administrativas MK-008, MK-009, MK-011 y MK-012 y operaciones MK-010 sin adapter permanecen cerradas en API.
- `test:unit:taxonomy` quedó agregado a `npm test`; el workflow existente ya ejecuta ese comando. No se editó `.github/workflows/frontend.yml` ni la configuración de CI atomizada.

## Contrato y seguridad pendientes

El OpenAPI de Docs en el SHA citado define `listarTiposProducto` como `userBearer`; `TipoProductoAdmin.estado` referencia `EstadoEntidad` (`ACTIVO`, `INACTIVO`). Backend debe homologar cualquier discrepancia del runtime del provider antes de admitir nuevos estados. En particular, el frontend rechaza estados no publicados; la lista no puede mostrar `PENDING_DEACTIVATION` hasta que Docs publique un enum específico y se acuerde su forma con el owner Taxonomy.

La política H4 `RESTRICTED_DEMO` y Backend #144 fueron leídos. Esta rama no implementa bypass, token técnico, acceso anónimo ni secretos. La prueba positiva con JWT G7 real, el grant del Gateway y la homologación de cualquier divergencia de estado siguen pendientes.

## Validaciones locales

Entorno: Node `v24.3.0`, npm `11.4.2`. `npm ci` terminó, pero emitió `EBADENGINE`: el repositorio requiere Node `>=22.12.0 <23`. También reportó 13 advisories (12 moderados, 1 alto); no se cambiaron dependencias.

| Comando | Resultado |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:unit:taxonomy` | PASS, 36 tests |
| `npm test` | PASS, 416 tests en los seis grupos configurados |
| `$env:VITE_DATA_MODE='mock'; npm run build` | PASS |
| `$env:VITE_DATA_MODE='api'; npm run build` | PASS |
| `npx playwright test tests/taxonomy-mk010.spec.ts tests/taxonomy-ui.spec.ts --workers=1` | PASS, 40 tests; pruebas UI/mock y viewport 1440×900, no integración de Gateway |
| `node scripts/ci/run-taxonomy-integration.mjs` en Backend | PASS, 39/39 con PostgreSQL desechable, checkout `feat/bulk-h4-cierre-http` en SHA `ca1c5a6fd0bf304267007f9b017f5780fb25f538`; prueba del provider, no del flujo Frontend→Gateway |

Docker está disponible. No se halló un harness ejecutable de Frontend→Gateway→Taxonomy local en los archivos inspeccionados; no se levantó el compose Oracle porque requiere imágenes/variables externas y monta una CA runtime de Oracle. No se contactó Supabase, Gateway compartido ni servicios desplegados.

## Estado por capa

| Capa | Estado |
| --- | --- |
| MOCK | Preservado en modo `mock`; cubierto por Playwright UI. |
| ADAPTER | Implementado; validación, cancelación, timeout, errores y renovación limitada cubiertos por tests simulados. |
| API / Gateway | No verificado con Gateway real; route/contrato consultados no prueban servicio activo ni grant. |
| JWT | Usa el runtime de sesión humana G7; no hay prueba con JWT emitido por G7 ni scope real. |
| E2E | No existe evidencia desplegada Frontend→Gateway→Taxonomy. El harness de PostgreSQL solo valida el provider backend aislado. |

La ejecución CI remota, el SHA final y la URL de la PR se reportarán en la entrega después de publicar la rama. No se fusionará ninguna PR ni se cerrarán issues.
