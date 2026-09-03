import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { sessionTokenHash, WALLET_SESSION_COOKIE } from "@/lib/wallet-session";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WALLET_SESSION_COOKIE}=`))
    ?.slice(WALLET_SESSION_COOKIE.length + 1);
  const supabase = getSupabaseAdminClient();
  if (token && supabase) {
    await supabase
      .from("wallet_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", sessionTokenHash(decodeURIComponent(token)));
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(WALLET_SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  return response;
}
