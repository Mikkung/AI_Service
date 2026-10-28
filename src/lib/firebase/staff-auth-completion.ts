export interface FirebaseCompletionUser {
  getIdToken: (
    forceRefresh?: boolean,
  ) => Promise<string>;
}

export type FirebaseCompletionResult =
  | {
      status: "success";
    }
  | {
      status: "invalid_link";
    }
  | {
      status: "session_exchange_failed";
    }
  | {
      status: "unauthorized";
    }
  | {
      status: "missing_user";
    };

export class FirebaseStaffSessionExchangeError
  extends Error {
  constructor(
    public readonly kind:
      | "unauthorized"
      | "exchange_failed",
  ) {
    super(
      "Firebase Staff Inbox session exchange failed",
    );
    this.name =
      "FirebaseStaffSessionExchangeError";
  }
}

export async function exchangeFirebaseStaffSession(
  user: FirebaseCompletionUser,
  options: {
    forceRefresh?: boolean;
    fetchImplementation?: typeof fetch;
  } = {},
): Promise<void> {
  const idToken = await user.getIdToken(
    options.forceRefresh ?? false,
  );
  const response = await (
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

  if (response.status === 403) {
    throw new FirebaseStaffSessionExchangeError(
      "unauthorized",
    );
  }
  if (!response.ok) {
    throw new FirebaseStaffSessionExchangeError(
      "exchange_failed",
    );
  }
}

async function exchangeResult(
  user: FirebaseCompletionUser,
  exchangeSession: (
    user: FirebaseCompletionUser,
    forceRefresh: boolean,
  ) => Promise<void>,
  forceRefresh: boolean,
): Promise<FirebaseCompletionResult> {
  try {
    await exchangeSession(
      user,
      forceRefresh,
    );
    return { status: "success" };
  } catch (error) {
    return {
      status:
        error instanceof
          FirebaseStaffSessionExchangeError &&
        error.kind === "unauthorized"
          ? "unauthorized"
          : "session_exchange_failed",
    };
  }
}

export async function completeFirebaseEmailLink<
  Auth,
>(input: {
  auth: Auth;
  email: string;
  href: string;
  isEmailLink: (
    auth: Auth,
    href: string,
  ) => boolean;
  signIn: (
    auth: Auth,
    email: string,
    href: string,
  ) => Promise<{
    user: FirebaseCompletionUser;
  }>;
  exchangeSession: (
    user: FirebaseCompletionUser,
    forceRefresh: boolean,
  ) => Promise<void>;
}): Promise<FirebaseCompletionResult> {
  if (
    !input.isEmailLink(
      input.auth,
      input.href,
    )
  ) {
    return { status: "invalid_link" };
  }

  let user: FirebaseCompletionUser;
  try {
    const credential =
      await input.signIn(
        input.auth,
        input.email.trim(),
        input.href,
      );
    user = credential.user;
  } catch {
    return { status: "invalid_link" };
  }

  return exchangeResult(
    user,
    input.exchangeSession,
    false,
  );
}

export async function retryFirebaseStaffSession(
  input: {
    currentUser:
      | FirebaseCompletionUser
      | null;
    exchangeSession: (
      user: FirebaseCompletionUser,
      forceRefresh: boolean,
    ) => Promise<void>;
  },
): Promise<FirebaseCompletionResult> {
  if (!input.currentUser) {
    return { status: "missing_user" };
  }

  return exchangeResult(
    input.currentUser,
    input.exchangeSession,
    true,
  );
}
