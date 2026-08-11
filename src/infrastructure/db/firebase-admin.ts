import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";

import { env } from "@/core/config/env";

function getCredential() {
  // Production / Vercel
  if (env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const decoded = Buffer.from(
      env.FIREBASE_SERVICE_ACCOUNT_B64,
      "base64",
    ).toString("utf8");

    const serviceAccount = JSON.parse(
      decoded,
    ) as ServiceAccount;

    return cert(serviceAccount);
  }

  // Local development
  // Uses GOOGLE_APPLICATION_CREDENTIALS
  return applicationDefault();
}

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    credential: getCredential(),
    projectId: env.FIREBASE_PROJECT_ID,
  });

export const firestore =
  getFirestore(firebaseApp);