import { NextResponse, type NextRequest } from "next/server";
import {
  OWNER_COOKIE,
  OWNER_COOKIE_OPTIONS,
  resolveOwner,
} from "@/lib/identity";

/**
 * Mints the per-visitor owner cookie that scopes every saved lecture.
 *
 * Runs on the Node runtime (the Next 16 default for `proxy`), so the HMAC in
 * `@/lib/identity` is available. Stateless by design — it reads and writes one
 * cookie and nothing else, which keeps it safe to run on every request.
 *
 * Idempotent: an existing valid cookie is passed through untouched, so this
 * does not re-sign on each navigation.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(OWNER_COOKIE)?.value;
  const owner = resolveOwner(existing);

  if (!owner.isNew) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(OWNER_COOKIE, owner.token, OWNER_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image optimization, and the upload route.
     *
     * The API routes must be included so a first-time API call is already
     * scoped: `/api/structure` and `/api/search` read the cookie, and a missing
     * one would mean an unowned lecture. Both re-verify it themselves rather
     * than trusting this matcher, which is what Next 16's proxy docs advise.
     *
     * `/api/transcribe` is excluded deliberately, and not for performance:
     *
     *   - When a proxy is active, Next clones the request body for every
     *     non-GET request it handles, so the body can be read in both the proxy
     *     and the route handler.
     *   - That clone is capped at 10MB by default
     *     (`experimental.proxyClientMaxBodySize`). Past the cap Next ends the
     *     clone early and logs a warning — it does NOT reject the request, so
     *     the route silently receives a truncated body.
     *   - This route accepts up to `MAX_UPLOAD_BYTES` (25MB), so uploads past
     *     10MB were being cut mid-multipart and forwarded to Groq, returning a
     *     partial or garbled transcript with no error to the student. Keeping
     *     the route out of the matcher means the clone never happens, which
     *     also avoids buffering ~25MB per concurrent upload.
     *
     * Excluding it is safe because `/api/transcribe` never reads the owner
     * cookie — it only writes Groq's transcript back and is rate-limited by IP.
     * The follow-up `/api/structure` call, which does persist, is still proxied
     * and mints the cookie there. If this route ever gains owner scoping, it
     * must be added back to the matcher. `tests/proxy.test.ts` enforces that.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|api/transcribe).*)",
  ],
};
