import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserFromSession } from "@/lib/auth";
import { getUserLectures } from "@/lib/db";
import { OWNER_COOKIE, verifyOwnerToken } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const user = getUserFromSession(cookieStore);

  // If not logged in, they don't have kept recordings in their library
  if (!user) {
    return NextResponse.json({
      lectures: [],
      isAuthenticated: false,
    });
  }

  const ownerId =
    user.id || (verifyOwnerToken(cookieStore.get(OWNER_COOKIE)?.value) ?? "");

  const lectures = await getUserLectures(ownerId, 25);

  // Map to exclude heavy raw embeddings
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const slim = lectures.map(({ embedding, ...rest }) => rest);

  return NextResponse.json({
    lectures: slim,
    isAuthenticated: true,
  });
}
