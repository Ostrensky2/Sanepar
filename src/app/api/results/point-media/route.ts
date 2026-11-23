import sharp from "sharp";
import { requireApiSession } from "@/lib/api-auth";
import { imageBytes, mediaById, mediaId, pointMedia } from "@/lib/results/point-media";
import { authorizedDiaryPointExists } from "@/lib/results/point-media-scope";

export const runtime = "nodejs";
const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export async function GET(req: Request) {
  for (const permission of ["data.view","campaigns.view"] as const) {
    const auth = await requireApiSession(req,permission);
    if (!auth.ok) return auth.response;
  }
  const query = new URL(req.url).searchParams, c = Number(query.get("campaign")), s = Number(query.get("sia")), id = query.get("id");
  if (id!==null ? (query.size!==1 || !/^[a-f0-9]{64}$/.test(id)) :
      (query.size!==2 || !/^[1-3]$/.test(query.get("campaign") ?? "") || !/^\d{1,6}$/.test(query.get("sia") ?? ""))) return new Response(null,{status:400,headers});
  try {
    if (id!==null) {
      const match = await mediaById(id);
      if (!match || !await authorizedDiaryPointExists(match.campaign,match.sia)) return new Response(null,{status:404,headers});
      const b = await imageBytes(match.item);
      if (b.length>32*1024*1024 || !(b.subarray(0,3).equals(Buffer.from("ffd8ff","hex")) || b.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")))) return new Response(null,{status:415,headers});
      // Derivative for display only; original stays private and EXIF is not sent.
      const jpg = await sharp(b,{limitInputPixels:50000000}).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).jpeg().toBuffer();
      return new Response(new Uint8Array(jpg),{headers:{...headers,"Content-Type":"image/jpeg"}});
    }
    if (!await authorizedDiaryPointExists(c,s)) return new Response(null,{status:404,headers});
    const {items,conflict,installed} = await pointMedia(c,s);
    const dates = [...new Set(items.map(i=>i.date))].sort();
    return Response.json({installed,status:conflict ? (items.length?"partial":"ambiguous") : items.length?"available":"unavailable",
      visits:dates.map(date=>({date,photos:[...new Set(items.filter(i=>i.date===date).map(i=>mediaId(c,s,i)))].map(key=>({id:key,src:`/api/results/point-media?id=${key}`}))}))},{headers});
  } catch { return new Response(null,{status:503,headers}); }
}
