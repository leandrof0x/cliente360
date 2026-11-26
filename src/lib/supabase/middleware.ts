import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";

const PUBLIC_PATHS = ["/", "/ingresar", "/registro", "/recuperar", "/auth", "/configuracion-pendiente"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    if (request.nextUrl.pathname !== "/configuracion-pendiente") {
      return NextResponse.redirect(new URL("/configuracion-pendiente", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Importante: getUser() valida el token con Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!user && !isPublic(pathname)) {
    const url = new URL("/ingresar", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (user && (pathname === "/ingresar" || pathname === "/registro")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}
