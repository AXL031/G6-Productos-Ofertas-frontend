# Aceptación bilateral de login, MFA y sesión G7

Procedimiento para el PR #70. **Pendiente de ejecución con G7/Gateway reales**.
Los fixtures locales y un desafío pendiente nunca acreditan esta aceptación.
No se modifican MFA, Backend, Supabase, infraestructura ni despliegues desde este repositorio.

## Responsables y autorización previa

Participan el responsable de Frontend/G6 y un operador autorizado por G7, con el
owner de Gateway disponible para verificar autorización y revocación. Antes de
la sesión acuerdan y registran, sin secretos:

1. SHA revisado, artefacto correspondiente y configuración candidata. El owner
   verifica la procedencia del artefacto mediante su registro autorizado; el
   hostname o el metadato del HTML no sustituyen esa comprobación.
2. **Origen HTTPS exacto** del preview, incluida la pareja host/puerto; base HTTPS
   completa publicada de G7, incluido su prefijo API; origen HTTPS de Gateway.
   Las tres aprobaciones proceden de los owners, **no se copian del preview para
   legitimarlo**. No usar comodines ni dominios por sufijo.
3. Cuenta de prueba humana autorizada con `GESTOR_COMERCIAL` y MFA efectivamente
   requerido por G7. El operador controla el buzón/dispositivo correspondiente.
   No usar tokens de servicio, OTP fijo, desactivar MFA ni cambiar grants.
4. Ventana de prueba, operaciones permitidas, límites de intentos y criterios
   de revocación. La ejecución automática hace lecturas; no mutaciones comerciales.

Si faltan esos acuerdos, el estado sigue **NO EJECUTADO / NO HOMOLOGADO**. Este
procedimiento no autoriza por sí mismo a usar credenciales reales en cualquier URL.

## Configuración y entrada segura

Utilizar una consola de confianza y las URLs aprobadas, fuera de Vite:

```powershell
$env:G6_RELEASE_APPROVED_PREVIEW_ORIGIN = '<origen HTTPS aprobado por Frontend>'
$env:G6_RELEASE_PREVIEW_URL = '<mismo origen HTTPS exacto>'
$env:G6_RELEASE_APPROVED_G7_API_BASE = '<base HTTPS completa aprobada por G7>'
$env:G6_RELEASE_APPROVED_GATEWAY_ORIGIN = '<origen HTTPS aprobado por Gateway>'
$env:G6_RELEASE_TEST_EMAIL = Read-Host 'Correo de prueba autorizado'
$mfaAcceptancePassword = Read-Host 'Contraseña' -AsSecureString
try {
  $env:G6_RELEASE_TEST_PASSWORD = [System.Net.NetworkCredential]::new('', $mfaAcceptancePassword).Password
  npm run verify:release:login -- --mfa-manual
} finally {
  Remove-Item Env:G6_RELEASE_TEST_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:G6_RELEASE_TEST_EMAIL -ErrorAction SilentlyContinue
  $mfaAcceptancePassword.Dispose()
}
```

No escribir contraseñas en argumentos, historial, Vite, archivos, capturas o
grabaciones. El script usa un contexto nuevo sin trazas, HAR, videos ni capturas;
no muestra errores crudos del navegador ni cuerpos de respuesta.

Antes de rellenar correo/contraseña, el verificador:

- exige aprobaciones independientes y HTTPS con validación de certificado normal;
- rechaza userinfo, queries/fragments y orígenes distintos del aprobado;
- comprueba el preview sin seguir redirecciones y su URL efectiva en el navegador;
- compara `g6-auth-integrations`, publicado desde la configuración que usan los
  transports, con las bases aprobadas de G7 y Gateway;
- sondea sin credenciales `OPTIONS <G7>/auth/login` y `GET <Gateway>/api/v1/cupones`,
  sin seguir redirecciones;
- limita el tráfico efectivo a documentos/recursos del preview, endpoints G7
  publicados y lecturas de Gateway. Rechaza redirecciones HTTP también después
  del login: nunca reenvía un POST a un `Location` por 307/308 y no reintenta peticiones.

Un destino no verificado, un certificado no válido, una redirección o una
configuración efectiva distinta causa fallo cerrado; **no corregirlo introduciendo
excepciones generales**. Coordinar la configuración/contrato con el owner.

