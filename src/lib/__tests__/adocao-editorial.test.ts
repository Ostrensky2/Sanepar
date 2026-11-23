import { readFileSync, readdirSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(path, "utf8");
const root = "src/app/(dashboard)";
const guide = "/resultados/calculos/0-8";
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name).replaceAll("\\", "/");
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
});

describe("Adoção do método 0.8 em todo o aplicativo", () => {
  it("ancora os agregados no congelamento oficial e mantém o mapa recolhido no celular", () => {
    expect(existsSync("src/app/api/results/campaign-distribution/aggregates.json")).toBe(false);
    expect(source("src/app/api/results/campaign-distribution/route.ts")).toContain("@/lib/results-08-aggregate");
    const dashboard = source("src/modules/results/components/results-index-dashboard.tsx");
    expect(dashboard).toContain("Mapa do índice · metodologia 0.8");
    expect(dashboard).toContain("setMobileMapOpen] = useState(false)");
    const home = source("src/modules/results/components/home-results-v2.tsx");
    expect(home).toContain("Índice geral médio 0.8 · por campanha");
    expect(home).toContain("não há média entre campanhas");
    expect(home).not.toMatch(/group=total|grupos\?\.total/);
  });
  it("liga as superfícies ao guia do método 0.8", () => {
    for (const path of [root+"/ajuda/page.tsx", root+"/governanca/page.tsx", root+"/resultados/calculos/page.tsx","src/components/release-notes.tsx"]) {
      expect(source(path)).toContain('href="'+guide+'"');
    }
    const method = source(root+guide+"/page.tsx");
    expect(method).toContain("M é a maior nota de domínio da versão atual");
    expect(method).toContain("pᵢ é a nota positiva recomposta do domínio candidato a primária");
    expect(method).not.toMatch(/notas? históricas?/i);
    for (const phrase of ["max(M", "Bᵢ e Cᵢ", "primária", "não é redistribuída", "preditiva", "gosto ou odor", "Nota por campanha e ponto", "Sem estimativa", "perfis de risco biológico"]) expect(method).toContain(phrase);
  });
  it("nenhuma tela, rota ou exportação apresenta resultado como histórico 0.7", () => {
    // O 0.7 só pode aparecer em comentário de proveniência do arquivo de leituras; nunca em texto, rótulo, versão ou consulta.
    const offenders = files("src").filter(path => !path.startsWith("src/lib/release-notes.ts")).flatMap(path => {
      const text = source(path);
      return /histórico 0\.7|método 0\.7|versão 0\.7|índice 0\.7|IR-CAPTACAO-0\.7|version=0\.7|"0\.7"|Estado 0\.7|histórica 0\.7/.test(text) ? [path] : [];
    });
    expect(offenders).toEqual([]);
    expect(source("src/lib/capture-index/index.ts")).toContain('data.version = "IR-CAPTACAO-0.8"');
  });
  it("mapa, ficha, tabela e planilha recebem a nota do ponto; não há mais frase fixa de indisponibilidade", () => {
    const all = files("src").map(source).join("\n");
    for (const phrase of ["Nota individual 0.8 indisponível", "Estimativa individual indisponível", "Detalhe individual indisponível", "Planilha por ponto indisponível", "publicação agregada 0.8", "Arquivo histórico de resultados indisponível"]) expect(all).not.toContain(phrase);
    const campaign = source("src/components/capture-campaign-results.tsx");
    expect(campaign).toContain('fetch("/api/results/capture-index/campaigns"');
    expect(campaign).toContain("<ResultsIndexDashboard");
    expect(campaign).toContain("<CaptureIndexPanel");
    const matrix = source("src/components/sia-matrices-preparation.tsx");
    expect(matrix).toContain("/api/results/capture-index?campaign=${campaign}");
    expect(matrix).not.toContain("disabled className={control}>Baixar planilha por ponto");
    const final = source("src/lib/imports/sia-integrated-results.ts");
    expect(final).toContain('index.meta?.version!=="IR-CAPTACAO-0.8"');
    expect(source("src/lib/imports/sia-matrices.ts")).toContain('"Estado da nota 0.8","Índice geral 0.8 (como exibido)"');
  });
  it("distingue zero, sem estimativa e sem medição nas telas e na planilha", () => {
    const dashboard = source("src/modules/results/components/results-index-dashboard.tsx");
    expect(dashboard).toContain("function formatPointValue");
    expect(dashboard).toContain('point.estimateState === "sem estimativa" ? "Sem estimativa"');
    expect(source("src/modules/results/components/capture-map-scale.ts")).toContain('point.estimateState === "sem estimativa" ? "Sem estimativa" : "Sem medição"');
    const panel = source("src/components/capture-index-panel.tsx");
    expect(panel).toContain("Sem estimativa: há leitura neste ponto e campanha");
    expect(panel).toContain("Sem medição: nenhuma biblioteca utilizável neste ponto e campanha. Não é um zero.");
    expect(source("src/lib/imports/sia-integrated-results.ts")).toContain('row.state==="sem estimativa"?"Sem estimativa":"Sem medição"');
  });
  it("associa os perfis de risco biológico operacional e sanitário à captação, nas telas e na planilha", () => {
    const profiles = source("src/lib/capture-index/risk-profiles.ts");
    for (const phrase of ['key: "operacional"', 'key: "sanitario"', 'domain: "Operacional"', 'domain: "Saúde humana"', "matchCard("]) expect(profiles).toContain(phrase);
    expect(source("src/lib/capture-index/index.ts")).toContain("profiles: captureRiskProfiles(row)");
    expect(source("src/components/capture-index-panel.tsx")).toContain("Perfis de risco biológico da captação");
    expect(source("src/modules/results/components/results-index-dashboard.tsx")).toContain("point.riskProfiles.map");
    expect(source("src/lib/imports/sia-matrices.ts")).toContain("Perfil de risco biológico operacional da captação");
    expect(source("src/lib/imports/sia-matrices.ts")).toContain("Perfil de risco biológico sanitário da captação");
  });
  it("mantém as notas de versão do software e o guia do método", () => {
    const notes = source("src/components/release-notes.tsx");
    for (const phrase of ["versão do software","mesma consequência","evidência independente","MAJOR_RELEASES.map","identificação não resolvida","Parentesco pode motivar um alerta","em uso em todo o aplicativo"]) expect(notes).toContain(phrase);
    expect(notes).not.toMatch(/homologação|histórico 0\.7/);
  });
});
