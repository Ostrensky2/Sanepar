import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));

import { readFileSync } from "node:fs";
import { GET } from "@/app/api/results/capture-index/route";
import { captureDomains, captureIndexAuditCsv, captureIndexCampaigns, captureIndexCsv, captureIndexMeta, captureIndexRows, captureIndexView, sha256Hex } from "@/lib/capture-index";
import { formatCaptureIndex, formatCaptureShare } from "@/lib/capture-index/format";
import { distribution } from "./distribution";

const one = (campaign: number, sia: string) => captureIndexRows(campaign).find(row => row.sia === sia)!;
const get = (query = "") => GET(new Request(`http://local.test/api/results/capture-index${query}`));
const parse = (line: string) => [...line.matchAll(/(?:^|;)(?:"((?:[^"]|"")*)"|([^;]*))/g)].map(match => match[1] !== undefined ? match[1].replaceAll('""', '"') : match[2]);
const table = (csv: string) => csv.replace("﻿", "").trimEnd().split("\r\n").map(parse);
const curve = (q: number) => Math.log(1 + 100 * q) / Math.log(101);
type Point08 = { campaign: number; sia: string; geral: number | null; ambiental: number | null; operacional: number | null; saude: number | null };
const points08 = (JSON.parse(readFileSync("src/lib/capture-index/pontos-0.8.json", "utf8")) as { rows: Point08[] }).rows;
const point08 = (campaign: number, sia: string) => points08.find(point => point.campaign === campaign && point.sia === sia)!;

describe("formatação única", () => {
  it("distingue sem medição, zero calculado e positivo pequeno; arredonda meio para cima", () => {
    expect([null, undefined, Number.NaN, -1, 0, 0.001, 0.0099, 0.01, 0.125, 0.295304, 1].map(formatCaptureIndex))
      .toEqual(["sem medição", "sem medição", "sem medição", "sem medição", "0,00", "<0,01", "<0,01", "0,01", "0,13", "0,30", "1,00"]);
    expect([null, 0, 0.0004, 0.049, 0.276].map(formatCaptureShare)).toEqual(["sem dado", "0%", "<0,1%", "4,9%", "27,6%"]);
  });
});

