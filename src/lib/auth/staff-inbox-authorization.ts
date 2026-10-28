import {
  isLegacyAdminUiLoginEnabled,
} from "@/lib/auth/staff-auth-config";
import {
  isAllowedStaffEmail,
  normalizeStaffEmail,
} from "@/lib/auth/staff-allowlist";
import {
  readFirebaseStaffSession,
  type FirebaseStaffSession,
} from "@/lib/auth/staff-inbox-session";
import {
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

export interface StaffInboxUser {
  name: string | null;
  email: string;
}

export interface StaffInboxAuthorization {
  authMethod: "firebase" | "legacy";
  actorId: string;
  user: StaffInboxUser | null;
}

export interface StaffInboxAuthorizationOptions {
  readFirebaseSession?: (
    request: Request,
  ) => FirebaseStaffSession | null;
  legacyLoginEnabled?: boolean;
}

export async function resolveStaffInboxAuthorization(
  request: Request,
  options: StaffInboxAuthorizationOptions = {},
): Promise<StaffInboxAuthorization | null> {
  const session = (
    options.readFirebaseSession ??
    readFirebaseStaffSession
  )(request);

  if (session) {
    const email = normalizeStaffEmail(
      session.email,
    );

    if (
      !email ||
      !isAllowedStaffEmail(email)
    ) {
      return null;
    }

    return {
      authMethod: "firebase",
      actorId: email,
      user: {
        name:
          session.name,
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
