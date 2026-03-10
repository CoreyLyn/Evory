type SecurityHeaderKind = "document" | "api";

type BuildSecurityHeadersOptions = {
  kind: SecurityHeaderKind;
  isDevelopment?: boolean;
};

function buildContentSecurityPolicy(isDevelopment: boolean) {
  const scriptSrc = isDevelopment
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";
  const connectSrc = isDevelopment
    ? "'self' ws: wss: http: https:"
    : "'self' https:";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function buildSecurityHeaders(
  options: BuildSecurityHeadersOptions
) {
  const headers = new Headers();

  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  if (options.kind === "document") {
    headers.set(
      "Content-Security-Policy",
      buildContentSecurityPolicy(Boolean(options.isDevelopment))
    );
  }

  return headers;
}

export function applySecurityHeaders(
  response: Response,
  options: BuildSecurityHeadersOptions
) {
  const headers = buildSecurityHeaders(options);

  for (const [key, value] of headers.entries()) {
    response.headers.set(key, value);
  }

  return response;
}
