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

export class InMemorySuggestedReplyDraftRepository
  implements SuggestedReplyDraftRepository
{
  private readonly drafts =
    new Map<string, SuggestedReplyDraft>();

  async saveDraft(
    input: SaveSuggestedReplyDraftInput,
  ): Promise<SuggestedReplyDraft> {
    const id = suggestedReplyDraftId(
      input.conversationId,
      input.sourceMessageId,
    );
    const existing = this.drafts.get(id);
    const draft: SuggestedReplyDraft = {
      ...input,
      id,
      createdAt:
        existing?.createdAt ??
        input.createdAt,
    };

    this.drafts.set(id, cloneDraft(draft));

    return cloneDraft(draft);
  }

  async getDraft(
    conversationId: string,
    sourceMessageId: string,
  ): Promise<SuggestedReplyDraft | null> {
    const draft = this.drafts.get(
      suggestedReplyDraftId(
        conversationId,
        sourceMessageId,
      ),
    );

    return draft
      ? cloneDraft(draft)
      : null;
  }

  async updateDraft(
    input: UpdateSuggestedReplyDraftInput,
  ): Promise<SuggestedReplyDraft> {
    const id = suggestedReplyDraftId(
      input.conversationId,
      input.sourceMessageId,
    );
    const existing = this.drafts.get(id);

    if (!existing) {
      throw new Error(
        `Suggested reply draft not found: ${id}`,
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

    this.drafts.set(
      id,
      cloneDraft(updated),
    );

    return cloneDraft(updated);
  }
}
