import { describe, expect, it } from "vitest";
import { canonical, digest } from "./canonical";
import { buildItems, listObjects, pointKey, type ObjectRef, type Source } from "./export";
import { FIELDS, totalsOf, type WireItem } from "./protocol";

const C1 = "1ª Campanha - Verão 2026";
const C2 = "2ª Campanha - Outono 2026";

function source(overrides: Partial<Source> = {}): Source {
  return {
    entries: [
      {
        id: "e1", campaign_id: "campanha-1-verao-2026", campaign_name: C1, campaign_day: 1, entry_date: "2026-03-10",
        location_name: "Represa Alfa", sia: "9001", latitude: -25.4, longitude: -49.2, coordinate_source: "gps",
        gps_accuracy_m: 0, municipality: "Vila Aurora", activities: ["Coleta de eDNA"], field_team_members: [],
        execution_status: "realized", created_by_name: "Quem lançou", updated_at: "2026-03-10T20:00:00Z",
        photos: [
          { id: "f1", url: "x", bucket: "photos", path: "a/um.jpg", caption: "Margem" },
          { id: "f2", url: "https://exemplo.invalid/antiga.jpg", caption: "Só link" },
          { id: "f3", url: "x", bucket: "photos", path: "a/perdida.jpg" },
        ],
      },
      { id: "e2", campaign_id: null, campaign_name: C2, entry_date: "2026-06-01", location_name: "Ponto de apoio", sia: null, latitude: null, longitude: null, municipality: "Porto Sereno", photos: [{ id: "f1", url: "x", bucket: "photos", path: "a/um.jpg" }] },
    ],
    samples: [{ id: "s1", entry_id: "e1", sample_code: "TST-1", quantity: 0, depth_m: null }],
    parameters: [{ id: "ph", label: "pH", unit: "", min_value: 0, max_value: 14, applies_to: ["water"], uses_depth: true, active: true, is_base: true }],
    readings: [{ id: "r1", entry_id: "e1", parameter_id: "ph", value: 0, unit: "", depth_m: 0 }],
    documents: [
      { id: "d1", title: "Plano", campaign: C1, point: "", date_label: "01/03/2026", type: "Plano de trabalho", source: "storage", storage_bucket: "documents", storage_path: "p/plano.pdf" },
      { id: "d2", title: "Laudo", campaign: C1, point: "", date_label: "", type: "Laudos", source: "storage", storage_bucket: "documents", storage_path: "p/laudo.pdf" },
      { id: "d3", title: "Institucional", campaign: "", point: "", date_label: "", type: "Institucionais", source: "link" },
      { id: "d4", title: "Relatório de campo do ponto", campaign: "", point: "9001", date_label: "", type: "Relatórios", source: "link" },
      { id: "d5", title: "Relatório da vistoria", campaign: "", point: "", date_label: "", type: "Relatórios", source: "storage", storage_bucket: "documents", storage_path: "p/vistoria.pdf" },
      { id: "d6", title: "Laudo anexado à vistoria", campaign: C1, point: "9001", date_label: "", type: "Laudos", source: "storage", storage_bucket: "documents", storage_path: "p/laudo2.pdf" },
      { id: "d7", title: "Relatório citado em duas ações", campaign: "", point: "", date_label: "", type: "Relatórios", source: "link" },
    ],
    campaignImports: [
      {
        id: "imp-2", campaign_key: "campanha-1-verao-2026", created_at: "2026-03-01T12:00:00Z",
        points: [
          { code: "9001", point: "Represa Alfa", campaign: C1, date: "10/03/2026", municipality: "Vila Aurora", waterBody: "Rio Claro", original: { lat: -25.41, lon: -49.2 } },
          { code: "9004", point: "Córrego Delta", campaign: C1, date: "12/03/2026", municipality: "Vila Aurora", waterBody: "", original: null },
          { title: "Documento antigo", type: "Relatórios" },
          { eventName: "Evento antigo", objectives: "x" },
        ],
      },
      {
        id: "imp-3", campaign_key: "campanha-2-outono-2026", created_at: "2026-05-20T12:00:00Z",
        points: [
          { code: "SIA 9001", point: "Represa Alfa", campaign: C2, date: "2026-06-01", municipality: "Vila Aurora", waterBody: "Rio Claro", original: { lat: -25.5, lon: -49.3 } },
          { code: "9004", point: "Córrego Delta - montante", campaign: C2, date: "2026-06-03", municipality: "Vila Aurora", original: { lat: -25.6, lon: -49.4 } },
        ],
      },
    ],
    campaignImportRevisions: [
      { id: "imp-1", campaignKey: "campanha-1-verao-2026" }, { id: "imp-2", campaignKey: "campanha-1-verao-2026" },
      { id: "imp-3", campaignKey: "campanha-2-outono-2026" },
    ],
    campaignManagement: { "campanha-1-verao-2026": { status: "Concluída", period: "10 a 12/03/2026", plannedPoints: "2", note: "", stages: [{ label: "PCR" }] } },
pointActions: [
      { id: "a1", event_name: "Vistoria", objectives: "Ver a margem", created_at_label: "20/04/2026", document: { id: "d5", title: "Relatório da vistoria", type: "Relatórios" }, points: [{ waterBody: "Rio Claro", municipality: "Vila Aurora", dates: "20/04/2026", results: "resultado de laboratório", photos: [] }] },
      { id: "a2", event_name: "Coleta extra", objectives: "", created_at_label: "21/04/2026", document: { id: "d6" }, points: [] },
      { id: "a3", event_name: "Reunião de campo", objectives: "", created_at_label: "22/04/2026", document: { id: "d7" }, points: [] },
      { id: "a4", event_name: "Outra reunião", objectives: "", created_at_label: "23/04/2026", document: { id: "d7" }, points: [] },
    ],
    storageObjects: [
      { bucket: "photos", path: "a/um.jpg", size: 1000, mime: "image/jpeg", version: "etag-1" },
      { bucket: "documents", path: "p/plano.pdf", size: 60_000_000, mime: "application/pdf", version: "etag-2" },
      { bucket: "documents", path: "p/laudo.pdf", size: 500, mime: "application/pdf", version: "etag-3" },
      { bucket: "documents", path: "p/vistoria.pdf", size: 700, mime: "application/pdf", version: "etag-4" },
      { bucket: "documents", path: "p/laudo2.pdf", size: 800, mime: "application/pdf", version: "etag-5" },
    ],
    ...overrides,
  };
}
const ready = (objects: ObjectRef[]): ObjectRef[] =>
  objects.map((o) => (o.state === "pending" ? { ...o, state: "ready", sha256: "a".repeat(64) } : o));
