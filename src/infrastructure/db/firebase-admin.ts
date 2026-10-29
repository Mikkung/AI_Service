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

export function getServiceAccountProjectId(
  value: unknown,
): string | undefined {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return undefined;
  }

  const serviceAccount = value as Record<
    string,
    unknown
  >;
  const rawProjectId =
    serviceAccount.project_id ??
    serviceAccount.projectId;

  return typeof rawProjectId === "string" &&
    rawProjectId.trim().length > 0
    ? rawProjectId.trim()
    : undefined;
}

function getCredential() {
  // Production / Vercel
  if (env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const decoded = Buffer.from(
      env.FIREBASE_SERVICE_ACCOUNT_B64,
      "base64",
    ).toString("utf8");

    const rawServiceAccount: unknown =
      JSON.parse(decoded);
    const serviceAccount =
      rawServiceAccount as ServiceAccount;

    credentialProjectId =
      getServiceAccountProjectId(
        rawServiceAccount,
      );

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
