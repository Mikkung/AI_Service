"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";

import {
  FIREBASE_EMAIL_STORAGE_KEY,
  getFirebaseClientAuth,
} from "@/lib/firebase/client-auth";
import {
  completeFirebaseEmailLink,
  exchangeFirebaseStaffSession,
  retryFirebaseStaffSession,
  type FirebaseCompletionResult,
} from "@/lib/firebase/staff-auth-completion";

import styles from "../../staff-inbox.module.css";

export default function StaffAuthCompletePage() {
  const [email, setEmail] = useState("");
  const [needsEmail, setNeedsEmail] =
    useState(false);
  const [working, setWorking] =
    useState(true);
  const [error, setError] = useState("");
  const [sessionRetryAvailable, setSessionRetryAvailable] =
    useState(false);
  const autoCompletionStarted =
    useRef(false);

  async function finishSuccessfulSession() {
    const auth = getFirebaseClientAuth();
    window.localStorage.removeItem(
      FIREBASE_EMAIL_STORAGE_KEY,
    );
    await signOut(auth);
    window.location.replace(
      "/admin/inbox",
    );
  }

  async function applyCompletionResult(
    result: FirebaseCompletionResult,
  ) {
    if (result.status === "success") {
      await finishSuccessfulSession();
      return;
    }

    setSessionRetryAvailable(
      result.status ===
        "session_exchange_failed",
    );

    if (result.status === "invalid_link") {
      setError(
        "That sign-in link is invalid or has expired. Please request a new one.",
      );
    } else if (
      result.status === "unauthorized"
    ) {
      setError(
        "This account could not be authorized for the Staff Inbox.",
      );
    } else if (
      result.status === "missing_user"
    ) {
      setError(
        "Please request a new sign-in link.",
      );
    } else {
      setError(
        "Your email was verified, but the Staff Inbox session could not be created.",
      );
    }
    setWorking(false);
  }

  async function completeSignIn(
    confirmedEmail: string,
  ) {
    setWorking(true);
    setError("");
    setNeedsEmail(false);
    setSessionRetryAvailable(false);

    try {
      const auth = getFirebaseClientAuth();
      const result =
        await completeFirebaseEmailLink({
          auth,
          email: confirmedEmail,
          href: window.location.href,
          isEmailLink:
            isSignInWithEmailLink,
          signIn:
            signInWithEmailLink,
          exchangeSession: (
            user,
            forceRefresh,
          ) =>
            exchangeFirebaseStaffSession(
              user,
              { forceRefresh },
            ),
        });
      await applyCompletionResult(result);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign-in could not be completed.",
      );
      setWorking(false);
    }
  }

  async function retrySessionCreation() {
    setWorking(true);
    setError("");
    setSessionRetryAvailable(false);

    try {
      const auth = getFirebaseClientAuth();
      const result =
        await retryFirebaseStaffSession({
          currentUser: auth.currentUser,
          exchangeSession: (
            user,
            forceRefresh,
          ) =>
            exchangeFirebaseStaffSession(
              user,
              { forceRefresh },
            ),
        });
      await applyCompletionResult(result);
    } catch {
      setError(
        "Your email was verified, but the Staff Inbox session could not be created.",
      );
      setSessionRetryAvailable(true);
      setWorking(false);
    }
  }

  useEffect(() => {
    if (autoCompletionStarted.current) {
      return;
    }
    autoCompletionStarted.current = true;

    const storedEmail =
      window.localStorage.getItem(
        FIREBASE_EMAIL_STORAGE_KEY,
      );
    if (storedEmail) {
      setEmail(storedEmail);
      void completeSignIn(storedEmail);
    } else {
      setNeedsEmail(true);
      setWorking(false);
    }
  }, []);

  function confirmEmail(
    event: FormEvent,
  ) {
    event.preventDefault();
    void completeSignIn(email);
  }

  return (
    <main className={styles.centered}>
      <div className={styles.loginPanel}>
        <div className={styles.brandMark}>
          ISE
        </div>
        <h1>Complete staff sign-in</h1>
        {working && (
          <p>Verifying your sign-in link...</p>
        )}
        {needsEmail && !working && (
          <form onSubmit={confirmEmail}>
            <p>
              Confirm the email address that
              received this sign-in link.
            </p>
            <label htmlFor="staff-email-confirmation">
              Email address
            </label>
            <input
              id="staff-email-confirmation"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
            />
            <button type="submit">
              Complete sign-in
            </button>
          </form>
        )}
        {error && (
          <p className={styles.error}>
            {error}
          </p>
        )}
        {!working &&
          sessionRetryAvailable && (
            <button
              type="button"
              onClick={() =>
                void retrySessionCreation()
              }
            >
              Retry session creation
            </button>
          )}
        {!working && (
          <a href="/admin/inbox">
            Return to Staff Inbox
          </a>
        )}
      </div>
    </main>
  );
}
