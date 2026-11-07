const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function targetUrl(value, { originOnly = false, isolatedFixture = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error("RELEASE_TARGET_INVALID"); }
  if (typeof value !== "string" || value.trim() !== value || url.username || url.password || url.search || url.hash ||
      url.pathname.includes("%") || (originOnly && url.pathname !== "/") ||
      (isolatedFixture ? url.protocol !== "http:" || !loopback.has(url.hostname) : url.protocol !== "https:")) {
    throw new Error("RELEASE_TARGET_INVALID");
  }
  return originOnly ? url.origin : url.href.replace(/\/$/, "");
}

// Approvals are independent inputs from the owners, never inferred from preview
// or its HTML. The production CLI never enables isolatedFixture.
export function releasePolicy(values, { isolatedFixture = false } = {}) {
  const preview = targetUrl(values.previewUrl, { originOnly: true, isolatedFixture });
  const approved = targetUrl(values.approvedPreviewOrigin, { originOnly: true, isolatedFixture });
  if (preview !== approved) throw new Error("RELEASE_PREVIEW_NOT_APPROVED");
  return Object.freeze({
    preview,
    g7Base: targetUrl(values.approvedG7ApiBase, { isolatedFixture }),
    gateway: targetUrl(values.approvedGatewayOrigin, { originOnly: true, isolatedFixture }),
    isolatedFixture,
  });
}

export function verifyIntegrations(policy, effective) {
  if (!effective || targetUrl(effective.g7ApiBase, { isolatedFixture: policy.isolatedFixture }) !== policy.g7Base ||
      targetUrl(effective.gatewayOrigin, { originOnly: true, isolatedFixture: policy.isolatedFixture }) !== policy.gateway) {
    throw new Error("RELEASE_INTEGRATIONS_NOT_APPROVED");
  }
}

export function verifyPreviewLocation(policy, value) {
  const url = new URL(value);
  if (url.origin !== policy.preview || !["/login", "/cupones", "/precios"].includes(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error("RELEASE_NAVIGATION_NOT_APPROVED");
  }
}

export function permittedRequest(policy, { url: value, method, resourceType }) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.username || url.password || url.hash) return false;
  if (resourceType === "document") return url.origin === policy.preview && method === "GET" && !url.search && ["/login", "/cupones", "/precios"].includes(url.pathname);
  const apiRequest = ["fetch", "xhr"].includes(resourceType) || (method === "OPTIONS" && resourceType === "other");
  const authPaths = ["login", "otp/solicitar", "otp/verificar", "refresh", "logout"].map(path => `${policy.g7Base}/auth/${path}`);
  if (authPaths.includes(url.href)) return apiRequest && (method === "POST" || method === "OPTIONS");
  if (url.origin === policy.gateway && url.pathname.startsWith("/api/v1/")) return apiRequest && (method === "GET" || method === "OPTIONS");
  if (url.origin !== policy.preview || method !== "GET" || url.search) return false;
  return ["script", "stylesheet", "image", "font"].includes(resourceType);
}

export function verifyNoRedirect(status) {
  if (status >= 300 && status < 400) throw new Error("RELEASE_REDIRECT_NOT_APPROVED");
}
