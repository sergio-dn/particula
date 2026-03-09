import type { NextAuthConfig } from "next-auth"

// Edge-compatible auth config (sin Prisma, sin pg)
// Usado por el middleware para validar sesiones JWT
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard")
      if (isOnDashboard) return isLoggedIn
      if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl))
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? "VIEWER"
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role ?? "VIEWER"
      }
      return session
    },
  },
}
