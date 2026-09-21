import type {
  Citation,
} from "@/core/ai-platform/types/citations";

import type {
  SuggestedReplyDraft,
  SuggestedReplyDraftStatus,
} from "@/core/ai-platform/types/channel-response";

export interface SaveSuggestedReplyDraftInput {
  conversationId: string;
  sourceMessageId: string;
  text: string;
  status: SuggestedReplyDraftStatus;
  createdAt: string;
  updatedAt: string;
  provider?: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
}

export interface UpdateSuggestedReplyDraftInput {
  conversationId: string;
  sourceMessageId: string;
  text?: string;
  status?: SuggestedReplyDraftStatus;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SuggestedReplyDraftRepository {
  saveDraft(
    input: SaveSuggestedReplyDraftInput,
  ): Promise<SuggestedReplyDraft>;

  getDraft(
    conversationId: string,
    sourceMessageId: string,
  ): Promise<SuggestedReplyDraft | null>;

  updateDraft(
    input: UpdateSuggestedReplyDraftInput,
  ): Promise<SuggestedReplyDraft>;
}
