import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma, UserRole } from "@qc/db";

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Chạy sau reverse proxy (Traefik/Nginx), không phải Vercel — như hoanggia-crm.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Tên đăng nhập", type: "text" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!username || !password) return null;
        return verifyCredentials(username, password);
      },
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      // Bắt buộc: middleware (src/middleware.ts) chỉ redirect về /login khi
      // callback này trả về false — không có nó, `auth as middleware` chỉ làm
      // mới session mà không chặn request nào (xem next-auth/lib/index.d.ts).
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as AuthUser).id;
        token.username = (user as AuthUser).username;
        token.fullName = (user as AuthUser).fullName;
        token.role = (user as AuthUser).role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.username = token.username as string;
      session.user.fullName = token.fullName as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
