import { requireApiSession } from "@/lib/api-auth";
import { captureIndexMeta, captureIndexRows } from "@/lib/capture-index";
import { summarizeEffects } from "@/lib/capture-index/effect-summary";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireApiSession(request,"data.view");
  if(!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const campaign = params.get("campaign");
  const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(!campaign || !/^[1-9]$/.test(campaign) || [...params].length!==1)
    return Response.json({error:"Informe somente uma campanha de 1 a 9."},{status:422,headers});
  return Response.json({version:captureIndexMeta.version,rowsSha256:captureIndexMeta.rowsSha256,
    summary:summarizeEffects(captureIndexRows(Number(campaign)),Number(campaign))},{headers});
}
