import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api: Route Handler'lar kendi auth'unu yapıyor (createClient + getUser,
     *   yetkisizde 401). Middleware'i /api'den çıkardık çünkü soft-nav'da session
     *   refresh anına denk gelen API fetch'ine middleware'in yanıtı yeniden
     *   sarması + chunked Set-Cookie eklemesi HTTP/2 framing'i bozup
     *   ERR_HTTP2_PROTOCOL_ERROR'a yol açıyordu (hard reload'da session zaten
     *   document isteğinde tazelendiği için sorun çıkmıyordu).
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
