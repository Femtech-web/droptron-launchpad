import { NextResponse } from "next/server";

import { currentWalletSession } from "@/lib/wallet-session";

export async function GET() {
  const session = await currentWalletSession();
  return NextResponse.json({ session });
}
