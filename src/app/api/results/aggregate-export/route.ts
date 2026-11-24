import { requireApiSession } from "@/lib/api-auth";
import { results08Aggregate } from "@/lib/results-08-aggregate";
import { results08Csv } from "@/lib/results-08-export";
import { METHOD_LABEL, RESULTS_08_CAMPAIGNS, RESULTS_08_SOURCE_SHA256, type Results08Campaign } from "@/lib/results-08-contract";
import { addAggregateResults } from "@/lib/imports/sia-integrated-results";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Results-Version": "0.8", "X-Export-Scope": "per-campaign", "X-Source-SHA256": RESULTS_08_SOURCE_SHA256 };
export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.view");
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams, format = query.get("format") ?? "csv", group = query.get("group");
  if ([...query.keys()].some(key => !["format", "group"].includes(key) || query.getAll(key).length !== 1) || !["csv", "json", "xlsx"].includes(format) || (group !== null && !RESULTS_08_CAMPAIGNS.includes(group as Results08Campaign))) return Response.json({ error: "Opção inválida." }, { status: 422, headers });
  try {
    const data = results08Aggregate();
    if (format === "xlsx") {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Yva'e";
      workbook.title = "Resultados do método 3.0 por campanha";
      workbook.subject = `${data.politica}; ${data.schema}`;
      const sheet = workbook.addWorksheet("Por campanha 3.0");
      addAggregateResults(sheet, data, group === null ? undefined : group as Results08Campaign);
      sheet.views = [{state:"frozen",ySplit:1}];
      sheet.getRow(1).font = {bold:true};
      sheet.columns.forEach((column,index)=>{column.width=index===1?25:index===3?20:18;});
      for (const column of [8,9,10]) sheet.getColumn(column).numFmt = "0.000000000000000";
      const provenance = workbook.addWorksheet("Fonte");
      provenance.addRows([["Método",METHOD_LABEL],["Política",data.politica],["Schema",data.schema],["SHA-256 da fonte",RESULTS_08_SOURCE_SHA256],["Escopo","Estatísticas por campanha; as campanhas não são juntadas"],["Ausentes","Célula vazia = sem estimativa; zero numérico preservado"],["Campanha",group ?? "C1, C2 e C3, cada uma à parte"]]);
      provenance.getColumn(1).width=22;provenance.getColumn(2).width=72;
      const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
      return new Response(bytes, {headers:{...headers,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="resultados-metodo-3.0-por-campanha-${group ?? "C1-C2-C3"}.xlsx"`,"Content-Length":String(bytes.byteLength)}});
    }
    // O grupo `total` da fonte serve só à conferência interna; a resposta traz cada campanha à parte.
    if (format === "json") return Response.json({ ...data, sourceSha256: RESULTS_08_SOURCE_SHA256, grupos: Object.fromEntries((group ? [group as Results08Campaign] : RESULTS_08_CAMPAIGNS).map(key => [key, data.grupos[key]])) }, { headers });
    return new Response(results08Csv(data, group === null ? undefined : group as Results08Campaign), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="resultados-metodo-3.0-por-campanha-${group ?? "C1-C2-C3"}.csv"` } });
  } catch { return Response.json({ error: "Resultados por campanha indisponíveis." }, { status: 503, headers }); }
}