## Desafío real e intervención del operador

1. El script abre una ventana visible después de validar la política y envía las
   credenciales únicamente al G7 aprobado. G7 debe emitir un desafío MFA real.
2. Mientras el desafío esté pendiente, comprobar que no hay menú administrativo
   ni acceso a módulos. Un desafío pendiente no es login exitoso.
3. El operador solicita el código desde **esa misma ventana** y comprueba recepción
   por el canal acordado. El script no solicita ni introduce OTP por su cuenta.
4. El operador introduce el código real recibido en la UI y confirma. No se
   comparte por chat ni se registra en el acta. No inspeccionar ni exportar el
   cuerpo de las peticiones de autenticación.
5. El modo manual espera como máximo 180 s después del desafío. Si se cancela,
   vence el plazo, falla la red, falta autorización o no aparece MFA, el recorrido
   no acredita aceptación MFA. No existe fallback a un código sintético.
6. Solo tras MFA completado, sesión y menú presentes, lectura HTTP de Cupones
   confirmada en Gateway, navegación y logout puede aparecer el PASS de ese
   recorrido. **El PASS del script requiere además la revisión bilateral del acta**;
   no homologa otros providers, reglas comerciales o despliegues.

Sin `--mfa-manual`, el gate rechaza un desafío pendiente y sale con código 1.
Con `--mfa-manual`, que G7 no emita desafío también impide acreditar MFA.

## Casos positivos y negativos de aceptación

Con autorización y límites de intentos de G7, registrar el resultado de cada caso:

| Caso | Evidencia esperada, sin secretos |
|---|---|
| Desafío real pendiente | Fecha/hora y referencia segura acordada con G7; ningún panel ni operación privada. |
| OTP incorrecto autorizado / expirado | Rechazo de G7; error anunciado y foco en feedback; sin sesión administrativa. No inventar ni registrar valores OTP. |
| Cancelación del desafío | Regresa al login con mensaje de cancelación; no anuncia cierre de una sesión que no existía. |
| OTP real válido | G7 confirma la sesión, aparece identidad autorizada y Gateway acepta la lectura. |
| Rol insuficiente | Sin panel; permisos no inferidos por el frontend. Usar otra cuenta aprobada por el owner, sin editar grants para probar. |
| Refresh exitoso demorado | Borrador y mismo nodo de formulario/shell se conservan; transport espera token válido. |
| Refresh rechazado / permiso retirado | Panel y borrador retirados; ninguna escritura repetida. |
| Logout | Sesión local descartada, atrás/recarga no restauran acceso. G7/Gateway verifican revocación efectiva conforme a su contrato, sin exportar tokens. |
| Origen, bases o redirect distintos | Gate rechazado antes de introducir credenciales o antes de seguir la redirección; corregir con el owner. |

No repetir una escritura de resultado incierto ni refrescar tokens consumidos
para “hacer pasar” la prueba. Los tests de seguridad negativos del verificador
se ejecutan en fixtures locales; no dirigir intentos a servicios de terceros.

## Acta mínima y decisión bilateral

Registrar únicamente: fecha/hora, participantes y autorización, SHA/artefacto,
URLs aprobadas sin secretos, configuración efectiva coincidente, versión del
contrato, casos ejecutados, PASS/FAIL/NO EJECUTADO, incidencias y referencias de
soporte autorizadas. **Nunca** contraseñas, OTP, access/refresh/challenge tokens,
HAR/trazas de autenticación, cookies o cuerpos completos de login.

Frontend y G7/Gateway firman o aprueban el acta por su canal acordado. Cualquier
fallo P1, desafío sin completar o comprobación obligatoria no ejecutada deja la
aceptación pendiente. No hacer merge ni despliegue como parte de este procedimiento.

## Distinción respecto de fixtures

`scripts/testing/verify-isolated-release.mjs` acepta exclusivamente HTTP loopback
explícito y credenciales sintéticas literales. No lee correo/contraseña reales del
entorno. El CLI productivo no tiene flag ni variable que active ese modo.
`test:release:policy`, `test:release:boundary` y `test:production:auth` comprueban
código y contratos aislados; **no firman esta acta ni sustituyen el desafío real**.
