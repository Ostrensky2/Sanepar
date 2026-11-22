import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fieldCivilDay, readFieldReferences, type FieldImportSource } from "./field-references";

const point = (code: string, date: string, campaign = "1") => ({ code, date, campaign, original: { lat: -25, lon: -49 } });
const source = (id: string, points: unknown, file_name = "campo.xlsx"): FieldImportSource => ({ id, file_name, points, created_at: "2026-01-01" });

describe("referências de campo persistidas", () => {
  it("exclui técnicos e reconcilia todas as planilhas, independente da ordem", () => {
    const rows = [source("tech", [point("106", "01/01/2026")], "__lab_risk_results__"),
      source("a", [point("106", "07/03/2026")]), source("b", [point("146", "03/03/2026"), point("241", "07/03/2026"), point("244", "08/03/2026")]),
      source("bad", [point("106", "01/01/2026")], "__technical.xlsx")];
    const result = readFieldReferences(rows, 1);
    expect(result.map(p => [p.sia, p.sourceDate])).toEqual([["SIA-0106", "2026-03-07"], ["SIA-0146", "2026-03-03"], ["SIA-0241", "2026-03-07"], ["SIA-0244", "2026-03-08"]]);
    expect(readFieldReferences(rows.reverse(), 1)).toEqual(result);
    expect(result[0]).toMatchObject({ sourceId: "a", sourceDateRaw: "07/03/2026", datePrecision: "civil_day", sourceCell: null, sourceQualification: "persisted_unverified", dateNature: "declared_reference" });
  });
  it("preserva composto, réplicas e visitas conflitantes sem escolher data", () => {
    const result = readFieldReferences([source("a", [point("SIA-305/1037*", "21/02/2026"), { ...point("174", "12/06/2026", "2"), samplesReplicasEdna: "14/15" }, point("174", "18/06/2026", "2")]), source("b", [point("174", "13/06/2026", "2")])], 2);
    expect(result.map(p => p.sourceDate)).toEqual(["2026-06-12", "2026-06-18", "2026-06-13"]);
    expect(result[0].samplesReplicasEdna).toBe("14/15");
    const composed = readFieldReferences([source("a", [point("SIA-305/1037*", "21/02/2026")])], 1);
    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({ sia: "SIA-305/1037*", identityStatus: "ambiguous", originalSia: "SIA-305/1037*" });
  });
  it("mantém dia civil em UTC/São Paulo e rejeita precisão não demonstrada", () => {
    const previous = process.env.TZ;
    try {
      for (const tz of ["UTC", "America/Sao_Paulo"]) {
        process.env.TZ = tz;
        expect(fieldCivilDay("07/03/2026")).toBe("2026-03-07");
        expect(fieldCivilDay("2026-03-07")).toBe("2026-03-07");
        for (const value of ["31/02/2026", "2026-03-07T00:00:00Z", "", 46000]) expect(fieldCivilDay(value)).toBe("");
      }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  it("falha fechado para campanha contraditória, shape técnico e coordenadas inválidas", () => {
    expect(readFieldReferences([{ ...source("a", [point("11", "01/01/2026")]), campaign_key: "2" }, source("b", { riskPoints: [] })], 1)).toEqual([]);
    const result = readFieldReferences([source("a", [{ ...point("11", "unknown"), original: { lat: 999, lon: -49 } }])], 1);
    expect(result[0]).toMatchObject({ sourceDate: "", sourceDateRaw: "unknown", datePrecision: "unknown", original: null });
  });
  it.runIf(process.env.FIELD_REFERENCES_LOCAL === "1")("confere C1/C2 na cópia local exclusivamente em transação read-only", () => {
    const sql = `BEGIN READ ONLY;
SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,file_name,created_at,campaign_key,points FROM public.campaign_imports WHERE point_count>0) t;
ROLLBACK;`;
    const raw = execFileSync("docker", ["exec", "-i", "supabase_db_sanepar-local", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const rows = JSON.parse(raw) as FieldImportSource[];
    const c1 = readFieldReferences(rows, 1), c2 = readFieldReferences(rows, 2);
    for (const [sia, day] of [["0106", "07"], ["0146", "03"], ["0241", "07"], ["0244", "08"]]) {
      const found = c1.filter(p => p.sia === `SIA-${sia}`);
      expect(found.length).toBeGreaterThan(0);
      expect([...new Set(found.map(p => p.sourceDate))]).toEqual([`2026-03-${day}`]);
    }
    expect(c1.some(p => p.originalSia === "SIA-305/1037*" && p.identityStatus === "ambiguous")).toBe(true);
    expect([...new Set(c2.filter(p => p.sia === "SIA-0174").map(p => p.sourceDate))].sort()).toEqual(["2026-06-12", "2026-06-13", "2026-06-18"]);
    expect([...c1, ...c2].some(p => p.sourceFileName.startsWith("__"))).toBe(false);
  });
});
