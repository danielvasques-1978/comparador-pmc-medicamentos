import type { NextConfig } from "next";
import path from "path";

// Política de conteúdo. O site não carrega nada de fora — sem fontes, scripts
// ou imagens externas —, então tudo fecha em 'self'. A exceção é script-src:
// o App Router injeta scripts inline de hidratação em toda página, e sem nonce
// (que obrigaria a renderizar a home a cada requisição) só 'unsafe-inline' os
// libera. Estilos não precisam disso: não há style inline no HTML gerado.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  distDir: process.env.VERCEL ? ".next" : ".next-local",
  outputFileTracingRoot: path.join(__dirname),
  // "X-Powered-By: Next.js" só serve para dizer ao atacante qual framework é.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
