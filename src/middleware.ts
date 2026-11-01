import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/logg-inn", "/api/helse"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const secret = process.env.SESSION_SECRET;
  const user = secret ? await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/logg-inn";
  url.search = pathname === "/" ? "" : `?neste=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