const find = (items: WireItem[], type: string, id: string) => items.find((i) => i.entityType === type && i.sourceId === id)!;

describe("identidade do ponto na origem", () => {
  it("segue a regra de unicidade do diário: SIA 12, sia-12 e 12 são o mesmo ponto", () => {
    expect(pointKey("SIA 12", "x")).toBe("sia:0012");
    expect(pointKey("sia-12", "y")).toBe("sia:0012");
    expect(pointKey("12", null)).toBe("sia:0012");
    expect(pointKey("", "Ponto de Apoio  Épsilon")).toBe("local:ponto de apoio epsilon");
    expect(pointKey(null, " ")).toBeNull();
  });
});

describe("arquivos do retrato", () => {
  const objects = listObjects(source());
  it("um objeto por arquivo do Storage, mesmo com dois vínculos", () => {
    expect(objects.filter((o) => o.path === "a/um.jpg")).toHaveLength(1);
  });
  it("arquivo ausente e acima do limite saem com motivo; laudo nem entra na lista", () => {
    expect(objects.find((o) => o.path === "a/perdida.jpg")).toMatchObject({ state: "missing" });
    expect(objects.find((o) => o.path === "p/plano.pdf")).toMatchObject({ state: "too_large" });
    expect(objects.some((o) => o.path === "p/laudo.pdf" || o.path === "p/laudo2.pdf")).toBe(false);
    expect(objects.find((o) => o.path === "a/um.jpg")).toMatchObject({ state: "pending", size: 1000, version: "etag-1" });
  });
});

