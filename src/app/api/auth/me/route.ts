import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserFromSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const user = getUserFromSession(cookieStore);
  return NextResponse.json({ user });
}
