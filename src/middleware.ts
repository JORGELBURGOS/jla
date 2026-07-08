import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const PUBLIC_PATHS = ["/login", "/auth/callback", "/_next", "/api", "/logo.png", "/favicon"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rutas públicas — no requieren auth
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers }
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) }
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Sin sesión → login
  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  const email = user.email?.toLowerCase() ?? ""

  // Ruta /admin → solo el admin
  if (pathname.startsWith("/admin") && email !== ADMIN_EMAIL) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
