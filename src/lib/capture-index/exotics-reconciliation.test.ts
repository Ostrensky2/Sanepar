import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptureExoticsReconciliation } from "@/components/capture-exotics-reconciliation";
import { reconciliationIndexHash, reconciliationRows } from "./exotics-reconciliation";

describe("reconciliação congelada de exóticas 0.7", () => {
  it("conserva a versão, as 54 omissões e as 20 adições; os três mistos não são adições", () => {
    const doc = JSON.parse(readFileSync("src/lib/capture-index/indice-captacao.json", "utf8"));
    expect(doc.rowsSha256).toBe(reconciliationIndexHash);
    const count = (category: string) => [1, 2, 3].map(c => reconciliationRows.filter(r => r[0] === c && r[2] === category).reduce((sum, r) => sum+r[3], 0));
    expect(count("candidate-omitted")).toEqual([13, 13, 20]);
    expect(count("regional-omitted")).toEqual([2, 3, 3]);
    expect(count("reassigned-added")).toEqual([0, 15, 5]);
    expect(count("reassigned-mixed")).toEqual([0, 3, 0]);
    expect(count("nominal-listed")).toEqual([22, 27, 17]);
    expect(count("candidate-listed")).toEqual([28, 36, 10]);
  });
  it("expõe procedência, limites e leituras mistas separadas, sem SIA ou locais", () => {
    const render = (campaign: number) => renderToStaticMarkup(createElement(CaptureExoticsReconciliation, { campaign }));
    const html = render(2);
    for (const text of ["410 reads nominais", "257 reads reatribuídos", "Status regional pendente", "SHA-256 do XLSX", "<summary"]) expect(html).toContain(text);
    expect(html).not.toMatch(/SIA-\d|latitude|longitude/i);
    expect(render(3)).toContain("47 pontos NextSeq e um MiSeq");
    const unavailable = render(4);
    expect(unavailable).toContain("Sem reconciliação documentada");
    expect(unavailable).not.toContain("reads nominais");
  });
});
