import type { G7Session } from "../../promotions/adapters/g7Session";
import { createCatalogFetchTransport, type CatalogHttpTransport } from "./catalogHttp";

// Keep the public read demo on its existing transport. Administration uses G7.
export function createAuthenticatedCatalogTransport(origin: string, session: G7Session): CatalogHttpTransport {
  const transport = createCatalogFetchTransport(origin);
  return {
    async request(path, init) {
      let token = await session.getAccessToken(init.signal);
      if (!token) throw new Error("Inicia sesión para continuar.");
      const send = () => transport.request(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
      let response = await send();
      if (response.status === 401) {
        const problem: unknown = await response.clone().json().catch(() => null);
        if (problem && typeof problem === "object" && "code" in problem && problem.code === "TOKEN_INVALIDO") {
          if (init.method === "GET") {
            token = await session.refreshAccessToken(token, init.signal);
            if (!token) return response;
            response = await send();
          }
          if (response.status === 401 && token) session.invalidateAccessToken(token);
        }
      }
      // No automatic write replay; a 403 preserves the session and backend denial.
      return response;
    },
  };
}
