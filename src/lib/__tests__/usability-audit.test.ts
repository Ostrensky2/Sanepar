import { afterEach, describe, expect, it, vi } from "vitest";
import { readAuthSession } from "@/components/auth-ui-client";
import { detectImportDestination } from "@/components/data-hub";
import {
  campaignPhaseLabel,
  defaultMetabarcodingStages,
  phaseStatusValue,
  plannedMetabarcodingStages,
  suggestedCampaignPhase,
  type MetabarcodingStage,
} from "@/lib/campaign-management";
import {
  findNavigationItem,
  getBreadcrumbsForPath,
  getNavigationAccessForPath,
  isNavigationItemActive,
  navigationItems,
} from "@/lib/navigation";
import { analyticalStatusText } from "@/modules/results/presentation";
import {
  publicationOptionLabel,
  researchCountsText,
  researchFieldText,
  visibleResearchColumns,
} from "@/modules/results/components/research-browser";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("navegação enxuta", () => {
  it("tem 8 destinos em três grupos e seções como abas", () => {
    expect(navigationItems).toHaveLength(8);
    expect(new Set(navigationItems.map((item) => item.group))).toEqual(new Set(["consult", "data", "support"]));
    expect(findNavigationItem("/dados/pendencias")?.label).toBe("Central de dados");
    expect(findNavigationItem("/resultados/calculos")?.label).toBe("Ciência e método");
  });

  it("marca o destino ativo pelas seções e mostra só ancestrais na trilha", () => {
    const campaigns = navigationItems.find((item) => item.href === "/campanhas/campo")!;
    expect(isNavigationItemActive(campaigns, "/campanhas/resultados")).toBe(true);
    expect(getBreadcrumbsForPath("/dados/status").map((crumb) => crumb.label)).toEqual(["Início", "Central de dados", "Fase e etapas"]);
    expect(getBreadcrumbsForPath("/campanhas/campo").map((crumb) => crumb.label)).toEqual(["Início", "Campanhas e resultados"]);
  });

  it("preserva os privilégios próprios de Resultados e de Registrar atividade", () => {
    expect(getNavigationAccessForPath("/campanhas/resultados")?.requiredPrivileges).toEqual(["nav.results"]);
    expect(getNavigationAccessForPath("/dados/acoes-pontuais")?.requiredPrivileges).toEqual(["nav.data"]);
  });
});

describe("fases da campanha", () => {
  it("exibe 6 fases + 2 marcadores sem sinônimos concorrentes", () => {
    expect(campaignPhaseLabel("Resultados publicados")).toBe("Concluída");
    expect(campaignPhaseLabel("Coleta concluída")).toBe("Em laboratório");
    expect(campaignPhaseLabel("Aguardando calendário")).toBe("Planejada");
    expect(phaseStatusValue("Resultados publicados")).toBe("Concluída");
  });

  it("sugere a fase pelas etapas marcadas", () => {
    expect(suggestedCampaignPhase(plannedMetabarcodingStages)).toBe("Planejada");
    expect(suggestedCampaignPhase(defaultMetabarcodingStages)).toBe("Em análise");
    const collecting: MetabarcodingStage[] = plannedMetabarcodingStages.map((stage) =>
      stage.label === "Coleta de amostras" ? { ...stage, status: "inprogress" } : { ...stage },
    );
    expect(suggestedCampaignPhase(collecting)).toBe("Em campo");
    expect(suggestedCampaignPhase(defaultMetabarcodingStages.map((stage) => ({ ...stage, status: "done" as const })))).toBe("Concluída");
  });
});

describe("assistente de importação", () => {
  it("indica a tela certa pelas abas da planilha", () => {
    expect(detectImportDestination(["Metadados", "Indices_pontos"])).toMatchObject({ href: "/dados/resultados" });
    expect(detectImportDestination(["Pontos"])).toMatchObject({ href: "/dados/acoes-pontuais" });
    expect(detectImportDestination(["Campanhas"])).toMatchObject({ href: "/dados/diario-de-campo" });
    expect(detectImportDestination(["Plan1"])).toHaveProperty("error");
  });
});

describe("linguagem do usuário nos resultados", () => {
  it("nunca expõe códigos internos de situação analítica", () => {
    expect(analyticalStatusText({ sourceStatus: null, status: "missing_records" })).toBe("Sem registros");
    expect(analyticalStatusText({ sourceStatus: " Disponível ", status: "available_unassessed" })).toBe("Disponível");
  });

  it("mostra a campanha pelo nome, Sim/Não e só contagens relevantes", () => {
    expect(publicationOptionLabel({ canonicalName: "1ª Campanha" })).toBe("1ª Campanha");
    expect(researchFieldText("included", 1)).toBe("Sim");
    expect(researchFieldText("included", 0)).toBe("Não");
    expect(researchCountsText({ filtered: 423, population: 423, organisms: 0 })).toBe("423 registros.");
    expect(researchCountsText({ filtered: 5, population: 10, organisms: 2 })).toBe("5 de 10 registros · 2 organismos.");
  });

  it("oculta a coluna calculada quando é idêntica à utilizada", () => {
    const columns = [{ key: "environmentalCalculated", label: "Calc" }, { key: "environmentalUsed", label: "Usado" }];
    const same = [{ values: { environmentalCalculated: 0.5, environmentalUsed: 0.5 } }] as never;
    const different = [{ values: { environmentalCalculated: 0.4, environmentalUsed: 0.5 } }] as never;
    expect(visibleResearchColumns(columns, same).map((column) => column.key)).toEqual(["environmentalUsed"]);
    expect(visibleResearchColumns(columns, different)).toHaveLength(2);
  });
});

describe("sessão resiliente", () => {
  it("repete falhas 5xx e só então informa indisponibilidade, sem conceder sessão", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = readAuthSession();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ session: null, canSetPassword: false, unavailable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("não repete quando o servidor responde que não há sessão", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readAuthSession()).resolves.toEqual({ session: null, canSetPassword: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
