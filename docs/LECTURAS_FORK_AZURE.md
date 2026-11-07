# Consultas mínimas del fork sobre Azure

La ruta `/consultas`, accesible desde el menú e inicio del modo API, reúne las
58 operaciones GET externas de OpenAPI `0.6.0-rc.3`, Docs
`aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1`. Incluye listados, detalle, filtros,
paginación contractual, seguimiento y descargas existentes de los ocho servicios.
La operación interna `obtenerContextoSku` y todas las mutaciones están excluidas.
No crea importaciones, exportaciones ni datos de prueba.

Se reutilizan el login y la sesión G7 en memoria. Cada consulta envía el bearer
al Gateway, que conserva sus autorizaciones. Un 403 no renueva la sesión; una
respuesta TOKEN_INVALIDO admite una sola renovación del GET. No hay fallback
mock ni se inventan campos administrativos a partir de DTO comerciales.
El resultado se muestra con los campos del servicio, distinguiendo null, cero,
colección vacía, error y último resultado confirmado. Las colecciones se limitan
visualmente a 200 filas; el usuario puede aplicar la paginación del servicio.

`vercel.json` fija explícitamente el build API y las dos URLs públicas. No son
secretos. Los secretos y JWT no forman parte del build. En dominios `vercel.app`,
las llamadas a Azure y G7 pasan por rewrites de mismo origen para evitar CORS,
sin cambiar sus destinatarios finales. Las respuestas dinámicas usan no-store.
Fuera de Vercel se mantienen los orígenes explícitos configurados.

Esta entrega conserva imágenes e infraestructura existentes. La compilación y
las pruebas del consumidor no acreditan que los 58 endpoints respondan con los
roles disponibles ni que las dependencias de Azure estén listas. Los permisos,
datos, integraciones M2M y endpoints no desplegados pueden rechazar consultas;
se muestra el error real. Para validar producción se necesita una sesión G7
legítima y el deployment nuevo de master del fork.