describe("projeção dos dados de campo", () => {
  const data = source();
  const items = buildItems(data, ready(listObjects(data)));

  it("só exporta os campos da lista fechada de cada entidade", () => {
    for (const item of items) expect(Object.keys(item.payload).sort()).toEqual([...FIELDS[item.entityType]].sort());
    expect(JSON.stringify(items)).not.toContain("resultado de laboratório");
    expect(JSON.stringify(items)).not.toContain("PCR");
  });

  it("preserva zero, nulo e lista vazia", () => {
    expect(find(items, "sample", "s1").payload).toMatchObject({ quantity: 0, depthM: null });
    expect(find(items, "reading", "r1").payload).toMatchObject({ value: 0, depthM: 0 });
    expect(find(items, "entry", "e1").payload).toMatchObject({ gpsAccuracyM: 0, teamMembers: [], lat: -25.4 });
    expect(find(items, "entry", "e2").payload).toMatchObject({ lat: null, lon: null, sia: null, teamMembers: null });
  });

  it("o autor do lançamento sai como autor, com a ressalva na proveniência", () => {
    const entry = find(items, "entry", "e1");
    expect(entry.payload.authorName).toBe("Quem lançou");
    expect(entry.provenance.derivations.some((d) => d.field === "authorName" && d.rule.includes("não indica executor"))).toBe(true);
  });

  it("ponto: coordenada que varia entre campanhas não é escolhida; nomes divergentes ficam pendentes", () => {
    expect(find(items, "point", "sia:9001")).toMatchObject({
      payload: { code: "9001", name: "Represa Alfa", lat: null, lon: null, coordinateSource: null },
      provenance: { identityStatus: "authoritative" },
    });
    expect(find(items, "point", "sia:9004")).toMatchObject({
      payload: { name: null, nameVariants: ["Córrego Delta", "Córrego Delta - montante"] },
      provenance: { identityStatus: "derived-pending" },
    });
    expect(find(items, "point", "local:ponto de apoio")).toMatchObject({ payload: { code: null, name: "Ponto de apoio" }, provenance: { identityStatus: "derived" } });
  });

  it("planejamento: só a planilha vigente de cada campanha, com as revisões contadas; linhas que não são ponto ficam de fora", () => {
    const planned = items.filter((i) => i.entityType === "plannedPoint");
    expect(planned.map((i) => i.sourceId)).toEqual([
      "campanha-1-verao-2026|sia:9001|10/03/2026", "campanha-1-verao-2026|sia:9004|12/03/2026",
      "campanha-2-outono-2026|sia:9001|2026-06-01", "campanha-2-outono-2026|sia:9004|2026-06-03",
    ]);
    expect(planned[0].payload).toMatchObject({ lat: -25.41, lon: -49.2, revisionId: "imp-2" });
    expect(planned[1].payload).toMatchObject({ lat: null, lon: null });
    expect(find(items, "campaign", "campanha-1-verao-2026").payload).toMatchObject({ number: 1, status: "Concluída", planningRevisionId: "imp-2", planningRevisionCount: 2 });
    expect(find(items, "campaign", "campanha-2-outono-2026").payload).toMatchObject({ number: 2, status: null, planningRevisionCount: 1 });
  });

  it("fotos: vínculo separado do arquivo; link externo e arquivo perdido saem com motivo", () => {
    const one = find(items, "photo", "e1:f1").payload, two = find(items, "photo", "e2:f1").payload;
    expect(one.opaqueId).toBe(two.opaqueId);
    expect(one).toMatchObject({ objectState: "ready", sha256: "a".repeat(64), parentType: "entry", parentId: "e1" });
    expect(find(items, "photo", "e1:f2").payload).toMatchObject({ opaqueId: null, objectState: "not_stored" });
    expect(find(items, "photo", "e1:f3").payload).toMatchObject({ objectState: "missing", sha256: null });
  });

  it("documentos: campo só com finalidade e vínculo comprovados", () => {
    // Plano de trabalho ligado a uma campanha.
    expect(find(items, "document", "d1").payload).toMatchObject({ fieldScope: "field", campaignId: "campanha-1-verao-2026", actionId: null, objectState: "too_large" });
    // Categoria que não é de campo.
    expect(find(items, "document", "d3").payload).toMatchObject({ fieldScope: "undetermined" });
    // "Relatórios" ligado a um ponto, com "campo" no título: a categoria genérica e o título não bastam.
    expect(find(items, "document", "d4").payload).toMatchObject({ fieldScope: "undetermined", pointId: "sia:9001" });
    expect(String(find(items, "document", "d4").payload.fieldScopeReason)).toContain("não comprova");
    // "Relatórios" anexado a uma ação pontual: a finalidade é o próprio anexo.
    expect(find(items, "document", "d5").payload).toMatchObject({ fieldScope: "field", actionId: "a1", objectState: "ready" });
    // Anexo citado por duas ações: vínculo ambíguo, não escolhe nenhuma.
    expect(find(items, "document", "d7").payload).toMatchObject({ fieldScope: "undetermined", actionId: null });
  });

  it("documentos: laudo de laboratório fica fora do escopo mesmo ligado a campanha, ponto ou ação, e o arquivo nem é lido", () => {
    expect(find(items, "document", "d2").payload).toMatchObject({ fieldScope: "out_of_scope", opaqueId: null, sha256: null });
    expect(find(items, "document", "d6").payload).toMatchObject({ fieldScope: "out_of_scope", opaqueId: null, pointId: "sia:9001", actionId: "a2" });
  });

  it("ações pontuais saem sem o campo de resultados", () => {
expect(find(items, "action", "a1").payload).toEqual({ eventName: "Vistoria", objectives: "Ver a margem", createdAtLabel: "20/04/2026", places: ["Rio Claro · Vila Aurora · 20/04/2026"] });
    expect(JSON.stringify(find(items, "action", "a1"))).not.toContain("Relatório da vistoria");
  });

  it("é determinística, e o resumo de cada entidade confere", () => {
    const again = buildItems(source(), ready(listObjects(source())));
    expect(again).toEqual(items);
    for (const { contentHash, sourceUpdatedAt, ...rest } of items) {
      void sourceUpdatedAt;
      expect(digest(rest)).toBe(contentHash);
    }
    const changed = buildItems(source({ samples: [{ id: "s1", entry_id: "e1", sample_code: "TST-1", quantity: 1, depth_m: null }] }), ready(listObjects(source())));
    expect(find(changed, "sample", "s1").contentVersion).not.toBe(find(items, "sample", "s1").contentVersion);
  });

  it("totais: entidades por tipo, vínculos e arquivos distintos são contagens separadas", () => {
    const totals = totalsOf(items);
    expect(totals.rowsByEntityType).toMatchObject({ entry: 2, photo: 4, document: 7, point: 3, campaign: 2, plannedPoint: 4, action: 4 });
    // um.jpg (2 vínculos), perdida.jpg, plano.pdf e vistoria.pdf: quatro arquivos; os laudos não entram.
    expect(totals.distinctObjects).toBe(4);
    expect(totals.relationReferences).toBeGreaterThan(10);
  });
});

describe("JSON canônico", () => {
  it("ordena chaves e recusa o que não é JSON estável", () => {
    expect(canonical({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(() => canonical(Number.NaN)).toThrow();
    expect(() => canonical(-0)).toThrow();
    expect(() => canonical(new Date())).toThrow();
    expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
  });
});
