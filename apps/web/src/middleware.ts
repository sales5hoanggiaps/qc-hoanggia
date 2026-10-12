export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|logo.svg|manifest.webmanifest|icon-192.png|icon-512.png|apple-touch-icon.png).*)",
  ],
};
