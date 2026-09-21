import type {
  SaveSuggestedReplyDraftInput,
  SuggestedReplyDraftRepository,
  UpdateSuggestedReplyDraftInput,
} from "@/core/ai-platform/repositories/suggested-reply-draft-repository";

import {
  suggestedReplyDraftId,
} from "@/core/ai-platform/repositories/suggested-reply-draft-id";

import type {
  SuggestedReplyDraft,
} from "@/core/ai-platform/types/channel-response";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const SUGGESTED_REPLY_DRAFTS_COLLECTION =
  "ai_platform_suggested_reply_drafts";

interface FirestoreDocumentSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface FirestoreDocumentReference {
  get(): Promise<FirestoreDocumentSnapshot>;
  set(
    data: Record<string, unknown>,
  ): Promise<unknown>;
}

interface FirestoreCollectionReference {
  doc(id: string): FirestoreDocumentReference;
}

interface FirestoreLike {
  collection(
    name: string,
  ): FirestoreCollectionReference;
}

function cloneDraft(
  draft: SuggestedReplyDraft,
): SuggestedReplyDraft {
  return {
    ...draft,
    citations:
      draft.citations?.map(
        (citation) => ({
          ...citation,
          providerMetadata:
            citation.providerMetadata
              ? {
                  ...citation.providerMetadata,
                }
              : undefined,
        }),
      ),
    metadata:
      draft.metadata
        ? {
            ...draft.metadata,
          }
        : undefined,
  };
}

export class FirestoreSuggestedReplyDraftRepository
  implements SuggestedReplyDraftRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async saveDraft(
    input: SaveSuggestedReplyDraftInput,
  ): Promise<SuggestedReplyDraft> {
    const existing = await this.getDraft(
      input.conversationId,
      input.sourceMessageId,
    );
    const draft: SuggestedReplyDraft = {
      ...input,
      id: suggestedReplyDraftId(
        input.conversationId,
        input.sourceMessageId,
      ),
      createdAt:
        existing?.createdAt ??
        input.createdAt,
    };

    await this.db
      .collection(
        SUGGESTED_REPLY_DRAFTS_COLLECTION,
      )
      .doc(draft.id)
      .set(
        removeUndefinedFirestoreValues(
          cloneDraft(draft),
        ) as unknown as Record<
          string,
          unknown
        >,
      );

    return cloneDraft(draft);
  }

  async getDraft(
    conversationId: string,
    sourceMessageId: string,
  ): Promise<SuggestedReplyDraft | null> {
    const id = suggestedReplyDraftId(
      conversationId,
      sourceMessageId,
    );
    const snapshot = await this.db
      .collection(
        SUGGESTED_REPLY_DRAFTS_COLLECTION,
      )
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const draft = cloneDraft({
      id,
      ...(snapshot.data() as Omit<
        SuggestedReplyDraft,
        "id"
      >),
    });

    if (
      draft.conversationId !==
        conversationId ||
      draft.sourceMessageId !==
        sourceMessageId
    ) {
      throw new Error(
        "Suggested reply draft identity mismatch",
      );
    }

    return draft;
  }

  async updateDraft(
    input: UpdateSuggestedReplyDraftInput,
  ): Promise<SuggestedReplyDraft> {
    const existing = await this.getDraft(
      input.conversationId,
      input.sourceMessageId,
    );

    if (!existing) {
      throw new Error(
        "Suggested reply draft not found",
      );
    }

    const updated: SuggestedReplyDraft = {
      ...existing,
      text:
        input.text ?? existing.text,
      status:
        input.status ?? existing.status,
      updatedAt: input.updatedAt,
      metadata:
        input.metadata ??
        existing.metadata,
    };

    await this.db
      .collection(
        SUGGESTED_REPLY_DRAFTS_COLLECTION,
      )
      .doc(updated.id)
      .set(
        removeUndefinedFirestoreValues(
          cloneDraft(updated),
        ) as unknown as Record<
          string,
          unknown
        >,
      );

    return cloneDraft(updated);
  }
}
