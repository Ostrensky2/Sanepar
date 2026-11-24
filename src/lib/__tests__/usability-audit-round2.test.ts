import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatSiaCode } from "@/components/field-diary/calendar";
import { documentReference } from "@/components/document-repository";
import { navigationItems } from "@/lib/navigation";
import { conditionOfUseParts } from "@/modules/results/components/results-index-dashboard";

describe("auditoria de usabilidade — 2ª rodada", () => {
  it("remove o módulo Solicitações do menu, das rotas e do selo", () => {
    expect(navigationItems.map((item) => item.href)).not.toContain("/solicitacoes");
    const config = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
    expect(config).toContain('{ source: "/solicitacoes", destination: "/suporte", permanent: false }');
    const sidebar = readFileSync(new URL("../../components/sidebar-nav.tsx", import.meta.url), "utf8");
    expect(sidebar).not.toContain("support-requests");
  });

  it("mostra o ponto sempre como SIA-0000 e esconde textos de preenchimento dos documentos", () => {
    expect(["782", "SIA-782", "SIA 0782", 782].map(formatSiaCode)).toEqual(["SIA-0782", "SIA-0782", "SIA-0782", "SIA-0782"]);
    expect(formatSiaCode("Ponto sem código")).toBe("Ponto sem código");
    expect(documentReference({ campaign: "Não se aplica", point: "Não se aplica" })).toEqual({ main: "", detail: "" });
    expect(documentReference({ campaign: "Campanha 1", point: "Repositório oficial" })).toEqual({ main: "Campanha 1", detail: "" });
    expect(documentReference({ campaign: "Documento inserido", point: "Represa do Passaúna" })).toEqual({ main: "Represa do Passaúna", detail: "" });
  });

  it("troca a condição de uso técnica por selo e frase comum", () => {
    expect(conditionOfUseParts("Provisório; qualidade não informada")).toEqual({ label: "Provisório", detail: "o laboratório ainda não informou a qualidade dos conjuntos; os valores podem mudar" });
    expect(conditionOfUseParts("Aprovado")).toEqual({ label: "Aprovado", detail: "" });
  });

});
