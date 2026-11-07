import { releasePolicy } from "./release-login-policy.mjs";
import { verifyReleaseLogin } from "./release-login-check.mjs";

// No HTTP/test exception is accepted by this production entry. Approvals come
// from owners independently of the preview URL and its public metadata.
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--mfa-manual")) throw new Error("RELEASE_ARGUMENT_INVALID");
  const policy = releasePolicy({
    previewUrl: process.env.G6_RELEASE_PREVIEW_URL,
    approvedPreviewOrigin: process.env.G6_RELEASE_APPROVED_PREVIEW_ORIGIN,
    approvedG7ApiBase: process.env.G6_RELEASE_APPROVED_G7_API_BASE,
    approvedGatewayOrigin: process.env.G6_RELEASE_APPROVED_GATEWAY_ORIGIN,
  });
  const result = await verifyReleaseLogin(policy, {
    email: process.env.G6_RELEASE_TEST_EMAIL,
    password: process.env.G6_RELEASE_TEST_PASSWORD,
    manualMfa: args[0] === "--mfa-manual",
    onMfaPending: () => console.log("MFA pendiente: el operador autorizado debe solicitar y escribir el código real en esta misma ventana. No se registra el código."),
  });
  console.log(result.mfaCompleted
    ? "PASS aceptación de login con desafío MFA real completado, lectura, navegación y logout. Revisar acta bilateral y cada provider."
    : "PASS login, lectura, navegación y logout en destinos aprobados. No acredita aceptación MFA ni homologación general.");
} catch (error) {
  // Browser errors can contain form values or URLs: never print raw messages.
  console.error(error instanceof Error && error.message === "RELEASE_MFA_PENDING"
    ? "NO APTO PARA LIBERAR: desafío MFA pendiente; requiere intervención bilateral autorizada."
    : "NO APTO PARA LIBERAR: configuración, destinos, redirecciones o recorrido no verificados. No se registraron credenciales.");
  process.exitCode = 1;
}
