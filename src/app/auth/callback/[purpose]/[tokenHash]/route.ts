import { GET as callbackGet } from "@/app/auth/callback/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ purpose: string; tokenHash: string }> },
) {
  const { purpose, tokenHash } = await params;
  const url = new URL(request.url);
  url.search = new URLSearchParams({ token_hash: tokenHash, type: purpose, next: "/definir-senha" }).toString();
  return callbackGet(new Request(url, request));
}
