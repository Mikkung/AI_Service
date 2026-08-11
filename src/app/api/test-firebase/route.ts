import { FieldValue } from "firebase-admin/firestore";

import { firestore } from "@/infrastructure/db/firebase-admin";
import { hasValidApiKey } from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasValidApiKey(request)) {
    return Response.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const ref = firestore
      .collection("ai_system_tests")
      .doc();

    await ref.set({
      message: "Firebase connection successful",
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      ok: true,
      message: "Firebase connected successfully",
      documentId: ref.id,
    });
  } catch (error) {
    console.error("Firebase test failed", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Firebase error",
      },
      {
        status: 500,
      },
    );
  }
}