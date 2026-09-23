export interface StaffInboxComposerState {
  conversationId?: string;
  text: string;
  dirty: boolean;
  sourceMessageId?: string;
}

export interface StaffInboxComposerDraft {
  sourceMessageId: string;
  text: string;
  status:
    | "ready"
    | "failed"
    | "dismissed"
    | "sent";
}

export function emptyStaffInboxComposer(
  conversationId?: string,
): StaffInboxComposerState {
  return {
    conversationId,
    text: "",
    dirty: false,
  };
}

export function synchronizeStaffInboxComposer(
  current: StaffInboxComposerState,
  input: {
    conversationId: string;
    draft: StaffInboxComposerDraft | null;
  },
): StaffInboxComposerState {
  if (
    current.conversationId !==
    input.conversationId
  ) {
    return input.draft?.status === "ready"
      ? {
          conversationId:
            input.conversationId,
          text: input.draft.text,
          dirty: false,
          sourceMessageId:
            input.draft.sourceMessageId,
        }
      : emptyStaffInboxComposer(
          input.conversationId,
        );
  }

  if (
    current.dirty ||
    input.draft?.status !== "ready" ||
    input.draft.sourceMessageId ===
      current.sourceMessageId
  ) {
    return current;
  }

  return {
    conversationId:
      input.conversationId,
    text: input.draft.text,
    dirty: false,
    sourceMessageId:
      input.draft.sourceMessageId,
  };
}

export function editStaffInboxComposer(
  current: StaffInboxComposerState,
  text: string,
): StaffInboxComposerState {
  return {
    ...current,
    text,
    dirty: true,
  };
}

export function markStaffInboxComposerSaved(
  current: StaffInboxComposerState,
  sourceMessageId: string,
): StaffInboxComposerState {
  return {
    ...current,
    dirty: false,
    sourceMessageId,
  };
}
