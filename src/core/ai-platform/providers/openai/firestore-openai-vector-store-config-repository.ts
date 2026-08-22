import type {
  OpenAIVectorStoreConfig,
  OpenAIVectorStoreConfigRepository,
  OpenAIVectorStoreTarget,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "@/core/ai-platform/repositories/firestore/firestore-serialization";

const VECTOR_STORE_CONFIGS_COLLECTION =
  "ai_platform_openai_vector_store_configs";

function keyForTarget(
  target: OpenAIVectorStoreTarget,
): string {
  return `${target.audience}_${target.environment}`;
}

export class FirestoreOpenAIVectorStoreConfigRepository
  implements OpenAIVectorStoreConfigRepository
{
  async getVectorStoreConfig(
    target: OpenAIVectorStoreTarget,
  ): Promise<OpenAIVectorStoreConfig | null> {
    const snapshot =
      await firestore
        .collection(
          VECTOR_STORE_CONFIGS_COLLECTION,
        )
        .doc(keyForTarget(target))
        .get();

    if (!snapshot.exists) {
      return null;
    }

    return {
      ...(snapshot.data() as OpenAIVectorStoreConfig),
    };
  }

  async saveVectorStoreConfig(
    config: OpenAIVectorStoreConfig,
  ): Promise<void> {
    await firestore
      .collection(
        VECTOR_STORE_CONFIGS_COLLECTION,
      )
      .doc(keyForTarget(config))
      .set(
        removeUndefinedFirestoreValues({
          ...config,
        }),
      );
  }
}
