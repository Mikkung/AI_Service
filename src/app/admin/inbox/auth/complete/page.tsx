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

import styles from "../../staff-inbox.module.css";

export default function StaffAuthCompletePage() {
  const [email, setEmail] = useState("");
  const [needsEmail, setNeedsEmail] =
    useState(false);
  const [working, setWorking] =
    useState(true);
  const [error, setError] = useState("");
  const autoCompletionStarted =
    useRef(false);

  async function completeSignIn(
    confirmedEmail: string,
  ) {
    setWorking(true);
    setError("");

    try {
      const auth =
        getFirebaseClientAuth();
      if (
        !isSignInWithEmailLink(
          auth,
          window.location.href,
        )
      ) {
        throw new Error(
          "This sign-in link is invalid or incomplete.",
        );
      }

      const credential =
        await signInWithEmailLink(
          auth,
          confirmedEmail.trim(),
          window.location.href,
        );
      const idToken =
        await credential.user.getIdToken();
      const response = await fetch(
        "/api/admin/ui/auth/firebase-session",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            idToken,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          "Sign-in could not be completed for this account.",
        );
      }

      window.localStorage.removeItem(
        FIREBASE_EMAIL_STORAGE_KEY,
      );
      await signOut(auth);
      window.location.replace(
        "/admin/inbox",
      );
    } catch (failure) {
      try {
        await signOut(
          getFirebaseClientAuth(),
        );
      } catch {
        // No client session may have been created.
      }
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign-in could not be completed.",
      );
      setNeedsEmail(true);
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
        {!working && (
          <a href="/admin/inbox">
            Return to Staff Inbox
          </a>
        )}
      </div>
    </main>
  );
}