describe("saída versionada do índice de triagem", () => {
  it("reproduz P90 oficial das redes e distingue os SIAs comuns na C3", () => {
    const campaigns = [1, 2, 3].map(n => captureIndexRows(n));
    const measured = campaigns.map(rows => new Set(rows.filter(r => r.general !== null).map(r => r.sia)));
    const common = campaigns[2].filter(r => measured.every(ids => ids.has(r.sia)));
    const subsets = [...campaigns, common].map(rows => distribution(rows.map(r => r.general)));
    expect(subsets.map(s => [s.count, formatCaptureIndex(s.p90)])).toEqual([
      [73, "0,17"], [75, "0,39"], [76, "0,33"], [71, "0,33"],
    ]);
    expect(captureIndexCampaigns().map(c => [c.measured, c.p90])).toEqual(
      subsets.slice(0, 3).map(s => [s.count, formatCaptureIndex(s.p90)]));
    expect(distribution([null, NaN])).toMatchObject({count: 0, median: null, p90: null});
    expect(distribution([null, 0])).toMatchObject({count: 1, median: 0, p90: 0});
  });
  it("tem uma linha por ponto e campanha, sem duplicar as corridas da C3", () => {
    expect(captureIndexMeta.version).toBe("IR-CAPTACAO-3.0");
    expect([1, 2, 3].map(campaign => captureIndexRows(campaign).length)).toEqual([73, 76, 76]);
    expect(captureIndexRows()).toHaveLength(225);
    expect(new Set(captureIndexRows(3).map(row => row.sia)).size).toBe(76);
  });

  it("cada campanha + SIA recebe exatamente a sua nota do método 3.0, e a maior categoria é o piso do geral", () => {
    expect(points08).toHaveLength(225);
    let reinforced = 0;
    for (const row of captureIndexRows()) {
      const point = point08(row.campaign, row.sia);
      expect(row.general).toBe(point.geral);
      expect(captureDomains.map(domain => row.scores[domain]?.score ?? null)).toEqual([point.ambiental, point.operacional, point.saude]);
      // Limites e média quadrática do índice anterior não existem no método 3.0.
      expect([row.generalFloor, row.generalCeiling, row.generalRms]).toEqual([null, null, null]);
      for (const domain of captureDomains) {
        const score = row.scores[domain];
        if (!score) continue;
        expect(score.floor).toBeLessThanOrEqual(score.score + 1e-12);
        expect(score.score).toBeLessThanOrEqual(score.ceiling + 1e-12);
        expect(["A", "B", "C"]).toContain(score.confidence);
      }
      const scores = captureDomains.flatMap(domain => row.scores[domain] ? [row.scores[domain]!.score] : []);
      expect(row.elevated).toBe(scores.filter(value => value >= 0.15).length);
      if (row.general === null) continue;
      const floor = Math.max(...scores);
      expect(row.general).toBeGreaterThanOrEqual(floor); // a maior categoria é o piso; reforço só eleva
      expect(row.general).toBeLessThanOrEqual(1);
      if (row.general > floor + 1e-12) reinforced++;
      if (row.predominant) expect(row.scores[row.predominant]!.score).toBe(floor);
    }
    expect(reinforced).toBe(73); // dano distinto e documentado em outra categoria; não é a média das três
  });

  it("zero, sem estimativa e sem medição são estados distintos", () => {
    const low = one(1, "17"), none = one(2, "257");
    // Com o cadastro completo de fichas (24/11), toda categoria medida tem algum sinal: não há mais zero calculado nas três campanhas.
    expect(captureIndexRows().flatMap(row => captureDomains.filter(domain => row.scores[domain]?.score === 0))).toEqual([]);
    expect(formatCaptureIndex(0)).toBe("0,00");
    expect(captureIndexView(low).domains[1].score).toBe("0,02");
    expect(captureIndexView(low).state).toBe("estimado");
    // C2 · SIA 257: só o COI é utilizável; sem 16S a categoria de saúde não pode ser afirmada, e o geral também não.
    expect([none.general, none.scores["Saúde humana"], none.estimate]).toEqual([null, null, "sem estimativa"]);
    const view = captureIndexView(none);
    expect([view.general, view.state, view.measured, view.domains[2].score, view.coverage]).toEqual(["sem estimativa", "sem estimativa", false, "sem estimativa", "só COI (16S ausente)"]);
    expect([view.domains[0].score, view.domains[1].score]).toEqual(["0,08", "0,06"]);
    expect([view.exact.general, view.exact.domains["Saúde humana"]]).toEqual([null, null]);
    expect(captureIndexRows().filter(row => row.general === null).map(row => [row.campaign, row.sia])).toEqual([[2, "257"]]);
    expect(formatCaptureIndex(null)).toBe("sem medição");
  });

  it("o mesmo SIA em campanhas diferentes nunca compartilha nota", () => {
    const values = [1, 2, 3].map(campaign => one(campaign, "17").general);
    expect(values).toEqual([point08(1, "17").geral, point08(2, "17").geral, point08(3, "17").geral]);
    expect(new Set(values).size).toBe(3);
    expect([1, 2, 3].map(campaign => captureIndexView(one(campaign, "17")).general)).toEqual(["0,13", "0,11", "0,17"]);
  });

  it("associa os perfis de risco biológico operacional e sanitário a cada captação", () => {
    const view = captureIndexView(one(2, "17"));
    expect(view.profiles.map(profile => [profile.key, profile.score, profile.effects.map(effect => effect.id)])).toEqual([
      ["operacional", "0,11", ["odour", "diatom"]], ["sanitario", "0,07", ["cyanotoxins"]]]);
    const none = captureIndexView(one(2, "257")).profiles;
    expect(none.map(profile => [profile.key, profile.state, profile.value === null])).toEqual([["operacional", "com sinal documentado", false], ["sanitario", "sem estimativa", true]]);
    const quiet = captureIndexView(one(1, "17")).profiles[0];
    // Sinal baixo vindo só de fichas sem cartão de efeito: há nota, sem tipo de efeito listado.
    expect([quiet.state, quiet.effects]).toEqual(["com sinal documentado", []]);
    expect(quiet.value).toBeCloseTo(0.0195, 4);
    for (const row of captureIndexRows()) {
      const profiles = captureIndexView(row).profiles;
      expect(profiles.map(profile => profile.key)).toEqual(["operacional", "sanitario"]);
      expect(profiles[0].value).toBe(row.scores.Operacional?.score ?? null);
      expect(profiles[1].value).toBe(row.scores["Saúde humana"]?.score ?? null);
    }
  });

  it("cada nota se refaz a partir das contribuições, e um táxon conta uma vez por domínio e componente", () => {
    for (const row of captureIndexRows()) for (const domain of captureDomains) {
      const score = row.scores[domain];
      if (!score) continue;
      const keys = score.contributions.map(item => `${item.component}|${item.taxon}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const item of score.contributions) {
        expect(item.q).toBeCloseTo((item.reads / row.components[item.component as "16S"].validReads - (item.base ?? 0)) * item.gravidade / 3 * item.aplicabilidade, 12); // efeito por massa: só o excesso sobre a base
      }
      if (score.component && score.contributions.length < 12) {
        const q = score.contributions.filter(item => item.component === score.component).reduce((sum, item) => sum + item.q, 0);
        expect(score.score).toBeCloseTo(curve(q), 10);
      }
    }
  });

  it("controle C2/SIA 136: Corbicula no COI determina o ambiental", () => {
    const row = one(2, "136"), view = captureIndexView(row);
    expect([row.components.COI.observedReads, row.components.COI.validReads, row.descriptors.coiExcludedReads]).toEqual([100939, 91782, 9157]); // organismos marinhos saem do denominador
    expect(row.scores.Ambiental!.score).toBeCloseTo(0.31082, 5);
    expect(row.scores.Ambiental!.contributions[0]).toMatchObject({ taxon: "Corbicula", reads: 4402, gravidade: 2, aplicabilidade: 1, component: "COI" });
    expect(view.domains[0].score).toBe("0,31");
    expect(view.domains[0].component).toBe("COI");
    expect(view.predominant).toBe("Danos físicos e ambientais");
  });

  it("preferência de plataforma na C3: NextSeq, com MiSeq só onde o NextSeq não é utilizável", () => {
    const rows = captureIndexRows(3);
    expect(rows.every(row => row.components["16S"].run === "C3_NextSeq")).toBe(true);
    const coi = rows.filter(row => row.components.COI.status === "disponível");
    expect([coi.filter(row => row.components.COI.run === "C3_NextSeq").length, coi.filter(row => row.components.COI.run === "C3_MiSeq").length]).toEqual([47, 1]);
  });

  it("a cobertura da curadoria conta cada read uma vez e traz o detalhe por marcador", () => {
    const grades = captureIndexRows().flatMap(row => captureDomains.flatMap(domain => row.scores[domain] ? [row.scores[domain]!.confidence] : []));
    expect(grades).toHaveLength(674); // 675 categorias menos a de saúde sem estimativa (C2 · SIA 257)
    const row = one(2, "136"), score = row.scores.Ambiental!;
    const distinct = row.components["16S"].validReads + row.components.ALGAS.observedReads + row.components.COI.validReads;
    expect(row.components.COI.validReads).toBeLessThan(row.components.COI.observedReads);
    expect(distinct).toBe(row.components["16S"].observedReads + row.components.COI.validReads); // bactérias + cloroplasto = 16S inteiro
    expect(Object.keys(score.evaluatedByComponent!).sort()).toEqual(["16S", "ALGAS", "COI"]);
    expect(captureIndexView(row).domains[0].evaluatedBy).toContain("COI");
  });

  it("biblioteca inconclusiva preserva a contagem observada e não pontua", () => {
    const row = one(1, "173");
    expect(row.components.COI).toMatchObject({ status: "inconclusivo", observedReads: 6, validReads: 0 });
    expect(row.general).not.toBeNull(); // o 16S continua valendo
    expect(captureIndexView(row).coverage).toBe("só 16S (COI inconclusivo)");
  });

  it("casos de referência: Iraí segue no topo nas três campanhas, por saúde", () => {
    // Com o cadastro completo (24/11): SIA 78 em 3º, 6º e 7º; SIA 780 em 5º, 5º e 11º (era 10º na C3).
    expect([1, 2, 3].flatMap(campaign => ["78", "780"].map(sia => one(campaign, sia).rank))).toEqual([3, 5, 6, 5, 7, 11]);
    for (const campaign of [1, 2, 3]) for (const sia of ["78", "780"]) {
      const row = one(campaign, sia);
      expect(row.predominant).toBe("Saúde humana");
    }
  });

  it("medição contestada e baixo suporte viram alerta, sem pontuar", () => {
    const contested = captureIndexRows().flatMap(row => row.alerts).filter(alert => alert.motivo === "medição contestada");
    expect(contested.length).toBeGreaterThan(0);
    expect(new Set(contested.map(alert => alert.taxon))).toEqual(new Set(["Cedecea"]));
    expect(captureIndexRows().flatMap(row => captureDomains.flatMap(domain => row.scores[domain]?.contributions ?? [])).some(item => item.taxon === "Cedecea")).toBe(false);
    expect(captureIndexRows().flatMap(row => row.alerts).some(alert => alert.motivo === "baixo suporte")).toBe(true);
  });

  it("uma categoria só não é diluída, e a maturidade de cada categoria é declarada", () => {
    const row = one(2, "780");
    expect(row.scores["Saúde humana"]!.score).toBeCloseTo(0.442, 3);
    expect(captureIndexView(row).domains[2].score).toBe("0,44");
    expect(captureIndexView(row).general).toBe("0,45"); // piso 0,44 reforçado por dano operacional distinto
    expect(captureIndexView(row).elevated).toBe("3 de 3 categorias na faixa de referência (0,15)");
    expect(captureIndexRows().filter(item => item.general !== null && item.general >= 0.15)).toHaveLength(57);
    expect(captureIndexRows().filter(item => item.elevated === 2)).toHaveLength(10);
    expect(captureIndexMeta.maturity.map(item => item.level)).toEqual(["evidência parcial", "evidência parcial", "com base de comparação"]);
  });

  it("diatomáceas pontuam só onde há resultado delas (cloroplasto) e só acima da base da rede", () => {
    const row = one(3, "188"), score = row.scores.Operacional!, main = score.contributions[0];
    expect([row.rank, row.predominant, score.component]).toEqual([2, "Operacional", "ALGAS"]);
    expect(main).toMatchObject({ rank: "grupo", gravidade: 3, aplicabilidade: 1, base: 0.0209, component: "ALGAS" });
    expect(main.q).toBeCloseTo(row.descriptors.diatomShare! - 0.0209, 12);
    expect(captureIndexView(row).diatoms).toBe("19,1%");
    const scored = captureIndexRows().filter(item => item.scores.Operacional!.contributions.some(c => c.ficha.startsWith("CUR-Diatomaceas")));
    expect(scored).toHaveLength(23);
    expect(scored.every(item => item.descriptors.diatomShare! > 0.0209)).toBe(true); // sem resultado de diatomácea acima da base, não pontua
  });

  it("dominância fora do padrão é alerta para qualquer organismo e nunca entra na nota", () => {
    const alerts = captureIndexRows().flatMap(row => row.alerts.map(alert => ({ row, alert }))).filter(item => item.alert.motivo === "dominância anômala");
    expect(alerts).toHaveLength(70);
    for (const { alert } of alerts) {
      expect([alert.ficha, alert.dominio, alert.gravidade]).toEqual(["", "", null]);
      expect(alert.participacao!).toBeGreaterThanOrEqual(0.1);
      expect(alert.participacao!).toBeGreaterThan(3 * Math.max(alert.referencia!, 0.005));
    }
    const view = captureIndexView(one(3, "220")), item = view.alerts.find(alert => alert.reason.startsWith("dominância"))!;
    expect([item.taxon, item.domain]).toEqual(["Microcystis", ""]);
    expect(item.reason).toContain("não entra na nota");
    expect(view.dominance).toMatch(/^Microcystis \d+,\d%$/);
    expect(captureIndexAuditCsv(captureIndexRows(3))).toContain("alerta: dominância anômala");
  });

  it("assinatura de esgoto pontua em saúde só acima da base; Escherichia-Shigella isolada vira alerta de amostra", () => {
    const row = one(3, "244"), main = row.scores["Saúde humana"]!.contributions[0];
    expect(main).toMatchObject({ rank: "grupo", gravidade: 2, aplicabilidade: 0.5, base: 0.0097, component: "16S" });
    expect(main.taxon).toMatch(/^Assinatura de esgoto/);
    expect(captureIndexView(row).domains[2].score).toBe("0,32");
    const sample = captureIndexRows().flatMap(item => item.alerts.map(alert => ({ item, alert }))).filter(entry => entry.alert.motivo === "qualidade da amostra");
    expect(sample).toHaveLength(9);
    expect(sample.filter(entry => entry.item.campaign === 2)).toHaveLength(8);
    for (const { item, alert } of sample) {
      expect(alert.participacao!).toBeGreaterThanOrEqual(0.01);
      expect(item.scores["Saúde humana"]!.contributions.some(c => c.taxon.startsWith("Escherichia"))).toBe(false);
    }
    expect(captureIndexView(one(2, "121")).alerts.some(alert => alert.reason.startsWith("possível problema na amostra"))).toBe(true);
  });

  it("organismos marinhos saem do COI e Perna conta como mexilhão-dourado", () => {
    const rows = captureIndexRows();
    expect(rows.filter(item => item.descriptors.coiExcludedReads > 0)).toHaveLength(82);
    expect(rows.filter(item => item.descriptors.coiReassignedReads > 0)).toHaveLength(23);
    expect(rows.flatMap(item => [...item.alerts.map(alert => alert.taxon), ...item.descriptors.exotics.map(e => e.species)]).some(name => /Hypanus|Salmo|Rhizoprionodon|Aiptasiidae|Callinectes|Artemia|Nanomia/.test(name))).toBe(false);
    expect(rows.flatMap(item => captureDomains.flatMap(domain => item.scores[domain]?.contributions ?? [])).some(c => /^(Hypanus|Salmo|Rhizoprionodon|Perna)/.test(c.taxon))).toBe(false);
    const row = one(3, "196");
    expect(row.scores.Operacional!.contributions[0]).toMatchObject({ taxon: "Limnoperna fortunei", reads: 36, component: "COI" });
    expect(captureIndexView(row).coiExcluded).toBe("72 reads de organismos marinhos retirados do COI");
  });

  it("espécies exóticas são listadas por ponto, sem nota", () => {
    const rows = captureIndexRows();
    expect(rows.filter(item => item.descriptors.exotics.length > 0).length).toBeGreaterThan(80);
    const view = captureIndexView(one(2, "136"));
    expect(view.exotics).toContain("Corbicula (espécie não resolvida) (4.402 reads)");
    expect(rows.flatMap(item => item.scores.Ambiental!.contributions).some(c => /Craspedacusta|Kellicottia|Coptodon/.test(c.taxon))).toBe(false);
    expect(captureIndexMeta.status).toContain("metodologia 3.0");
  });

  it("diz o que foi medido e atribui o principal ao marcador que decidiu a nota (auditoria de 20/11)", () => {
    const onlyCoi = one(2, "257");
    expect([onlyCoi.components["16S"].status, onlyCoi.components.COI.status]).toEqual(["ausente", "disponível"]);
    expect(captureIndexView(onlyCoi).coverage).toBe("só COI (16S ausente)");
    const texts = captureIndexRows().map(row => captureIndexView(row).coverage);
    expect([texts.filter(text => text === "16S e COI").length, texts.filter(text => text.startsWith("só 16S")).length, texts.filter(text => text.startsWith("só COI")).length]).toEqual([177, 47, 1]);
    const row = one(3, "780"), score = row.scores.Operacional!, domain = captureIndexView(row).domains[1];
    expect(score.component).toBe("16S");
    expect(domain.main.startsWith(score.contributions.find(item => item.component === "16S")!.taxon)).toBe(true);
    // O maior entre todos os marcadores nem sempre é o que decidiu a nota: o principal vem do marcador vencedor.
    expect(captureIndexRows().some(item => captureDomains.some(key => { const s = item.scores[key]; return !!s?.component && !!s.contributions[0] && s.contributions[0].component !== s.component; }))).toBe(true);
    for (const item of captureIndexRows()) for (const key of captureDomains) {
      const s = item.scores[key], view = captureIndexView(item).domains[captureDomains.indexOf(key)];
      if (!s) continue;
      const winner = s.contributions.find(c => c.component === s.component);
      if (winner) expect(view.main.startsWith(winner.taxon)).toBe(true);
    }
    const head = captureIndexAuditCsv(captureIndexRows(3)).split("\r\n")[0];
    expect(head).toContain("estado_da_nota");
    expect(head).not.toMatch(/media_quadratica|geral_piso|geral_teto|v05/); // sobras do índice anterior não são exportadas
  });

  it("declara os pontos cegos sem o mosquito-fantasma, que está em desenvolvimento", () => {
    expect(captureIndexMeta.blindSpots.map(item => item.tema).join(" ")).not.toMatch(/Chaoboridae|fantasma/i);
    expect(captureIndexMeta.blindSpots.length).toBeGreaterThanOrEqual(4);
  });

  it("resumo por campanha: um voto por ponto", () => {
    const campaigns = captureIndexCampaigns();
    expect(campaigns.map(item => [item.campaign, item.points, item.measured])).toEqual([["C1", 73, 73], ["C2", 76, 75], ["C3", 76, 76]]);
    for (const item of campaigns) expect(item.bands.reduce((sum, band) => sum + band.count, 0)).toBe(item.measured);
    const rows = captureIndexRows(2).filter(row => row.general !== null);
    expect(campaigns[1].mean).toBe(formatCaptureIndex(rows.reduce((sum, row) => sum + row.general!, 0) / rows.length));
    expect(campaigns.map(item => item.mean)).toEqual(["0,09", "0,18", "0,13"]);
  });
});

describe("GET /api/results/capture-index", () => {
  beforeEach(() => { auth.mockReset(); auth.mockResolvedValue({ ok: true }); });

  it("exige data.view e não devolve dados sem sessão", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await get("?campaign=2")).status).toBe(401);
    expect(auth).toHaveBeenCalledWith(expect.any(Request), "data.view");
  });

  it("recusa opções inválidas", async () => {
    for (const query of ["?campaign=0", "?campaign=2&campaign=3", "?format=xlsx", "?run=C3_MiSeq", "?outra=1"]) expect((await get(query)).status).toBe(422);
  });

  it("painel e exportação de leitura mostram exatamente os mesmos textos", async () => {
    const json = await get("?campaign=2"), csv = await get("?campaign=2&format=csv");
    expect(json.headers.get("cache-control")).toBe("private, no-store");
    expect(csv.headers.get("content-disposition")).toContain("indice-captacao-IR-CAPTACAO-3.0-C2-leitura.csv");
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await csv.arrayBuffer()); // text() descartaria o BOM
    expect(csv.headers.get("x-export-sha256")).toBe(sha256Hex(body));
    expect(body).toBe(captureIndexCsv(captureIndexRows(2)));
    const payload = await json.json(), [head, ...lines] = table(body);
    expect(payload.rows).toHaveLength(76);
    expect(payload.rows.slice(0, 3).map((row: { position: string }) => row.position)).toEqual(["1º de 75", "2º de 75", "3º de 75"]);
    expect(lines).toHaveLength(76);
    for (const view of payload.rows) {
      const cells = lines.find(line => line[2] === view.sia)!;
      const at = (name: string) => cells[head.indexOf(name)];
      expect(cells).toHaveLength(head.length);
      expect([at("indice_geral"), at("estado"), at("posicao_na_campanha"), at("predominante"), at("categorias_na_faixa")]).toEqual([view.general, view.state, view.position, view.predominant, view.elevated]);
      expect([at("perfil_risco_operacional"), at("perfil_risco_sanitario")]).toEqual(view.profiles.map((profile: { summary: string }) => profile.summary));
      for (const domain of view.domains) expect([at(`${domain.key}_nota`), at(`${domain.key}_principal`)]).toEqual([domain.score, domain.main]);
    }
  });

  it("a Home recebe os resumos das campanhas sem as linhas dos pontos", async () => {
    const payload = await (await get()).json();
    expect(payload.rows).toEqual([]);
    expect(payload.campaigns.map((item: { campaign: string }) => item.campaign)).toEqual(["C1", "C2", "C3"]);
    expect(payload.meta.blindSpots.length).toBeGreaterThan(0);
  });

  it("exportação de auditoria traz valores crus, bibliotecas, contribuições e fichas", async () => {
    const response = await get("?campaign=3&format=audit");
    expect(response.headers.get("content-disposition")).toContain("C3-auditoria.csv");
    const [head, ...lines] = table(await response.text());
    expect(lines.every(line => line.length === head.length)).toBe(true);
    const type = head.indexOf("tipo"), sia = head.indexOf("SIA");
    expect(lines.filter(line => line[type] === "biblioteca")).toHaveLength(76 * 3);
    expect(lines.filter(line => line[type] === "nota")).toHaveLength(76 * 3);
    const row = one(3, "78"), contribution = lines.find(line => line[sia] === "78" && line[type] === "contribuicao" && line[head.indexOf("taxon")] === "Microcystis" && line[head.indexOf("dominio")] === "Saúde humana")!;
    expect(Number(contribution[head.indexOf("geral")])).toBe(row.general);
    expect(contribution[head.indexOf("ficha")]).toBe("CUR-Microcystis-S");
    expect(contribution[head.indexOf("corrida")]).toBe("C3_NextSeq");
    expect(captureIndexAuditCsv(captureIndexRows(3))).toContain("alerta: medição contestada");
  });
});
