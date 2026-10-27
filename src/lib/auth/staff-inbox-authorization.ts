import {
  getEntraStaffAuthConfig,
  isLegacyAdminUiLoginEnabled,
} from "@/lib/auth/staff-auth-config";
import {
  isAllowedStaffEmail,
  normalizeStaffEmail,
} from "@/lib/auth/staff-allowlist";
import {
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

export interface StaffInboxUser {
  name: string | null;
  email: string;
}

export interface StaffInboxAuthorization {
  authMethod: "entra" | "legacy";
  actorId: string;
  user: StaffInboxUser | null;
}

interface EntraSession {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

export interface StaffInboxAuthorizationOptions {
  resolveEntraSession?: () => Promise<
    EntraSession | null
  >;
  legacyLoginEnabled?: boolean;
}

async function resolveDefaultEntraSession():
  Promise<EntraSession | null> {
  if (
    !process.env.AUTH_SECRET ||
    !getEntraStaffAuthConfig()
  ) {
    return null;
  }

  const { auth } = await import(
    "@/auth"
  );
  return auth();
}

export async function resolveStaffInboxAuthorization(
  request: Request,
  options: StaffInboxAuthorizationOptions = {},
): Promise<StaffInboxAuthorization | null> {
  const session = await (
    options.resolveEntraSession ??
    resolveDefaultEntraSession
  )();

  if (session) {
    const email = normalizeStaffEmail(
      session.user?.email,
    );

    if (
      !email ||
      !isAllowedStaffEmail(email)
    ) {
      return null;
    }

    return {
      authMethod: "entra",
      actorId: email,
      user: {
        name:
          session.user?.name ?? null,
        email,
      },
    };
  }

  const legacyLoginEnabled =
    options.legacyLoginEnabled ??
    isLegacyAdminUiLoginEnabled();

  if (
    legacyLoginEnabled &&
    hasValidAdminUiSession(request)
  ) {
    return {
      authMethod: "legacy",
      actorId: "legacy-admin-ui",
      user: null,
    };
  }

  return null;
}
