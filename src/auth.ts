import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import {
  getEntraStaffAuthConfig,
} from "@/lib/auth/staff-auth-config";
import {
  getVerifiedEntraIdentifier,
  isAllowedStaffEmail,
} from "@/lib/auth/staff-allowlist";

const SESSION_MAX_AGE_SECONDS =
  8 * 60 * 60;
const entraConfig =
  getEntraStaffAuthConfig();

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  providers: entraConfig
    ? [
        MicrosoftEntraID({
          clientId:
            entraConfig.clientId,
          clientSecret:
            entraConfig.clientSecret,
          issuer: entraConfig.issuer,
          authorization: {
            params: {
              scope:
                "openid profile email",
            },
          },
        }),
      ]
    : [],
  callbacks: {
    async signIn({ user, profile }) {
      const identifier =
        getVerifiedEntraIdentifier(
          user,
          profile,
        );

      return isAllowedStaffEmail(
        identifier,
      );
    },
    async jwt({ token, user, profile }) {
      if (user || profile) {
        const identifier =
          getVerifiedEntraIdentifier(
            user ?? {},
            profile,
          );

        if (identifier) {
          token.email = identifier;
        } else {
          delete token.email;
        }
        const name =
          user?.name ?? token.name;
        if (typeof name === "string") {
          token.name = name;
        } else {
          delete token.name;
        }
        delete token.picture;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.name =
        typeof token.name === "string"
          ? token.name
          : null;
      session.user.email =
        typeof token.email === "string"
          ? token.email
          : "";
      session.user.image = null;

      const browserUser =
        session.user as unknown as Record<
          string,
          unknown
        >;
      delete browserUser.id;
      delete browserUser.emailVerified;

      return session;
    },
  },
});
