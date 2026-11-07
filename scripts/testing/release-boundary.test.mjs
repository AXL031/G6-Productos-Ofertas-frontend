import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { releasePolicy } from "../release-login-policy.mjs";
import { verifyReleaseLogin } from "../release-login-check.mjs";

// Deliberately small hostile HTML fixtures test the verifier, not the frontend
// or G7 protocol. Real compiled frontend coverage lives in verify-production-auth.
async function fixture(scenario, work) {
  const seen = { entered: 0, login: 0, authenticatedRead: 0, logout: 0, outside: 0 };
  const outside = createServer((_req, res) => { seen.outside++; res.end("outside"); });
  outside.listen(0, "127.0.0.1"); await once(outside, "listening");
  const redirect = res => { res.writeHead(307, { Location: `http://127.0.0.1:${outside.address().port}/collect` }); res.end(); };
  let origin;
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    if (req.url === "/g7/api/v1/auth/login") {
      if (req.method === "OPTIONS") { if (scenario === "g7-redirect") redirect(res); else res.writeHead(204).end(); return; }
      if (raw === "input-observed") { seen.entered++; res.end("{}"); return; }
      seen.login++;
      if (scenario === "auth-redirect") { redirect(res); return; }
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ mfaRequerido: scenario === "mfa-pending" })); return;
    }
    if (req.url === "/g7/api/v1/auth/logout") { seen.logout++; res.writeHead(204).end(); return; }
    if (req.url === "/api/v1/cupones") {
      if (!req.headers.authorization) {
        if (scenario === "gateway-redirect") redirect(res); else res.writeHead(401).end("{}"); return;
      }
      seen.authenticatedRead++;
      if (scenario === "read-redirect") { redirect(res); return; }
      res.setHeader("Content-Type", "application/json"); res.end("{}"); return;
    }
    if (scenario === "preview-redirect") { redirect(res); return; }
    const effective = { g7ApiBase: scenario === "wrong-g7" ? "http://localhost:1/other" : origin + "/g7/api/v1", gatewayOrigin: scenario === "wrong-gateway" ? "http://localhost:2" : origin };
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><meta name="g6-auth-integrations" content='${JSON.stringify(effective)}'><main id="root"></main>
      <script>
        const root=document.getElementById('root');
        function login(){root.innerHTML='<h1>Iniciar sesión</h1><form><label>Correo electrónico<input id="email" aria-label="Correo electrónico" role="textbox" type="email"></label><label>Contraseña<input id="password" aria-label="Contraseña" role="textbox" type="password"></label><button>Ingresar al panel</button></form>';
          ${["wrong-g7", "wrong-gateway", "g7-redirect", "gateway-redirect"].includes(scenario) ? "root.addEventListener('input',()=>fetch('/g7/api/v1/auth/login',{method:'POST',body:'input-observed'}));" : ""}
          root.querySelector('form').onsubmit=async(event)=>{event.preventDefault();
            const response=await fetch('/g7/api/v1/auth/login',{method:'POST',body:JSON.stringify({correo:document.getElementById('email').value,contrasena:document.getElementById('password').value})});
            const dto=await response.json(); if(dto.mfaRequerido){root.innerHTML='<h1>Verificar identidad</h1><input aria-label="Código de verificación">';return;}
            await fetch('/api/v1/cupones',{headers:{Authorization:'Bearer synthetic-only'}});
            root.innerHTML='<nav aria-label="Navegación de la aplicación"><a id="prices" href="/precios">Consultar precios</a></nav><h1>Cupones de descuento</h1><button id="logout">Cerrar sesión</button>';
            document.getElementById('prices').onclick=e=>{e.preventDefault();history.pushState(null,'','/precios');root.querySelector('h1').textContent='Gestión de precios';};
            document.getElementById('logout').onclick=async()=>{await fetch('/g7/api/v1/auth/logout',{method:'POST',body:'{}'});history.replaceState(null,'','/login');login();};
          };}
        login();
      </script>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${server.address().port}`;
  const policy = releasePolicy({ previewUrl: origin, approvedPreviewOrigin: origin, approvedG7ApiBase: origin + "/g7/api/v1", approvedGatewayOrigin: origin }, { isolatedFixture: true });
  try { await work(policy, seen); }
  finally { server.closeAllConnections(); outside.closeAllConnections(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => outside.close(r))]); }
}
const credentials = { email: "synthetic@example.test", password: "synthetic-test-only" };

test("recorrido positivo solo con fixture explícito, sin afirmar MFA", async () => {
  await fixture("normal", async (policy, seen) => {
    const result = await verifyReleaseLogin(policy, credentials);
    assert.deepEqual(result, { isolatedFixture: true, mfaCompleted: false });
    assert.equal(seen.login, 1); assert.equal(seen.authenticatedRead, 1); assert.equal(seen.logout, 1); assert.equal(seen.outside, 0);
  });
});
for (const scenario of ["wrong-g7", "wrong-gateway", "preview-redirect", "g7-redirect", "gateway-redirect"]) {
  test(`${scenario}: rechaza antes de introducir credenciales`, async () => {
    await fixture(scenario, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials));
      assert.equal(seen.entered, 0); assert.equal(seen.login, 0); assert.equal(seen.outside, 0);
    });
  });
}
for (const scenario of ["auth-redirect", "read-redirect"]) {
  test(`${scenario}: nunca reenvía el cuerpo ni sigue Location`, async () => {
    await fixture(scenario, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials));
      assert.equal(seen.login, 1); assert.equal(seen.outside, 0);
    });
  });
}
test("un desafío MFA pendiente nunca es PASS", async () => {
  await fixture("mfa-pending", async (policy, seen) => {
    await assert.rejects(verifyReleaseLogin(policy, credentials), { message: "RELEASE_MFA_PENDING" });
    assert.equal(seen.authenticatedRead, 0); assert.equal(seen.logout, 0); assert.equal(seen.outside, 0);
  });
});
