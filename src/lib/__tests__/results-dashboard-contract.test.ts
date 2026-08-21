import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPriorityMunicipalities } from "@/components/campaign-hydro-map";
import { loadCampaign1DashboardMapPoints } from "@/lib/dashboard-data";

const dashboardPath = resolve(
  process.cwd(),
  "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html",
);
const html = readFileSync(dashboardPath, "utf8");

function parseJson<T>(pattern: RegExp): T {
  const match = html.match(pattern);
  expect(match?.[1]).toBeTruthy();
  return JSON.parse(match![1]) as T;
}

describe("contrato do dashboard de resultados", () => {
  it("preserva os dois datasets e suas cardinalidades científicas", () => {
    const raw = parseJson<{ ranking: unknown[] }>(
      /<script id="DATA" type="application\/json">([\s\S]*?)<\/script>/,
    );
    const model = parseJson<{
      points: unknown[];
      municipios: unknown[];
      coi_all: unknown[];
      alerts: unknown[];
    }>(/const DATA\s*=\s*(\{[^\n]*\});/);

    expect(raw.ranking).toHaveLength(73);
    expect(model.points).toHaveLength(73);
    expect(model.municipios).toHaveLength(60);
    expect(model.coi_all).toHaveLength(173);
    expect(model.alerts).toHaveLength(39);
  });

  it("preserva sete áreas analíticas e os disclaimers indispensáveis", () => {
    const views = html.match(/\['(?:panorama|prioridade|alertas|ciano|bact|coi|metodo)'/g);
    expect(views).toHaveLength(7);
    expect(html).toContain("não abundância absoluta, biomassa ou concentração celular");
    expect(html).toContain("não confirma</b> viabilidade, toxinas, floração nem conformidade legal");
    expect(html).toContain("Reads não equivalem a abundância real");
  });

  it("mantém o iframe sem altura fixa e sincronizado pelo conteúdo same-origin", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/campaign-results-panels.tsx"),
      "utf8",
    );
    expect(component).toContain("ResizeObserver");
    expect(component).toContain("contentDocument");
    expect(component).toContain('frame.style.height = "0px"');
    expect(component).not.toMatch(/h-\[(?:760|860|940)px\]/);
    expect(component.indexOf("<ResultsDashboardSection")).toBeLessThan(
      component.indexOf("<MetabarcodingStagesIndicator"),
    );
  });

  it("preserva acessibilidade de modal, tabs e heatmaps", () => {
    expect(html).toContain("element.inert=true");
    expect(html).toContain("e.key!=='Tab'");
    expect(html).toContain("scrollIntoView({block:'nearest',inline:'nearest'})");
    expect(html).toContain("escapeAttr(`${r.ponto} — ${H.taxa[index]}: ${v}% dos reads do marcador`)");
  });

  it("mantém um único mapa de risco e move municípios para a superfície nativa", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/campaign-results-panels.tsx"),
      "utf8",
    );
    expect(component.match(/<CampaignHydroMap/g)).toHaveLength(1);
    expect(component).toContain("buildPriorityMunicipalities(points)");
    expect(component).toContain("Municípios prioritários");
    expect(html).not.toContain('id="map"');
    expect(html).not.toContain('data-v="espacial"');
    expect(html).not.toContain('class="state-outline"');
  });

  it("alimenta o mapa nativo com os mesmos 73 pontos e 60 municípios", async () => {
    const points = await loadCampaign1DashboardMapPoints();
    const municipalities = buildPriorityMunicipalities(points);

    expect(points).toHaveLength(73);
    expect(municipalities).toHaveLength(60);
    expect(municipalities[0]).toMatchObject({ municipality: "Pinhais", maxScore: 0.855 });
    expect(municipalities.map((item) => item.maxScore)).toEqual(
      [...municipalities.map((item) => item.maxScore)].sort((left, right) => right - left),
    );
  });

  it("mantém números científicos legíveis e leitura rápida responsiva", () => {
    expect(html).toContain("Reads — cianobactérias");
    expect(html).toContain("Reads — bactérias");
    expect(html).toContain("Reads — eucariotos (COI)");
    expect(html).toContain('class="distval"');
    expect(html).toContain("{unit:' reads'}");
    expect(html).toContain(".kv{grid-template-columns:1fr");
  });

  it("usa a publicação canônica por campanha e limita o legado ao fallback explícito", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/campaign-results-panels.tsx"),
      "utf8",
    );
    const campaigns = readFileSync(
      resolve(process.cwd(), "src/lib/campaign-management.ts"),
      "utf8",
    );

    expect(html).toContain("fetch('/api/imports/results?'+query");
    expect(html).toContain("dashboardParams.get('legacy')==='1'");
    expect(html).toContain("Object.assign(DATA,canonicalData)");
    expect(html).toContain("Não calculado");
    expect(component).toContain("campaignId: publication.campaignId");
    expect(component).toMatch(/<ExternalLink[\s\S]*?Dashboard\s*<\/a>/);
    expect(component).toContain('"Resultados"');
    expect(component).not.toContain('type="file"');
    expect(campaigns).not.toContain("resultsDashboardUrl");
  });

  it("mantém a Entrada de dados como única superfície de importação", () => {
    const repository = readFileSync(
      resolve(process.cwd(), "src/components/spreadsheet-repository.tsx"),
      "utf8",
    );
    const resultsPage = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/dados/resultados/page.tsx"),
      "utf8",
    );

    expect(resultsPage).toContain('view="resultados"');
    expect(repository).toContain('fetch("/api/imports/results"');
    expect(repository).toContain("downloadResultsTemplate");
    expect(repository).toContain("RESULTS_SCHEMA_VERSION");
    expect(repository).toContain('formData.append("selectedCampaign"');
  });

  it("codifica campos importados antes de inseri-los em markup", () => {
    const expression = html.match(/const escapeHtml=(.+);\r?\n/)?.[1];
    expect(expression).toBeTruthy();
    const escapeHtml = Function(`return (${expression})`)() as (value: unknown) => string;
    const attack = `<img src=x onerror="globalThis.pwned=1"><svg/onload=alert(1)>"'&`;
    const rendered = `<td>${escapeHtml(attack)}</td>`;

    expect(rendered).not.toContain("<img");
    expect(rendered).not.toContain("<svg");
    expect(rendered).not.toContain("onerror=\"");
    expect(rendered).toContain("&lt;img");
    expect(rendered).toContain("&quot;");
    expect(html).toContain("escapeHtml(p.ponto)");
    expect(html).toContain("escapeAttr(r.ponto)");
    expect(html).toContain("escapeHtml(dashboardPublication?.fileName");
  });

  it("aceita somente a allowlist fechada de tags de atenção", () => {
    expect(html).toContain("new Set(['tox','odor','inv','mix'])");
    expect(html).toContain("arr.filter(x=>allowed.has(x))");
    const allowed = new Set(["tox", "odor", "inv", "mix"]);

    expect(["tox", "odor", "inv", "mix"].filter((tag) => allowed.has(tag))).toEqual([
      "tox",
      "odor",
      "inv",
      "mix",
    ]);
    expect(["constructor", "toString", "__proto__"].filter((tag) => allowed.has(tag))).toEqual([]);
  });

  it("mantém scores ausentes após os calculados e sem barra equivalente a zero", () => {
    const source = html.match(/function compareScoreRows\([\s\S]*?\n\}/)?.[0];
    expect(source).toBeTruthy();
    const compareScoreRows = Function(`${source}; return compareScoreRows`)() as (
      left: { score: number | null; pos: number },
      right: { score: number | null; pos: number },
      ascending: boolean,
    ) => number;
    const rows = [
      { score: null, pos: 4 },
      { score: 0.2, pos: 2 },
      { score: 0.8, pos: 1 },
      { score: null, pos: 3 },
    ].sort((left, right) => compareScoreRows(left, right, false));

    expect(rows.map((row) => row.score)).toEqual([0.8, 0.2, null, null]);
    expect(rows.slice(2).map((row) => row.pos)).toEqual([3, 4]);
    expect(html).toContain("const bar=calculated?");
    expect(html).toContain("scoreText(p.score)");
    expect(html).not.toContain("(p.score||0)");
  });
});
