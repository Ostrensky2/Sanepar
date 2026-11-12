import type { MetadataRoute } from "next";

/**
 * Permite instalar o Yva'e na tela inicial do celular. Instalado, o app abre como
 * aplicativo e o aparelho preserva melhor o que ficou guardado para o campo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yva'e Monitoramento",
    short_name: "Yva'e",
    description: "Monitoramento, campanhas e diário de campo do projeto Yva'e (ATGC e Sanepar).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#004262",
    lang: "pt-BR",
    icons: [
      { src: "/icons/yvae-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/yvae-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
