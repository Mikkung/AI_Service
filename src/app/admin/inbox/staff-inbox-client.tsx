"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./staff-inbox.module.css";

type ResponseMode =
  | "off"
  | "draft"
  | "auto";

type InboxConversation = {
  id: string;
  channel: "line";
  channelAccountId?: string;
  channelUserId: string;
  mode:
    | "ai_active"
    | "waiting_human"
    | "human_active"
    | "resolved";
  updatedAt: string;
  lastMessageAt?: string;
  lastInboundAt?: string;
  lastStaffReadAt?: string;
  unread: boolean;
  draftStatus?:
    | "ready"
    | "failed"
    | "dismissed"
    | "sent";
};

type Message = {
  id: string;
  senderType:
    | "user"
    | "ai"
    | "human"
    | "system";
  text: string;
  createdAt: string;
};

type Draft = {
  id: string;
  sourceMessageId: string;
  text: string;
  status:
    | "ready"
    | "failed"
    | "dismissed"
    | "sent";
  updatedAt: string;
};

type Detail = {
  conversation: InboxConversation;
  messages: Message[];
  responseMode: ResponseMode;
  draft: Draft | null;
  latestInboundMessageId?: string;
};

type ApiError = {
  error?: string;
};

const modeDescription: Record<
  ResponseMode,
  string
> = {
  off:
    "Staff replies manually. AI does not generate replies.",
  draft:
    "AI prepares a suggested reply. Staff reviews before sending.",
  auto:
    "AI sends grounded answers automatically when safe.",
};

async function readJson<T>(
  response: Response,
): Promise<T> {
  const body =
    (await response.json()) as
      T & ApiError;

  if (!response.ok) {
    throw new Error(
      body.error ??
        `Request failed (${response.status})`,
    );
  }

  return body;
}

function shortIdentity(
  value: string,
): string {
  return value.length > 18
    ? `${value.slice(0, 8)}...${value.slice(-5)}`
    : value;
}

