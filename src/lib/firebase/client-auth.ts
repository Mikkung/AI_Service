import {
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";
import {
  getAuth,
} from "firebase/auth";

import {
  createFirebaseClientAuthSingleton,
} from "@/lib/firebase/client-singleton";

const firebaseConfig = {
  apiKey:
    process.env
      .NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    process.env
      .NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:
    process.env
      .NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId:
    process.env
      .NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const FIREBASE_EMAIL_STORAGE_KEY =
  "ise_staff_email_for_sign_in";

export class FirebaseClientConfigurationError
  extends Error {
  constructor() {
    super(
      "Firebase staff authentication is not configured.",
    );
    this.name =
      "FirebaseClientConfigurationError";
  }
}

const resolveFirebaseClientAuth =
  createFirebaseClientAuthSingleton({
    isBrowser: () =>
      typeof window !== "undefined",
    getApps,
    getApp,
    initializeApp: () =>
      initializeApp(firebaseConfig),
    getAuth,
  });

export function getFirebaseClientAuth() {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.authDomain ||
    !firebaseConfig.projectId ||
    !firebaseConfig.appId
  ) {
    throw new FirebaseClientConfigurationError();
  }

  return resolveFirebaseClientAuth();
}
