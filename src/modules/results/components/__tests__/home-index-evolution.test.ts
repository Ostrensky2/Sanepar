import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResultPoint, ResultsCampaign } from "@/modules/results";
import { HomeIndexEvolution, EVOLUTION_SERIES, EVOLUTION_HELP, evolutionExclusions, evolutionSeries, evolutionPointOptions, evolutionSiaKey, evolutionBarStyle } from "../home-index-evolution";
import { ResultsReviewDialog } from "@/components/results-review-dialog";

const complete = (sia: string, value: number): ResultPoint => ({
  campaignCode: "C2", siaCode: sia, municipality: "Curitiba", waterBody: "Rio Iraí",
  calculationVersion: "SANEPAR-INDICE-0.3", completeness: "complete",
  overall: { value, lower: value, upper: value, rank: null },
} as ResultPoint);
const partial = { ...complete("SIA-0559", 0.5), completeness: "partial_2", overall: { value: null, lower: 0.519230121182, upper: 0.776719365641, rank: null } } as ResultPoint;
const campaign = { campaignCode: "C2", points: [complete("SIA-1037", 0.2), complete("SIA-3051037", 0.6), partial] } as ResultsCampaign;

describe("Home evolution: general index only and independent point search", () => {
  it("keeps only overall, descriptive finite complete mean and actual inclusion counts", () => {
    expect(EVOLUTION_SERIES.map((item) => item.key)).toEqual(["overall"]);
    expect(evolutionSeries(campaign)[0]).toMatchObject({ range: { value: 0.4 }, included: 2, excluded: 1 });
    expect(evolutionSeries(campaign, "1037")[0].range?.value).toBe(0.2);
    expect(evolutionSeries(campaign, "3051037")[0].range?.value).toBe(0.6);
    expect(evolutionSeries(campaign, "absent")[0].range).toBeNull();
    expect(evolutionSeries(undefined, "559")[0].range).toBeNull();
    expect(evolutionSeries({ ...campaign, campaignCode: "C1" }, "559")[0].range).toBeNull();
    expect(evolutionSeries(campaign, null)[0].range?.value).toBe(0.4);
  });
  it("uses C2 SIA0559 published general bounds as a floating interval, never midpoint or zero", () => {
    const range = evolutionSeries(campaign, "559")[0].range!;
    expect(range).toEqual({ value: null, lower: 0.519230121182, upper: 0.776719365641 });
    const style = evolutionBarStyle(range);
    expect(parseFloat(style.bottom)).toBeCloseTo(51.9230121182);
    expect(parseFloat(style.height)).toBeCloseTo(25.7489244459);
    expect(style.background).toContain("linear-gradient(to top");
  });
  it("searches SIA/name/municipality but only applies exact normalized identifiers", () => {
    expect(evolutionSiaKey("SIA-0559")).toBe("559");
    expect(evolutionSiaKey("3051037")).not.toBe(evolutionSiaKey("1037"));
    expect(evolutionPointOptions([campaign], "irai")).toHaveLength(3);
    expect(evolutionPointOptions([campaign], "curitiba")).toHaveLength(3);
    expect(evolutionPointOptions([campaign], "0559").map((item) => item.key)).toEqual(["559"]);
    expect(evolutionPointOptions([campaign], "missing")).toEqual([]);
  });
  it("renders every planned campaign with its code and preserves explicit keyboard selection and clearing", () => {
    const markup = renderToStaticMarkup(createElement(HomeIndexEvolution, { campaigns: [campaign] }));
    // Todas as campanhas previstas aparecem, mesmo sem resultado, com o código C1…C9 abaixo do nome.
    expect(markup.match(/data-evolution-series="overall"/g)).toHaveLength(9);
    for (const code of ["C1", "C2", "C3", "C9"]) expect(markup).toContain(`data-evolution-code="${code}">${code}<`);
    expect(markup).toContain("Verão 28");
    expect(markup).not.toContain("campanhas previstas até");
    expect(markup).not.toContain("Ambiental");
    expect(markup).not.toContain("SANEPAR-INDICE-0.3");
    // Ajuda como ícone "?" ao lado do título, acionável por clique, toque ou teclado.
    expect(markup).toContain('aria-label="Como ler a evolução"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain("Sem resultado");
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("Limpar");
    const source = readFileSync(new URL("../home-index-evolution.tsx", import.meta.url), "utf8");
    for (const text of ['"ArrowDown"', '"ArrowUp"', '"Enter"', '"Escape"', "onBlurCapture", "if (!value) setSelectedSia(null)", 'setQuery(""); setSelectedSia(null)', "onClick={clear}"]) expect(source).toContain(text);
  });
  it("polishes counts without disguising unavailable exclusions and keeps help contextual", () => {
    expect(evolutionExclusions(campaign, 2)).toMatchObject({ label: "1 parciais" });
    const mixed = { ...campaign, points: [...campaign.points, { ...complete("SIA-42", 0), completeness: "unavailable" } as ResultPoint] };
    expect(evolutionExclusions(mixed, 2)).toEqual({ label: "2 fora da média", detail: "1 parciais; 1 indisponíveis" });
    const markup = renderToStaticMarkup(createElement(HomeIndexEvolution, { campaigns: [campaign] }));
    expect(markup).toContain("2 completos");
    expect(markup).not.toContain(">n=");
    expect(markup).not.toContain("0 excl.");
    expect(markup).toContain("Média dos resultados completos por campanha.");
    expect(markup).toContain("font-bold tabular-nums");
    const help = renderToStaticMarkup(createElement(ResultsReviewDialog as (props: { title: string; children?: ReactNode }) => ReactNode, { title: "Como ler" }, EVOLUTION_HELP.join("\n\n")));
    expect(help).toContain("<dialog");
    expect(help).toContain("Pontos com faixa ficam fora da média");
    const defaultDialog = renderToStaticMarkup(createElement(ResultsReviewDialog));
    expect(defaultDialog).toContain(">Conheça a nova versão do Yva’e<");
    expect(defaultDialog).toContain("Explorar a nova versão");
    expect(help).toContain("Fechar aviso");
    const source = readFileSync(new URL("../home-index-evolution.tsx", import.meta.url), "utf8");
    expect(source).toContain("Resultados do ponto selecionado por campanha.");
    // Versões do método/catálogo não são exibidas.
    expect(source).not.toContain("calculationVersion");
    expect(source).not.toContain('"SANEPAR-INDICE-0.3"');
  });
});