function formatTime(
  value?: string,
): string {
  if (!value) {
    return "No activity";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

export function StaffInboxClient() {
  const [checkingSession, setCheckingSession] =
    useState(true);
  const [authenticated, setAuthenticated] =
    useState(false);
  const [apiKey, setApiKey] = useState("");
  const [conversations, setConversations] =
    useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] =
    useState<string>();
  const [detail, setDetail] =
    useState<Detail>();
  const [composerText, setComposerText] =
    useState("");
  const [loading, setLoading] =
    useState(false);
  const [sending, setSending] =
    useState(false);
  const [saving, setSaving] =
    useState(false);
  const [modeSaving, setModeSaving] =
    useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sendRequestId, setSendRequestId] =
    useState<string>();
  const pollingRef = useRef(false);
  const detailPollingRef = useRef(false);
  const explicitSelectionRef =
    useRef(false);

  const checkSession = useCallback(
    async () => {
      try {
        const response = await fetch(
          "/api/admin/ui/session",
          { cache: "no-store" },
        );
        const body = await readJson<{
          authenticated: boolean;
        }>(response);
        setAuthenticated(
          body.authenticated,
        );
      } catch {
        setAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    },
    [],
  );

  const loadList = useCallback(
    async (quiet = false) => {
      if (pollingRef.current) {
        return;
      }

      pollingRef.current = true;
      if (!quiet) {
        setLoading(true);
      }

      try {
        const response = await fetch(
          "/api/admin/ui/inbox/conversations",
          { cache: "no-store" },
        );
        if (response.status === 401) {
          setAuthenticated(false);
          return;
        }
        const body = await readJson<{
          conversations: InboxConversation[];
        }>(response);
        setConversations(
          body.conversations,
        );
        setError("");
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load conversations.",
        );
      } finally {
        pollingRef.current = false;
        setLoading(false);
      }
    },
    [],
  );

  const loadDetail = useCallback(
    async (
      conversationId: string,
      markRead: boolean,
      preserveComposer = false,
    ) => {
      if (detailPollingRef.current) {
        return;
      }

      detailPollingRef.current = true;
      try {
        if (markRead) {
          await readJson(
            await fetch(
              `/api/admin/ui/inbox/conversations/${encodeURIComponent(conversationId)}/read`,
              { method: "POST" },
            ),
          );
        }

        const response = await fetch(
          `/api/admin/ui/inbox/conversations/${encodeURIComponent(conversationId)}`,
          { cache: "no-store" },
        );
        const body =
          await readJson<Detail>(response);
        setDetail(body);
        if (!preserveComposer) {
          setComposerText(
            body.draft?.status === "ready"
              ? body.draft.text
              : "",
          );
          setSendRequestId(undefined);
        }
        setError("");
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load conversation.",
        );
      } finally {
        detailPollingRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    void loadList();
    const timer = window.setInterval(
      () => void loadList(true),
      8000,
    );
    return () => window.clearInterval(timer);
  }, [authenticated, loadList]);

  useEffect(() => {
    if (selectedId && authenticated) {
      const markRead =
        explicitSelectionRef.current;
      explicitSelectionRef.current = false;
      void loadDetail(
        selectedId,
        markRead,
      );
    }
  }, [selectedId, authenticated, loadDetail]);

  useEffect(() => {
    if (!selectedId || !authenticated) {
      return;
    }

    const timer = window.setInterval(
      () =>
        void loadDetail(
          selectedId,
          false,
          true,
        ),
      8000,
    );
    return () => window.clearInterval(timer);
  }, [selectedId, authenticated, loadDetail]);

  async function login(
    event: FormEvent,
  ) {
    event.preventDefault();
    setError("");
    try {
      await readJson(
        await fetch(
          "/api/admin/ui/session",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({ apiKey }),
          },
        ),
      );
      setApiKey("");
      setAuthenticated(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign in failed.",
      );
    }
  }

  async function saveDraft() {
    if (
      !detail?.draft ||
      detail.draft.status !== "ready"
    ) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const body = await readJson<{
        draft: Draft;
      }>(
        await fetch(
          `/api/admin/ui/inbox/conversations/${encodeURIComponent(detail.conversation.id)}/draft`,
          {
            method: "PUT",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              sourceMessageId:
                detail.draft.sourceMessageId,
              text: composerText,
            }),
          },
        ),
      );
      setDetail({
        ...detail,
        draft: body.draft,
      });
      setNotice("Draft saved.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save draft.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendReply() {
    if (!detail || !composerText.trim()) {
      return;
    }

    const clientRequestId =
      sendRequestId ?? crypto.randomUUID();
    setSendRequestId(clientRequestId);
    setSending(true);
    setError("");
    setNotice("");

    try {
      await readJson(
        await fetch(
          `/api/admin/ui/inbox/conversations/${encodeURIComponent(detail.conversation.id)}/send`,
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              text: composerText,
              clientRequestId,
              sourceMessageId:
                detail.draft?.status ===
                  "ready"
                  ? detail.draft
                      .sourceMessageId
                  : undefined,
            }),
          },
        ),
      );
      setNotice("Reply sent to LINE.");
      setComposerText("");
      setSendRequestId(undefined);
      await loadDetail(
        detail.conversation.id,
        false,
      );
      await loadList(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not send reply.",
      );
    } finally {
      setSending(false);
    }
  }

  async function updateMode(
    responseMode: ResponseMode,
  ) {
    if (
      !detail?.conversation
        .channelAccountId ||
      responseMode ===
        detail.responseMode
    ) {
      return;
    }

    if (
      responseMode === "auto" &&
      !window.confirm(
        "Enable Auto mode? Safe grounded answers will be sent directly to users.",
      )
    ) {
      return;
    }

    setModeSaving(true);
    setError("");
    try {
      await readJson(
        await fetch(
          `/api/admin/ui/inbox/channel-response-configs/line/${encodeURIComponent(detail.conversation.channelAccountId)}`,
          {
            method: "PUT",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              responseMode,
            }),
          },
        ),
      );
      setDetail({
        ...detail,
        responseMode,
      });
      setNotice("Response mode updated.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not update mode.",
      );
    } finally {
      setModeSaving(false);
    }
  }

  if (checkingSession) {
    return (
      <main className={styles.centered}>
        <p>Loading Staff Inbox...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className={styles.centered}>
        <form
          className={styles.loginPanel}
          onSubmit={login}
        >
          <div className={styles.brandMark}>
            ISE
          </div>
          <h1>Staff Inbox</h1>
          <p>
            Sign in with the existing admin
            access key.
          </p>
          <label htmlFor="admin-key">
            Admin access key
          </label>
          <input
            id="admin-key"
            type="password"
            value={apiKey}
            onChange={(event) =>
              setApiKey(event.target.value)
            }
            autoComplete="current-password"
          />
          <button type="submit">
            Sign in
          </button>
          {error && (
            <p className={styles.error}>
              {error}
            </p>
          )}
        </form>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            ISE AI
          </span>
          <h1>Staff Inbox</h1>
        </div>
        <div className={styles.headerActions}>
          <a href="/admin/test-ai">
            Test AI
          </a>
          {detail && (
            <div className={styles.modeControl}>
              <label htmlFor="response-mode">
                LINE response mode
              </label>
              <select
                id="response-mode"
                value={detail.responseMode}
                disabled={modeSaving}
                onChange={(event) =>
                  void updateMode(
                    event.target
                      .value as ResponseMode,
                  )
                }
              >
                <option value="off">Off</option>
                <option value="draft">Draft</option>
                <option value="auto">Auto</option>
              </select>
              <small>
                {modeDescription[
                  detail.responseMode
                ]}
              </small>
            </div>
          )}
        </div>
      </header>

      {(error || notice) && (
        <div
          className={
            error
              ? styles.errorBanner
              : styles.noticeBanner
          }
        >
          {error || notice}
        </div>
      )}

      <main className={styles.workspace}>
        <aside className={styles.listPanel}>
          <div className={styles.panelTitle}>
            <div>
              <h2>LINE conversations</h2>
              <p>
                {conversations.length} recent
              </p>
            </div>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadList()}
              disabled={loading}
              title="Refresh conversations"
            >
              Refresh
            </button>
          </div>

          <div className={styles.conversationList}>
            {loading && !conversations.length ? (
              <p className={styles.emptyList}>
                Loading conversations...
              </p>
            ) : conversations.length === 0 ? (
              <p className={styles.emptyList}>
                No LINE conversations yet.
              </p>
            ) : (
              conversations.map(
                (conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`${styles.conversationItem} ${selectedId === conversation.id ? styles.selected : ""}`}
                    onClick={() => {
                      if (
                        selectedId ===
                        conversation.id
                      ) {
                        void loadDetail(
                          conversation.id,
                          true,
                        );
                        return;
                      }

                      explicitSelectionRef.current =
                        true;
                      setSelectedId(
                        conversation.id,
                      );
                    }}
                  >
                    <span
                      className={
                        conversation.unread
                          ? styles.unreadDot
                          : styles.readDot
                      }
                    />
                    <span className={styles.itemBody}>
                      <strong>
                        LINE user {shortIdentity(conversation.channelUserId)}
                      </strong>
                      <span>
                        Account {shortIdentity(conversation.channelAccountId ?? "Legacy")}
                      </span>
                      <small>
                        {formatTime(conversation.lastMessageAt ?? conversation.updatedAt)}
                      </small>
                    </span>
                    {conversation.unread && (
                      <span className={styles.unreadLabel}>
                        New
                      </span>
                    )}
                    {!conversation.unread &&
                      conversation.draftStatus ===
                        "ready" && (
                        <span className={styles.draftReadyLabel}>
                          Draft ready
                        </span>
                      )}
                  </button>
                ),
              )
            )}
          </div>
        </aside>

        <section className={styles.chatPanel}>
          {!detail ? (
            <div className={styles.emptyConversation}>
              <h2>Select a conversation</h2>
              <p>
                Messages and AI suggestions will
                appear here.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.chatHeader}>
                <div>
                  <span className={styles.channelBadge}>
                    LINE
                  </span>
                  <h2>
                    User {shortIdentity(detail.conversation.channelUserId)}
                  </h2>
                  <p>
                    Account {shortIdentity(detail.conversation.channelAccountId ?? "Legacy account")}
                  </p>
                </div>
                <span className={styles.modeBadge}>
                  {detail.conversation.mode.replaceAll("_", " ")}
                </span>
              </div>

              <div className={styles.messages}>
                {detail.messages.length === 0 ? (
                  <p className={styles.emptyList}>
                    No messages in this conversation.
                  </p>
                ) : (
                  detail.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`${styles.message} ${styles[message.senderType]}`}
                    >
                      <span>
                        {message.senderType === "user"
                          ? "LINE user"
                          : message.senderType === "ai"
                            ? "ISE AI"
                            : message.senderType === "human"
                              ? "Staff"
                              : "System"}
                      </span>
                      <p>{message.text}</p>
                      <time>
                        {formatTime(message.createdAt)}
                      </time>
                    </article>
                  ))
                )}
              </div>

              <div className={styles.composer}>
                <div className={styles.composerHeading}>
                  <div>
                    <h3>
                      {detail.draft?.status === "ready"
                        ? "AI suggested draft"
                        : "Reply to LINE"}
                    </h3>
                    <p>
                      Review the text before sending.
                    </p>
                  </div>
                  {detail.draft && (
                    <span className={`${styles.draftStatus} ${styles[`draft_${detail.draft.status}`]}`}>
                      {detail.draft.status}
                    </span>
                  )}
                </div>

                {detail.draft?.status === "failed" && (
                  <p className={styles.failedDraft}>
                    AI could not prepare a safe draft.
                  </p>
                )}
                <textarea
                  value={composerText}
                  maxLength={5000}
                  rows={5}
                  placeholder="Write a reply to the LINE user"
                  onChange={(event) => {
                    setComposerText(
                      event.target.value,
                    );
                    setSendRequestId(undefined);
                  }}
                />

                <div className={styles.composerActions}>
                  <span>
                    {composerText.length}/5000
                  </span>
                  <div>
                    {detail.draft?.status === "ready" && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={saving || sending || !composerText.trim()}
                        onClick={() => void saveDraft()}
                      >
                        {saving ? "Saving..." : "Save draft"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.sendButton}
                      disabled={sending || !composerText.trim()}
                      onClick={() => void sendReply()}
                    >
                      {sending ? "Sending..." : "Send to LINE"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
