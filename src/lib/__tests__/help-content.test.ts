import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findHelpModuleForPath, helpModules, teamRules, teamRulesForModule } from "@/lib/help-content";
import { buildSampleCode, isLegacySampleCode, preservativeSuggestions } from "@/lib/field-standard";

// A Ajuda acompanha o que o app faz: regra que vale para todos fica em destaque, e
// os exemplos de código de amostra são os que o app gera de verdade.

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const textOf = (value: unknown) => JSON.stringify(value);
const diary = helpModules.find((module) => module.title === "Diário de campo")!;

describe("regras para toda a equipe", () => {
  it("a primeira é preparar o celular com internet antes do campo", () => {
    expect(teamRules[0].title).toContain("Antes de cada saída a campo");
    expect(teamRules[0].steps.join(" ")).toContain("Central de dados › Diário de campo");
    expect(teamRules[0].steps.join(" ")).toContain("Adicionar à tela inicial");
  });

  it("cada regra aponta para módulos que existem, e o Diário de campo mostra todas no “?”", () => {
    const titles = new Set(helpModules.map((module) => module.title));

    for (const rule of teamRules) {
      expect(rule.modules.length).toBeGreaterThan(0);
      expect(rule.modules.every((title) => titles.has(title))).toBe(true);
    }
    expect(teamRulesForModule("Diário de campo")).toEqual(teamRules);
    expect(teamRulesForModule("Início")).toEqual([]);
  });

  it("ficam no alto da Ajuda e no painel “?” da tela", () => {
    const page = read("src/app/(dashboard)/ajuda/page.tsx");

    expect(page).toContain("<HelpTeamRules rules={teamRules} />");
    expect(page.indexOf("<HelpTeamRules")).toBeLessThan(page.indexOf("filteredModules.map"));
    expect(read("src/components/help-drawer.tsx")).toContain("teamRulesForModule(helpModule.title)");
    expect(findHelpModuleForPath("/dados/diario-de-campo")?.title).toBe("Diário de campo");
  });
});

describe("Diário de campo na Ajuda", () => {
  it("o exemplo de código é o que o app gera, e o antigo é reconhecido como antigo", () => {
    const code = buildSampleCode({
      projectCode: "YVA",
      point: "0136",
      date: "2026-11-07",
      time: "09:05",
      sampleType: "water",
      sequence: 1,
    });
    const help = textOf([diary, teamRules]);

    expect(code).toBe("YVA-0136-071126-0905-AG1");
    expect(help).toContain(code);
    expect(help).toContain("YVA-071126-0136-AG1");
    expect(isLegacySampleCode("YVA-071126-0136-AG1")).toBe(true);
  });

  it("cobre sem sinal, réplicas, preservante, parâmetros e “Iniciar coleta”", () => {
    const help = textOf(diary);

    for (const expected of [
      "Iniciar coleta",
      "No aparelho, aguardando sinal",
      "Precisa de revisão",
      "Enviar agora",
      "“−” e “+”",
      "+ Amostra",
      "+ Parâmetro",
      "Situação do ponto",
    ]) {
      expect(help).toContain(expected);
    }
    for (const suggestion of preservativeSuggestions) {
      expect(help).toContain(suggestion);
    }
  });

  it("a planilha para o Biolog e os padrões de coleta estão nos módulos certos", () => {
    const campaigns = textOf(helpModules.find((module) => module.title === "Campanhas e resultados"));
    const dataHub = textOf(helpModules.find((module) => module.title === "Central de dados"));

    expect(campaigns).toContain("Exportar › Planilha para o Biolog (.xlsx)");
    expect(dataHub).toContain("Padrões de coleta");
    expect(dataHub).toContain("preservante");
  });
});
