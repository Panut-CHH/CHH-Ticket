import { NextResponse } from "next/server";

const PRODUCTION_DOMAIN = "https://chh-ticket.evergreenchh.tech";

export function middleware(request) {
  // โหมด dev (npm run dev) = ไม่ redirect เลย
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const hostname = request.nextUrl.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  // ถ้าเป็น localhost ให้ผ่านปกติ ไม่ redirect
  if (isLocalhost) {
    return NextResponse.next();
  }

  // ถ้าไม่ใช่ localhost และไม่ใช่ production domain อยู่แล้ว → redirect ไป production
  const isProductionDomain = hostname.includes("chh-ticket.evergreenchh.tech");
  if (!isProductionDomain) {
    const path = request.nextUrl.pathname + request.nextUrl.search;
    const url = new URL(path, PRODUCTION_DOMAIN);
    return NextResponse.redirect(url, 308); // 308 = permanent redirect
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
