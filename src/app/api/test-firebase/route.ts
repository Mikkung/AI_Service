import { FieldValue } from "firebase-admin/firestore";

import { firestore } from "@/infrastructure/db/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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