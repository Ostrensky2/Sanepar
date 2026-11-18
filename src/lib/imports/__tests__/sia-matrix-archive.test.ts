import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveRequestError, applyArchiveBatches, partitionArchiveSheets, previewArchiveBatches, archivePackage, encodeArchiveRequest, prepareArchiveSheets, readArchiveCampaign, selectArchiveGroups, validateArchiveRequest, type ArchiveGroup, type ArchiveSheet, type ArchivePlan } from "../sia-matrix-archive";
import { matrixExecutionStatus, type DiarySnapshot, type MatrixPackage } from "../sia-matrices";
import type { FieldDiaryEntry } from "@/lib/field-diary";
const entry = { id: "real-id", campaignId: "campanha-1-verao-2026", campaignName: "1ª Campanha", sia: "SIA-0011", activities: ["Coleta de eDNA"], executionStatus: undefined } as FieldDiaryEntry;
const diary: DiarySnapshot = { entries: [entry], totalCount: 1, complete: true, persistence: "cloud" };
const table = { headers: ["B", "A"], rows: [{ sia: "SIA-0011", values: [0, 2] }] };
const pkg: MatrixPackage = { notes: [], sources: [{ name: "renamed.xlsx", hash: "a", campaign: 1, marker: "16S", rank: "familias", run: "run", matrix: table, associations: table }] };
afterEach(() => vi.unstubAllGlobals());
describe("contrato do acervo de matrizes", () => {
  const plan: ArchivePlan = { planDigest: "a".repeat(64), payloadHash: "b".repeat(64), new: 1, changed: 0, unchanged: 0, details: [] };
  function manyGroups() {
    const sheet = prepareArchiveSheets(pkg, diary, 1, { "renamed.xlsx": "run" })[0];
    return [{ ...sheet, headers: Array.from({ length: 500 }, (_, i) => `Taxon ${i}`), rows: Array.from({ length: 65 }, (_, i) => ({ sia: `SIA-${String(i).padStart(4, "0")}`, collection: `id-${i}`, values: Array(500).fill(0) })) }];
  }
  it("particiona grupos inteiros uma única vez, deterministicamente, respeitando limites", () => {
    const sheets = manyGroups(), batches = partitionArchiveSheets(sheets);
    expect(batches.map((b) => b.length)).toEqual([32, 32, 1]);
    expect(partitionArchiveSheets([{ ...sheets[0], rows: [...sheets[0].rows].reverse() }])).toEqual(batches);
    expect(new Set(batches.flat().map((s) => s.rows[0].sia)).size).toBe(65);
    for (const batch of batches) expect(new TextEncoder().encode(encodeArchiveRequest({ mode: "apply", sheets: batch, request: crypto.randomUUID(), expected: plan.planDigest })).length).toBeLessThanOrEqual(4_000_000);
  });
  it("três lotes: confirma 1, conflito no 2, não envia 3; nova prévia apenas do saldo", async () => {
    const batches = await previewArchiveBatches(manyGroups(), vi.fn().mockResolvedValue(plan));
    const apply = vi.fn().mockResolvedValueOnce(plan).mockRejectedValueOnce(new ArchiveRequestError("STALE_PLAN", 409));
    const stopped = await applyArchiveBatches(batches, apply);
    expect(stopped.map((b) => b.state)).toEqual(["confirmado", "verificar", "não enviado"]);
    expect(apply).toHaveBeenCalledTimes(2);
    await applyArchiveBatches(stopped, apply); expect(apply).toHaveBeenCalledTimes(2);
    const preview = vi.fn().mockResolvedValue(plan);
    const remaining = await previewArchiveBatches(stopped.filter((b) => b.state !== "confirmado").flatMap((b) => b.sheets), preview);
    const resume = vi.fn().mockResolvedValue(plan);
    const done = await applyArchiveBatches([stopped[0], ...remaining], resume);
    expect(resume).toHaveBeenCalledTimes(2); expect(done.every((b) => b.state === "confirmado")).toBe(true);
    expect(resume.mock.calls.flatMap(([input]) => input.sheets).some((s: ArchiveSheet) => s.rows[0].sia === "SIA-0000")).toBe(false);
  });
  it("resposta perdida repete UUID, payload e digest exatos; prévia incompleta bloqueia entrega", async () => {
    const batches = await previewArchiveBatches(manyGroups(), vi.fn().mockResolvedValue(plan));
    const send = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(plan);
    const stopped = await applyArchiveBatches(batches, send);
    expect(send).toHaveBeenCalledTimes(1);
    await applyArchiveBatches(stopped, send);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
    const preview = vi.fn().mockResolvedValueOnce(plan).mockRejectedValueOnce(new Error("offline"));
    await expect(previewArchiveBatches(manyGroups(), preview)).rejects.toThrow("offline");
    expect(preview).toHaveBeenCalledTimes(2);
  });
  it.each(["planDigest", "payloadHash"] as const)("recibo com %s divergente não confirma nem envia próximo lote", async (key) => {
    const batches = await previewArchiveBatches(manyGroups(), vi.fn().mockResolvedValue(plan));
    const send = vi.fn().mockResolvedValue({ ...plan, [key]: "c".repeat(64) });
    const result = await applyArchiveBatches(batches, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.map((b) => b.state)).toEqual(["verificar", "não enviado", "não enviado"]);
    expect(result[0].receipt).toBeUndefined();
  });
  it("payloadHash ausente em prévia, recibo ou ambos nunca confirma", async () => {
    const missing = { ...plan, payloadHash: undefined } as unknown as ArchivePlan;
    await expect(previewArchiveBatches(manyGroups(), vi.fn().mockResolvedValue(missing))).rejects.toThrow(/hashes/);
    const batches = await previewArchiveBatches(manyGroups(), vi.fn().mockResolvedValue(plan));
    const send = vi.fn().mockResolvedValue(missing);
    const result = await applyArchiveBatches(batches, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.map((b) => b.state)).toEqual(["verificar", "não enviado", "não enviado"]);
    const bothMissing = batches.map((b) => ({ ...b, plan: missing }));
    send.mockClear();
    const both = await applyArchiveBatches(bothMissing, send);
    expect(send).not.toHaveBeenCalled();
    expect(both.map((b) => b.state)).toEqual(["verificar", "não enviado", "não enviado"]);
  });
  it("publica recibo compacto e progresso do lote 1 enquanto o lote 2 está pendente", async () => {
    const batches = await previewArchiveBatches(manyGroups(), vi.fn().mockResolvedValue(plan));
    let finish!: (value: ArchivePlan) => void;
    const pending = new Promise<ArchivePlan>((resolve) => { finish = resolve; });
    const send = vi.fn().mockResolvedValueOnce(plan).mockReturnValueOnce(pending).mockResolvedValue(plan);
    const progress = vi.fn();
    const applying = applyArchiveBatches(batches, send, progress);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(progress.mock.calls[0][0].map((b: { state: string }) => b.state)).toEqual(["confirmado", "não enviado", "não enviado"]);
    expect(progress.mock.calls[0][0][0].receipt).toEqual({ planDigest: plan.planDigest, payloadHash: plan.payloadHash, new: 1, changed: 0, unchanged: 0 });
    expect(progress.mock.calls[0][0][0].receipt).not.toHaveProperty("details");
    finish(plan); await applying; expect(progress).toHaveBeenCalledTimes(3);
  });
  it("usa ID real legado e mantém zero sem enviar filename/hash na chave", () => {
    const sheets = prepareArchiveSheets(pkg, diary, 1, { "renamed.xlsx": "miseq-1" });
    expect(sheets[0].rows).toEqual([{ sia: "SIA-0011", collection: "real-id", values: [0, 2] }]);
    expect(encodeArchiveRequest({ mode: "preview", sheets })).not.toContain("renamed");
    expect(sheets[1].sheet).toBe("associations");
  });
  it("vazios/defaults não confirmam, negativo prevalece, status explícito não é inferido", () => {
    expect(matrixExecutionStatus({ ...entry, activities: ["", "Não informado"] })).toBe("planned");
    expect(matrixExecutionStatus({ ...entry, activities: ["Coleta não realizada"], collectionTime: "10:00" })).toBe("not_realized");
    expect(matrixExecutionStatus({ ...entry, executionStatus: "blocked", collectionTime: "10:00" })).toBe("blocked");
    expect(matrixExecutionStatus({ ...entry, activities: [], samplesReplicasEdna: "Não informado" })).toBe("planned");
  });
  it("recusa vínculo ambíguo e corrida não explícita", () => {
    expect(() => prepareArchiveSheets(pkg, diary, 1, {})).toThrow(/corrida/);
    expect(() => prepareArchiveSheets(pkg, { ...diary, entries: [entry, { ...entry, id: "b" }], totalCount: 2 }, 1, { "renamed.xlsx": "run" })).toThrow(/AMBÍGUA/);
  });
  it("recusa null e mede UTF8, não caracteres", () => {
    const sheets = prepareArchiveSheets(pkg, diary, 1, { "renamed.xlsx": "run" });
    const invalid = structuredClone(sheets); invalid[0].rows[0].values[0] = null as unknown as number;
    expect(() => validateArchiveRequest({ mode: "preview", sheets: invalid })).toThrow();
    expect(() => encodeArchiveRequest({ mode: "preview", sheets: [{ ...sheets[0], headers: ["á".repeat(2_000_000)] }] })).toThrow(/bytes/);
  });
  it("seleção dirigida preserva omitidos, não gera DELETE", () => {
    const sheets = prepareArchiveSheets(pkg, diary, 1, { "renamed.xlsx": "run" });
    const selected = selectArchiveGroups(sheets, [[1, "SIA-0011", "real-id", "16S", "run", "familias", "matrix"]]);
    expect(selected).toHaveLength(1); expect(selected[0].sheet).toBe("matrix");
    expect(encodeArchiveRequest({ mode: "preview", sheets: selected })).not.toContain("delete");
  });
  it("outro navegador recupera via GET e envia revision até fim, sem localStorage", async () => {
    const group: ArchiveGroup = { scope: [1, "SIA-0011", "real-id", "16S", "run", "familias", "matrix"], version: 1, counts: { A: 2, B: 0 } };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ groups: [group], revision: "a".repeat(64), next: group.scope })).mockResolvedValueOnce(Response.json({ groups: [], revision: "a".repeat(64), next: null }));
    vi.stubGlobal("fetch", fetch);
    const groups = await readArchiveCampaign(1); expect(groups).toEqual([group]);
    expect(fetch.mock.calls[1][0]).toContain("revision=");
    const restored = await archivePackage(groups, diary);
    expect(restored.sources[0].matrix).toEqual({ headers: ["A", "B"], rows: [{ sia: "SIA-0011", values: [2, 0] }] });
  });
  it("não mistura páginas de revisões diferentes nem vínculos alterados", async () => {
    const scope: ArchiveGroup["scope"] = [1, "SIA-0011", "wrong-id", "16S", "run", "familias", "matrix"];
    await expect(archivePackage([{ scope, version: 1, counts: { A: 0 } }], diary)).rejects.toThrow(/vínculo/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ groups: [], revision: "a".repeat(64), next: scope })).mockResolvedValueOnce(Response.json({ groups: [], revision: "b".repeat(64), next: null })));
    await expect(readArchiveCampaign(1)).rejects.toThrow(/mudou/);
  });
  it("ordem de cabeçalhos/arquivos não se torna identidade científica", () => {
    const sheets: ArchiveSheet[] = prepareArchiveSheets(pkg, diary, 1, { "renamed.xlsx": "run" });
    validateArchiveRequest({ mode: "preview", sheets: sheets.map((s) => ({ ...s, headers: [...s.headers].reverse(), rows: s.rows.map((r) => ({ ...r, values: [...r.values].reverse() })) })) });
    expect(sheets[0].headers).toEqual(["B", "A"]);
  });
});
