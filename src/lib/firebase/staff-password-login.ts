export interface FirebasePasswordUser {
  getIdToken: (
    forceRefresh?: boolean,
  ) => Promise<string>;
}

export type StaffPasswordLoginErrorKind =
  | "invalid_credentials"
  | "unauthorized"
  | "session_exchange_failed";

export class StaffPasswordLoginError
  extends Error {
  constructor(
    public readonly kind:
      StaffPasswordLoginErrorKind,
  ) {
    super("Staff password login failed");
    this.name = "StaffPasswordLoginError";
  }
}

const INVALID_CREDENTIAL_CODES = new Set([
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/invalid-email",
  "auth/missing-password",
]);

function readFirebaseErrorCode(
  error: unknown,
): string | undefined {
  return error !== null &&
    typeof error === "object" &&
    typeof (error as { code?: unknown })
      .code === "string"
    ? (error as { code: string }).code
    : undefined;
}

export function isInvalidFirebaseCredentialError(
  error: unknown,
): boolean {
  const code = readFirebaseErrorCode(error);
  return code !== undefined &&
    INVALID_CREDENTIAL_CODES.has(code);
}

export async function exchangeFirebaseStaffSession(
  user: FirebasePasswordUser,
  options: {
    forceRefresh?: boolean;
    fetchImplementation?: typeof fetch;
  } = {},
): Promise<void> {
  let response: Response;
  try {
    const idToken = await user.getIdToken(
      options.forceRefresh ?? false,
    );
    response = await (
      options.fetchImplementation ?? fetch
    )(
      "/api/admin/ui/auth/firebase-session",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({ idToken }),
      },
    );
  } catch {
    throw new StaffPasswordLoginError(
      "session_exchange_failed",
    );
  }

  if (response.status === 403) {
    throw new StaffPasswordLoginError(
      "unauthorized",
    );
  }
  if (!response.ok) {
    throw new StaffPasswordLoginError(
      "session_exchange_failed",
    );
  }
}

export async function authenticateStaffWithPassword<
  Auth,
>(input: {
  auth: Auth;
  email: string;
  password: string;
  signIn: (
    auth: Auth,
    email: string,
    password: string,
  ) => Promise<{
    user: FirebasePasswordUser;
  }>;
  exchangeSession: (
    user: FirebasePasswordUser,
    forceRefresh: boolean,
  ) => Promise<void>;
}): Promise<FirebasePasswordUser> {
  let credential: {
    user: FirebasePasswordUser;
  };

  try {
    credential = await input.signIn(
      input.auth,
      input.email.trim(),
      input.password,
    );
  } catch (error) {
    if (
      isInvalidFirebaseCredentialError(
        error,
      )
    ) {
      throw new StaffPasswordLoginError(
        "invalid_credentials",
      );
    }
    throw error;
  }

  await input.exchangeSession(
    credential.user,
    false,
  );
  return credential.user;
}

export async function retryFirebaseStaffSession(
  currentUser: FirebasePasswordUser | null,
  exchangeSession: (
    user: FirebasePasswordUser,
    forceRefresh: boolean,
  ) => Promise<void>,
): Promise<void> {
  if (!currentUser) {
    throw new StaffPasswordLoginError(
      "session_exchange_failed",
    );
  }

  await exchangeSession(
    currentUser,
    true,
  );
}
