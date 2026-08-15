import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const supabaseOrigin = safeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", `img-src 'self' blob: data: https://tile.openstreetmap.org https://drive.google.com https://lh3.googleusercontent.com${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`, "font-src 'self' data:", "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers); headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && key) {
    const supabase = createServerClient(url, key, { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { response = NextResponse.next({ request: { headers } }); for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options); },
    } });
    await supabase.auth.getUser();
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function safeOrigin(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch { return ""; }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
