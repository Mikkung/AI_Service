import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import type {
  AddMessageInput,
  AddModelRunInput,
  ChatRepository,
  EnsureSessionInput,
} from "@/infrastructure/repositories/chat-repository";

export class FirestoreChatRepository
  implements ChatRepository
{
  async ensureSession(
    input: EnsureSessionInput,
  ): Promise<void> {
    const ref = firestore
      .collection("ai_chat_sessions")
      .doc(input.sessionId);

    const snapshot =
      await ref.get();

    if (!snapshot.exists) {
      await ref.set({
        channel:
          input.channel,

        userId:
          input.userId ?? null,

        status:
          "active",

        createdAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      return;
    }

    await ref.update({
      updatedAt:
        FieldValue.serverTimestamp(),
    });
  }

  async addMessage(
    input: AddMessageInput,
  ): Promise<string> {
    const ref = firestore
      .collection("ai_chat_messages")
      .doc();

    await ref.set({
      sessionId:
        input.sessionId,

      role:
        input.role,

      text:
        input.text,

      channel:
        input.channel,

      provider:
        input.provider ?? null,

      model:
        input.model ?? null,

      sources:
        input.sources ?? [],

      createdAt:
        FieldValue.serverTimestamp(),
    });

    return ref.id;
  }

  async addModelRun(
    input: AddModelRunInput,
  ): Promise<string> {
    const ref = firestore
      .collection("ai_model_runs")
      .doc();

    await ref.set({
      sessionId:
        input.sessionId,

      provider:
        input.provider,

      model:
        input.model,

      latencyMs:
        input.latencyMs,

      success:
        input.success,

      usage:
        input.usage ?? null,

      errorMessage:
        input.errorMessage ?? null,

      createdAt:
        FieldValue.serverTimestamp(),
    });

    return ref.id;
  }
}