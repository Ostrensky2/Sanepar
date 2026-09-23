import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Endereços antigos, mantidos para links salvos. Temporários (307) para não serem cacheados.
  async redirects() {
    return [
      { source: "/campanhas", destination: "/campanhas/campo", permanent: false },
      { source: "/diario-de-campo", destination: "/dados/diario-de-campo", permanent: false },
      { source: "/campanhas/diario-de-campo", destination: "/dados/diario-de-campo", permanent: false },
      { source: "/acoes-pontuais/ver", destination: "/acoes-pontuais", permanent: false },
      { source: "/acoes-pontuais/registrar", destination: "/dados/acoes-pontuais", permanent: false },
      // Módulo Solicitações removido (23/09/2026): links salvos vão para Suporte.
      { source: "/solicitacoes", destination: "/suporte", permanent: false },
      // Planilhas de campo entram só pelo Diário de campo (importador único).
      { source: "/dados/campo", destination: "/dados/diario-de-campo?importar=1", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ] }, { source: "/dashboards/Painel_eDNA_Campanha1_Sanepar.html", headers: [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ] }];
  },
};

export default nextConfig;
