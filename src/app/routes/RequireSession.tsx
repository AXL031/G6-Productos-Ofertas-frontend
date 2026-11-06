import { useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DataModeContext } from "../config/DataModeContext";
import { useAuthSession } from "../config/useAuthSession";

export function RequireSession() {
  const mode = useContext(DataModeContext);
  // Local fixtures only: never compiled as an administrative bypass in production.
  if (import.meta.env.DEV && mode === "mock") return <Outlet />;
  return <AuthenticatedRoutes />;
}

function AuthenticatedRoutes() {
  const { session, view } = useAuthSession();
  const location = useLocation();
  const [validated, setValidated] = useState<string | null>(null);
  const key = location.key;
  const userId = view.user?.id;
  useEffect(() => {
    if (!session || !userId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const validate = async () => {
      setValidated(null);
      const token = await session.getAccessToken(controller.signal);
      if (controller.signal.aborted) return;
      if (token) setValidated(key);
      const expiresAt = session.snapshot().expiresAt;
      if (token && expiresAt) timer = setTimeout(() => { void validate().catch(() => {}); }, Math.max(1, expiresAt - Date.now()));
    };
    void validate().catch(() => {});
    return () => { controller.abort(); clearTimeout(timer); };
  }, [session, userId, key]);
  if (!view.user || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }
  if (validated !== key) {
    return <p role="status">Validando sesión…</p>;
  }
  return <Outlet />;
}
