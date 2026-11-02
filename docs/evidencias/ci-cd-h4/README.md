# Evidencia de CI/CD — Hito 4

**Fecha:** 2026-11-01  
**Rama:** `ci/atomizar-validaciones-y-verificar-despliegue-vercel`  
**Base:** `origin/master` en `e171a20836042fcf95b526c668e0c4c2f6832d96`  
**Solicitud de incorporación:** pendiente de publicar la rama.  
**Ejecución de GitHub Actions:** pendiente; se agregará el enlace y el SHA probado
después de abrir la solicitud de incorporación en borrador.  
**Controles de Vercel:** pendientes de configuración y ejecución real.

Este registro es nuevo y no reemplaza la evidencia histórica del 16/10 en
[`VALIDACION_VERCEL.md`](../../VALIDACION_VERCEL.md).

## Flujos y trabajos configurados

### Integración continua del frontend

- `Revisión de estilo`
- `Comprobación de tipos`
- `Pruebas unitarias - Combos`
- `Pruebas unitarias - Carga masiva`
- `Pruebas unitarias - Inventario`
- `Pruebas unitarias - Precios`
- `Compilación - Datos de demostración`
- `Compilación - Integración con API`
- `Verificación de compilación local`
- `Pruebas rápidas de interfaz`
- `Pruebas de extremo a extremo (parte 1 de 3)`
- `Pruebas de extremo a extremo (parte 2 de 3)`
- `Pruebas de extremo a extremo (parte 3 de 3)`
- `Validación integral de integración continua`

El agregador revisa los once resultados obligatorios. Se comprobó su criterio con
los once en `success` y con una dependencia en `failure`, `cancelled` y `skipped`:
solo todos en `success` aprueban. En GitHub, una matriz incompleta o omitida debe
aparecer como `skipped` y hacer fallar el agregador.

### Verificación de despliegues de Vercel

- `Identificar versión y procedencia del despliegue`
- `Comprobar funcionamiento del despliegue`
- `Registrar resultado de verificación`
- Contexto de estado reservado para Vercel: `verificacion-despliegue-produccion`

El flujo consulta la API autenticada de Vercel, comprueba que el SHA siga siendo
el HEAD de `master` antes de publicar el estado y usa solo la URL inmutable
devuelta por la API. La ejecución real está pendiente: el flujo de
`repository_dispatch` debe estar en la rama por defecto y necesita credenciales,
variables y Deployment Checks configurados. No se declara prueba de producción.

## Validaciones locales ejecutadas

Las verificaciones de código se ejecutaron con Node.js `22.21.1` en la rama de
trabajo basada en `e171a20836042fcf95b526c668e0c4c2f6832d96`.

| Verificación | Resultado |
|---|---|
| `npm ci` | Correcto. Instaló 255 paquetes; el lockfile no cambió. npm informó 13 vulnerabilidades de dependencias (12 moderadas, 1 alta); no se actualizaron paquetes. |
| `npm run lint` | Correcto, código de salida 0. |
| `npm run typecheck` | Correcto, código de salida 0. |
| `npm test` | Correcto: 370 pruebas en 11 archivos (Combos 56, Carga masiva 51, Inventario 108, Precios 155). |
| Compilación `VITE_DATA_MODE=mock` | Correcto. |
| Compilación `VITE_DATA_MODE=api` | Correcto. |
| `npx playwright test --grep '@smoke' --workers=1` | Correcto: 8 pruebas. |
| `scripts/verify-production.mjs mock` contra vista previa local | Correcto: 58 vistas, 1440×900, sin errores. |
| `scripts/vercel-smoke.mjs http://127.0.0.1:5174` | Correcto: 5 rutas, recarga de `/productos`, 49 recursos JS/CSS y cero errores de aplicación o red. |
| `scripts/verify-production.mjs api` contra vista previa local | Correcto: 53 vistas, providers ausentes explícitos y sin retorno a mocks. |
| Suite E2E completa en 3 fragmentos | No completada localmente: el primer fragmento se interrumpió en 67/177 casos por duración, sin fallo observado. Queda pendiente el resultado completo del PR en GitHub. |
| YAML y grafo de dependencias | Los tres YAML se analizaron correctamente; se verificó el catálogo de trabajos, nombres de pasos y grafo del agregador. El criterio del agregador pasó los cuatro escenarios indicados arriba. |
| Scripts JavaScript | `node --check` correcto para los tres scripts de verificación. |
| Diff | `git diff --check` correcto. |

La prueba rápida anterior se ejecutó contra la vista previa local de datos de
demostración. No es evidencia de un deployment real ni de integración HTTP con
Backend.

## Inspecciones remotas de solo lectura

- GitHub, 2026-11-01: `master` devolvió `404 Branch not protected`; el listado
  de rulesets del repositorio fue `[]`. No se modificaron las reglas.
- Vercel, 2026-11-01: se encontró el proyecto `g6-productos-ofertas`. El listado
  mostró el deployment de Production más reciente como `READY`, rama `master`,
  SHA `e171a20836042fcf95b526c668e0c4c2f6832d96`, ID
  `dpl_zw8smikrJGuE7sjfn1MB5tbDtzeB` y URL
  `https://g6-productos-ofertas-6j2jrpc90-marecahu02-9205s-projects.vercel.app`.
  Es metadata de listado, no un smoke; no se abrió esa URL ni se confirmó el alias.
- La lectura detallada del deployment y la del equipo respondieron `403` por
  autorización de la conexión Vercel. No se comprobó el plan ni la disponibilidad
  de Deployment Checks.
- El proyecto informa protección SSO para los dominios de deployment que no son
  personalizados. El secreto de Protection Bypass for Automation no está
  configurado en GitHub. Por eso no se ejecutó una prueba remota.

## Configuración externa pendiente

1. Publicar la rama, abrir la solicitud de incorporación en borrador a `master`
   y verificar que el trabajo `Validación integral de integración continua`
   aparece con ese nombre.
2. Proteger `master` con esa comprobación, PR, aprobación, conversaciones
   resueltas y rama actualizada; bloquear force-push y borrado según el plan y
   los permisos.
3. Crear el entorno GitHub `vercel-produccion`, restringido a `master`, con los
   secretos `VERCEL_TOKEN` y `VERCEL_AUTOMATION_BYPASS_SECRET`, y las variables
   no secretas `VERCEL_PROJECT_ID` y `VERCEL_TEAM_ID`.
4. Confirmar en Vercel que Deployment Checks están disponibles; mantener la
   integración Git y la asignación automática de alias; exigir la comprobación
   GitHub Actions y el estado `verificacion-despliegue-produccion` antes de
   asignar Production.
5. Verificar que un deployment rechazado quede sin el alias de Production y que
   la versión anterior siga atendiendo el dominio. No usar Force Promote como
   operación normal.
6. Después de una promoción, registrar SHA → despliegue → alias → prueba rápida
   con el enlace del flujo real. Un estado `READY` o un HTTP 200 de `/` no bastan.

