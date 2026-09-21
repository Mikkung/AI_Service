import type {
  Citation,
} from "@/core/ai-platform/types/citations";

export type ExternalResponseChannel =
  | "line"
  | "facebook";

export type ResponseMode =
  | "off"
  | "draft"
  | "auto";

export interface ChannelResponseConfig {
  channel: ExternalResponseChannel;
  channelAccountId: string;
  responseMode: ResponseMode;
  createdAt: string;
  updatedAt: string;
}

export interface ResponseModeDecision {
  generateAi: boolean;
  persistAsDraft: boolean;
  autoSend: boolean;
}

export type SuggestedReplyDraftStatus =
  | "ready"
  | "failed"
  | "dismissed"
  | "sent";

export interface SuggestedReplyDraft {
  id: string;
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
