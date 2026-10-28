import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";

import { env } from "@/core/config/env";

let credentialProjectId:
  string | undefined;

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

    credentialProjectId =
      typeof serviceAccount.projectId ===
      "string"
        ? serviceAccount.projectId
        : undefined;

    return cert(serviceAccount);
  }

  // Local development
  // Uses GOOGLE_APPLICATION_CREDENTIALS
  return applicationDefault();
}

export const firebaseApp =
  getApps()[0] ??
  initializeApp({
    credential: getCredential(),
    projectId: env.FIREBASE_PROJECT_ID,
  });

export const firestore =
  getFirestore(firebaseApp);

export interface FirebaseAdminProjectConsistency {
  configuredProjectId: string;
  appProjectId?: string;
  credentialProjectId?: string;
  consistent: boolean;
}

export function getFirebaseAdminProjectConsistency():
  FirebaseAdminProjectConsistency {
  const configuredProjectId =
    env.FIREBASE_PROJECT_ID;
  const appProjectId =
    firebaseApp.options.projectId;
  const consistent =
    (!appProjectId ||
      appProjectId ===
        configuredProjectId) &&
    (!credentialProjectId ||
      credentialProjectId ===
        configuredProjectId);

  return {
    configuredProjectId,
    appProjectId,
    credentialProjectId,
    consistent,
  };
}
