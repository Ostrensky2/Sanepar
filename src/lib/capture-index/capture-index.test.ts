import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));

import { GET } from "@/app/api/results/capture-index/route";
import { captureDomains, captureIndexAuditCsv, captureIndexCampaigns, captureIndexCsv, captureIndexMeta, captureIndexRows, captureIndexView, sha256Hex } from "@/lib/capture-index";
import { formatCaptureIndex, formatCaptureShare } from "@/lib/capture-index/format";
import { distribution } from "./distribution";

const one = (campaign: number, sia: string) => captureIndexRows(campaign).find(row => row.sia === sia)!;
const get = (query = "") => GET(new Request(`http://local.test/api/results/capture-index${query}`));
const parse = (line: string) => [...line.matchAll(/(?:^|;)(?:"((?:[^"]|"")*)"|([^;]*))/g)].map(match => match[1] !== undefined ? match[1].replaceAll('""', '"') : match[2]);
const table = (csv: string) => csv.replace("﻿", "").trimEnd().split("\r\n").map(parse);
const curve = (q: number) => Math.log(1 + 100 * q) / Math.log(101);

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
      [73, "0,13"], [76, "0,31"], [76, "0,31"], [72, "0,27"],
    ]);
    expect(captureIndexCampaigns().map(c => [c.measured, c.p90])).toEqual(
      subsets.slice(0, 3).map(s => [s.count, formatCaptureIndex(s.p90)]));
    expect(distribution([null, NaN])).toMatchObject({count: 0, median: null, p90: null});
    expect(distribution([null, 0])).toMatchObject({count: 1, median: 0, p90: 0});
  });
  it("tem uma linha por ponto e campanha, sem duplicar as corridas da C3", () => {
    expect(captureIndexMeta.version).toBe("IR-CAPTACAO-0.7-piloto");
    expect([1, 2, 3].map(campaign => captureIndexRows(campaign).length)).toEqual([73, 76, 76]);
    expect(captureIndexRows()).toHaveLength(225);
    expect(new Set(captureIndexRows(3).map(row => row.sia)).size).toBe(76);
  });

  it("todo ponto com biblioteca utilizável tem as três notas e a geral", () => {
    for (const row of captureIndexRows()) {
      expect(row.general).not.toBeNull();
      for (const domain of captureDomains) {
        const score = row.scores[domain]!;
        expect(score.floor).toBeLessThanOrEqual(score.score + 1e-12);
        expect(score.score).toBeLessThanOrEqual(score.ceiling + 1e-12);
        expect(["A", "B", "C"]).toContain(score.confidence);
      }
      const scores = captureDomains.map(domain => row.scores[domain]!.score);
      expect(row.general!).toBe(Math.max(...scores)); // índice geral = a maior das três notas
      expect(row.generalRms!).toBeCloseTo(Math.sqrt(scores.reduce((sum, value) => sum + value ** 2, 0) / 3), 12); // agregação da 0.5, para auditoria
      expect(row.elevated).toBe(scores.filter(value => value >= 0.15).length);
      if (row.predominant) expect(row.scores[row.predominant]!.score).toBe(row.general);
    }
  });

  it("cada nota se refaz a partir das contribuições, e um táxon conta uma vez por domínio e componente", () => {
    for (const row of captureIndexRows()) for (const domain of captureDomains) {
      const score = row.scores[domain]!;
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
    const grades = captureIndexRows().flatMap(row => captureDomains.map(domain => row.scores[domain]!.confidence));
    expect(["A", "B", "C"].map(grade => grades.filter(item => item === grade).length)).toEqual([24, 235, 416]);
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

  it("casos de referência: Iraí fica entre os dez primeiros nas três campanhas, por saúde", () => {
    for (const campaign of [1, 2, 3]) for (const sia of ["78", "780"]) {
      const row = one(campaign, sia);
      expect(row.rank!).toBeLessThanOrEqual(10);
      expect(row.predominant).toBe("Saúde humana");
    }
  });

  it("medição contestada e baixo suporte viram alerta, sem pontuar", () => {
    const contested = captureIndexRows().flatMap(row => row.alerts).filter(alert => alert.motivo === "medição contestada");
    expect(contested.length).toBeGreaterThan(0);
    expect(new Set(contested.map(alert => alert.taxon))).toEqual(new Set(["Cedecea"]));
    expect(captureIndexRows().flatMap(row => captureDomains.flatMap(domain => row.scores[domain]!.contributions)).some(item => item.taxon === "Cedecea")).toBe(false);
    expect(captureIndexRows().flatMap(row => row.alerts).some(alert => alert.motivo === "baixo suporte")).toBe(true);
  });

  it("uma categoria só não é diluída, e a maturidade de cada categoria é declarada", () => {
    const row = one(2, "780");
    expect(row.scores["Saúde humana"]!.score).toBeCloseTo(0.436, 2);
    expect(captureIndexView(row).general).toBe("0,44");
    expect(captureIndexView(row).elevated).toBe("1 de 3 categorias na faixa de referência (0,15)");
    expect(captureIndexRows().filter(item => item.general! >= 0.15)).toHaveLength(45);
    expect(captureIndexRows().filter(item => item.elevated === 2)).toHaveLength(7);
    expect(captureIndexMeta.maturity.map(item => item.level)).toEqual(["evidência parcial", "evidência parcial", "com base de comparação"]);
  });

  it("diatomáceas pontuam só onde há resultado delas (cloroplasto) e só acima da base da rede", () => {
    const row = one(3, "188"), score = row.scores.Operacional!, main = score.contributions[0];
    expect([row.rank, row.predominant, score.component]).toEqual([2, "Operacional", "ALGAS"]);
    expect(main).toMatchObject({ rank: "grupo", gravidade: 3, aplicabilidade: 1, base: 0.0209, component: "ALGAS" });
    expect(main.q).toBeCloseTo(row.descriptors.diatomShare! - 0.0209, 12);
    expect(captureIndexView(row).diatoms).toBe("19,1%");
    const scored = captureIndexRows().filter(item => item.scores.Operacional!.contributions.some(c => c.component === "ALGAS"));
    expect(scored).toHaveLength(23);
    expect(scored.every(item => item.descriptors.diatomShare! > 0.0209)).toBe(true); // sem resultado de diatomácea acima da base, não pontua
    for (const campaign of [1, 2, 3]) for (const sia of ["78", "780"]) expect(one(campaign, sia).rank!).toBeLessThanOrEqual(10); // Iraí segue perto do topo
  });

  it("dominância fora do padrão é alerta para qualquer organismo e nunca entra na nota", () => {
    const alerts = captureIndexRows().flatMap(row => row.alerts.map(alert => ({ row, alert }))).filter(item => item.alert.motivo === "dominância anômala");
    expect(alerts).toHaveLength(72);
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
    expect(captureIndexView(row).domains[2].score).toBe("0,25");
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
    expect(rows.flatMap(item => captureDomains.flatMap(domain => item.scores[domain]!.contributions)).some(c => /^(Hypanus|Salmo|Rhizoprionodon|Perna)/.test(c.taxon))).toBe(false);
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
    expect(captureIndexMeta.status).toContain("aprovados pelo administrador");
  });

  it("diz o que foi medido e atribui o principal ao marcador que decidiu a nota (auditoria de 20/11)", () => {
    const onlyCoi = one(2, "257");
    expect([onlyCoi.components["16S"].status, onlyCoi.components.COI.status]).toEqual(["ausente", "disponível"]);
    expect(captureIndexView(onlyCoi).coverage).toBe("só COI (16S ausente)");
    const texts = captureIndexRows().map(row => captureIndexView(row).coverage);
    expect([texts.filter(text => text === "16S e COI").length, texts.filter(text => text.startsWith("só 16S")).length, texts.filter(text => text.startsWith("só COI")).length]).toEqual([177, 47, 1]);
    const row = one(3, "780"), score = row.scores.Operacional!, domain = captureIndexView(row).domains[1];
    expect(score.component).toBe("COI");
    expect(score.contributions[0].component).toBe("16S"); // o maior entre todos os marcadores não é o que decidiu a nota
    expect(domain.main.startsWith(score.contributions.find(item => item.component === "COI")!.taxon)).toBe(true);
    for (const item of captureIndexRows()) for (const key of captureDomains) {
      const s = item.scores[key]!, view = captureIndexView(item).domains[captureDomains.indexOf(key)];
      const winner = s.contributions.find(c => c.component === s.component);
      if (winner) expect(view.main.startsWith(winner.taxon)).toBe(true);
    }
    const head = captureIndexAuditCsv(captureIndexRows(3)).split("\r\n")[0];
    expect(head).toContain("media_quadratica_das_tres_notas"); // é das notas atuais, não o valor arquivado da versão 0.5
    expect(head).not.toContain("v05");
  });

  it("declara os pontos cegos, incluindo o mosquito-fantasma de Passaúna", () => {
    expect(captureIndexMeta.blindSpots.map(item => item.tema).join(" ")).toMatch(/Chaoboridae/);
    expect(captureIndexMeta.blindSpots.length).toBeGreaterThanOrEqual(4);
  });

  it("resumo por campanha: um voto por ponto", () => {
    const campaigns = captureIndexCampaigns();
    expect(campaigns.map(item => [item.campaign, item.points, item.measured])).toEqual([["C1", 73, 73], ["C2", 76, 76], ["C3", 76, 76]]);
    for (const item of campaigns) expect(item.bands.reduce((sum, band) => sum + band.count, 0)).toBe(item.measured);
    const rows = captureIndexRows(2);
    expect(campaigns[1].mean).toBe(formatCaptureIndex(rows.reduce((sum, row) => sum + row.general!, 0) / rows.length));
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
    expect(csv.headers.get("content-disposition")).toContain("indice-captacao-IR-CAPTACAO-0.7-piloto-C2-leitura.csv");
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await csv.arrayBuffer()); // text() descartaria o BOM
    expect(csv.headers.get("x-export-sha256")).toBe(sha256Hex(body));
    expect(body).toBe(captureIndexCsv(captureIndexRows(2)));
    const payload = await json.json(), [head, ...lines] = table(body);
    expect(payload.rows).toHaveLength(76);
    expect(payload.rows.slice(0, 3).map((row: { position: string }) => row.position)).toEqual(["1º de 76", "2º de 76", "3º de 76"]);
    expect(lines).toHaveLength(76);
    for (const view of payload.rows) {
      const cells = lines.find(line => line[2] === view.sia)!;
      const at = (name: string) => cells[head.indexOf(name)];
      expect(cells).toHaveLength(head.length);
      expect([at("indice_geral"), at("piso_a_teto"), at("posicao_na_campanha"), at("predominante"), at("categorias_na_faixa")]).toEqual([view.general, view.range, view.position, view.predominant, view.elevated]);
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
    const row = one(3, "78"), contribution = lines.find(line => line[sia] === "78" && line[type] === "contribuicao" && line[head.indexOf("taxon")] === "Microcystis")!;
    expect(Number(contribution[head.indexOf("geral")])).toBe(row.general);
    expect(contribution[head.indexOf("ficha")]).toBe("CUR-Microcystis-S");
    expect(contribution[head.indexOf("corrida")]).toBe("C3_NextSeq");
    expect(captureIndexAuditCsv(captureIndexRows(3))).toContain("alerta: medição contestada");
  });
});
