import {
  getAuth,
} from "firebase-admin/auth";

import {
  firebaseApp,
} from "@/infrastructure/db/firebase-admin";

export const firebaseAuth =
  getAuth(firebaseApp);
