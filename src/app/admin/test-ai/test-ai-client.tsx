"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./test-ai.module.css";

type Source = {
  id: string;
  sourceId: string;
  title: string;
  score: number;
};

type ChatResult = {
  sessionId: string;
  answer: string;
  provider: string;
  model: string;
  latencyMs: number;
  sources: Source[];
};

type FeedbackReason =
  | "incorrect_fact"
  | "incomplete"
  | "unclear"
  | "wrong_source"
  | "tone"
  | "other";

type ApiError = {
  error?: string;
  details?: string;
};

const reasonLabels: Record<
  FeedbackReason,
  string
> = {
  incorrect_fact:
    "Incorrect fact",
  incomplete:
    "Incomplete answer",
  unclear:
    "Unclear / confusing",
  wrong_source:
    "Wrong or weak source",
  tone:
    "Tone / wording",
  other:
    "Other",
};

async function readJson<T>(
  response: Response,
): Promise<T> {
  const json =
    (await response.json()) as
      T & ApiError;

  if (!response.ok) {
    throw new Error(
      json.error ??
        json.details ??
        `Request failed (${response.status})`,
    );
  }

  return json;
}

function scoreLabel(
  score: number,
): string {
  return Number.isFinite(score)
    ? score.toFixed(3)
    : "—";
}

export function TestAiClient() {
  const [
    checkingSession,
    setCheckingSession,
  ] = useState(true);

  const [
    authenticated,
    setAuthenticated,
  ] = useState(false);

  const [
    apiKey,
    setApiKey,
  ] = useState("");

  const [
    loginError,
    setLoginError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    submittedQuestion,
    setSubmittedQuestion,
  ] = useState("");

  const [
    chatResult,
    setChatResult,
  ] = useState<
    ChatResult | undefined
  >();

  const [
    sessionId,
    setSessionId,
  ] = useState<
    string | undefined
  >();

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    feedbackMode,
    setFeedbackMode,
  ] = useState<
    "none" |
    "incorrect" |
    "correct"
  >("none");

  const [
    reason,
    setReason,
  ] = useState<FeedbackReason>(
    "incorrect_fact",
  );

  const [
    correctedAnswer,
    setCorrectedAnswer,
  ] = useState("");

  const [
    adminNote,
    setAdminNote,
  ] = useState("");

  const [
    topic,
    setTopic,
  ] = useState("Admission");

  const [
    audience,
    setAudience,
  ] = useState<
    "public" | "internal"
  >("public");

  const [
    academicYear,
    setAcademicYear,
  ] = useState("AY2027");

  const [
    feedbackId,
    setFeedbackId,
  ] = useState<
    string | undefined
  >();

  const [
    feedbackStatus,
    setFeedbackStatus,
  ] = useState("");

  const [
    savingFeedback,
    setSavingFeedback,
  ] = useState(false);

  const [
    approving,
    setApproving,
  ] = useState(false);

  const [
    approved,
    setApproved,
  ] = useState(false);

  useEffect(() => {
    void checkSession();
  }, []);

  async function checkSession() {
    try {
      const response =
        await fetch(
          "/api/admin/ui/session",
          {
            cache: "no-store",
          },
        );

      const json =
        await readJson<{
          authenticated: boolean;
        }>(response);

      setAuthenticated(
        json.authenticated,
      );
    } catch {
      setAuthenticated(false);
    } finally {
      setCheckingSession(false);
    }
  }

  async function handleLogin(
    event: FormEvent,
  ) {
    event.preventDefault();

    setLoginError("");

    try {
      const response =
        await fetch(
          "/api/admin/ui/session",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                apiKey,
              }),
          },
        );

      await readJson(
        response,
      );

      setApiKey("");
      setAuthenticated(true);
    } catch (loginFailure) {
      setLoginError(
        loginFailure instanceof Error
          ? loginFailure.message
          : "Login failed.",
      );
    }
  }

  async function handleLogout() {
    await fetch(
      "/api/admin/ui/session",
      {
        method: "DELETE",
      },
    );

    setAuthenticated(false);
    setChatResult(undefined);
    setSessionId(undefined);
  }

  function resetFeedback() {
    setFeedbackMode("none");
    setReason(
      "incorrect_fact",
    );
    setCorrectedAnswer("");
    setAdminNote("");
    setFeedbackId(undefined);
    setFeedbackStatus("");
    setApproved(false);
  }

  async function handleSend(
    event: FormEvent,
  ) {
    event.preventDefault();

    const question =
      message.trim();

    if (!question) {
      return;
    }

    setSending(true);
    setError("");
    resetFeedback();

    try {
      const response =
        await fetch(
          "/api/admin/ui/chat",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                sessionId,
                message: question,
              }),
          },
        );

      if (
        response.status === 401
      ) {
        setAuthenticated(
          false,
        );
        throw new Error(
          "Admin session expired. Please sign in again.",
        );
      }

      const json =
        await readJson<
          { ok: true } &
          ChatResult
        >(response);

      setSubmittedQuestion(
        question,
      );
      setChatResult(json);
      setSessionId(
        json.sessionId,
      );
      setMessage("");
    } catch (chatFailure) {
      setError(
        chatFailure instanceof Error
          ? chatFailure.message
          : "Could not send the question.",
      );
    } finally {
      setSending(false);
    }
  }

  const sourceIds =
    useMemo(
      () =>
        chatResult?.sources.map(
          (source) =>
            source.sourceId ||
            source.id,
        ) ?? [],
      [chatResult],
    );

  async function saveFeedback(
    rating:
      | "positive"
      | "negative",
  ): Promise<
    string | undefined
  > {
    if (
      !chatResult ||
      !submittedQuestion
    ) {
      return undefined;
    }

    setSavingFeedback(true);
    setFeedbackStatus("");

    try {
      const response =
        await fetch(
          "/api/admin/ui/feedback",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                sessionId:
                  chatResult.sessionId,
                question:
                  submittedQuestion,
                aiAnswer:
                  chatResult.answer,
                rating,
                reason:
                  rating ===
                  "negative"
                    ? reason
                    : undefined,
                correctedAnswer:
                  rating ===
                    "negative" &&
                  correctedAnswer.trim()
                    ? correctedAnswer.trim()
                    : undefined,
                adminNote:
                  adminNote.trim()
                    ? adminNote.trim()
                    : undefined,
                requestedForKnowledge:
                  false,
                sourceIds,
              }),
          },
        );

      if (
        response.status === 401
      ) {
        setAuthenticated(
          false,
        );
        throw new Error(
          "Admin session expired. Please sign in again.",
        );
      }

      const json =
        await readJson<{
          feedback: {
            id: string;
          };
        }>(response);

      setFeedbackId(
        json.feedback.id,
      );

      setFeedbackStatus(
        rating === "positive"
          ? "Saved as correct."
          : "Feedback saved for review.",
      );

      return json.feedback.id;
    } catch (feedbackFailure) {
      setFeedbackStatus(
        feedbackFailure instanceof Error
          ? feedbackFailure.message
          : "Could not save feedback.",
      );

      return undefined;
    } finally {
      setSavingFeedback(false);
    }
  }

  async function markCorrect() {
    if (
      feedbackMode ===
        "correct" &&
      feedbackId
    ) {
      return;
    }

    setFeedbackMode(
      "correct",
    );

    await saveFeedback(
      "positive",
    );
  }

  async function approveKnowledge() {
    if (
      !chatResult ||
      !submittedQuestion
    ) {
      return;
    }

    if (
      !correctedAnswer.trim()
    ) {
      setFeedbackStatus(
        "Enter the corrected answer before approving it to Knowledge.",
      );
      return;
    }

    setApproving(true);
    setFeedbackStatus("");

    try {
      let currentFeedbackId =
        feedbackId;

      if (!currentFeedbackId) {
        currentFeedbackId =
          await saveFeedback(
            "negative",
          );
      }

      if (!currentFeedbackId) {
        return;
      }

      const response =
        await fetch(
          "/api/admin/ui/feedback/approve",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                feedbackId:
                  currentFeedbackId,
                canonicalQuestion:
                  submittedQuestion,
                approvedAnswer:
                  correctedAnswer.trim(),
                topic:
                  topic.trim()
                    ? topic.trim()
                    : undefined,
                audience,
                academicYear:
                  academicYear.trim()
                    ? academicYear.trim()
                    : undefined,
              }),
          },
        );

      if (
        response.status === 401
      ) {
        setAuthenticated(
          false,
        );
        throw new Error(
          "Admin session expired. Please sign in again.",
        );
      }

      await readJson(
        response,
      );

      setApproved(true);
      setFeedbackStatus(
        "Approved and added to active Knowledge.",
      );
    } catch (approvalFailure) {
      setFeedbackStatus(
        approvalFailure instanceof Error
          ? approvalFailure.message
          : "Approval failed.",
      );
    } finally {
      setApproving(false);
    }
  }

  if (checkingSession) {
    return (
      <main
        className={
          styles.centerScreen
        }
      >
        <div
          className={
            styles.loadingCard
          }
        >
          Checking admin
          session…
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main
        className={
          styles.loginPage
        }
      >
        <section
          className={
            styles.loginCard
          }
        >
          <div
            className={
              styles.brandMark
            }
          >
            ISE
          </div>

          <p
            className={
              styles.eyebrow
            }
          >
            AI MANAGEMENT
          </p>

          <h1>
            Admin access
          </h1>

          <p
            className={
              styles.loginCopy
            }
          >
            Sign in with the
            existing admin API
            key. The key is
            verified server-side
            and is not stored in
            browser JavaScript.
          </p>

          <form
            onSubmit={
              handleLogin
            }
            className={
              styles.loginForm
            }
          >
            <label
              htmlFor="apiKey"
            >
              Admin API key
            </label>

            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(
                event,
              ) =>
                setApiKey(
                  event.target
                    .value,
                )
              }
              autoComplete="off"
              required
              placeholder="Enter APP_API_KEY"
            />

            {loginError ? (
              <p
                className={
                  styles.errorText
                }
              >
                {loginError}
              </p>
            ) : null}

            <button
              type="submit"
              className={
                styles.primaryButton
              }
            >
              Sign in
            </button>
          </form>

          <p
            className={
              styles.securityNote
            }
          >
            Development admin
            access • replace with
            Entra ID / Firebase
            Auth before public
            production use.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div
      className={
        styles.appShell
      }
    >
      <aside
        className={
          styles.sidebar
        }
      >
        <div
          className={
            styles.sidebarBrand
          }
        >
          <div
            className={
              styles.brandMarkSmall
            }
          >
            ISE
          </div>
          <div>
            <strong>
              AI Management
            </strong>
            <span>
              Admin Console
            </span>
          </div>
        </div>

        <nav
          className={
            styles.nav
          }
        >
          <span
            className={
              styles.navSection
            }
          >
            Workspace
          </span>

          <button
            className={
              styles.navItemActive
            }
            type="button"
          >
            <span>◉</span>
            Test AI
          </button>

          <button
            className={
              styles.navItem
            }
            type="button"
            disabled
          >
            <span>▤</span>
            Historical Q&A
            <small>
              Next
            </small>
          </button>

          <button
            className={
              styles.navItem
            }
            type="button"
            disabled
          >
            <span>◇</span>
            Feedback
            <small>
              Next
            </small>
          </button>

          <button
            className={
              styles.navItem
            }
            type="button"
            disabled
          >
            <span>◫</span>
            Knowledge
          </button>

          <button
            className={
              styles.navItem
            }
            type="button"
            disabled
          >
            <span>✓</span>
            Evaluation
          </button>
        </nav>

        <div
          className={
            styles.sidebarFooter
          }
        >
          <span
            className={
              styles.statusDot
            }
          />
          Development
        </div>
      </aside>

      <main
        className={
          styles.main
        }
      >
        <header
          className={
            styles.topbar
          }
        >
          <div>
            <p
              className={
                styles.eyebrow
              }
            >
              QUALITY CONTROL
            </p>
            <h1>
              Test AI
            </h1>
          </div>

          <div
            className={
              styles.topbarActions
            }
          >
            <span
              className={
                styles.environmentBadge
              }
            >
              Test channel
            </span>

            <button
              type="button"
              className={
                styles.ghostButton
              }
              onClick={
                handleLogout
              }
            >
              Sign out
            </button>
          </div>
        </header>

        <div
          className={
            styles.workspace
          }
        >
          <section
            className={
              styles.chatColumn
            }
          >
            <div
              className={
                styles.panel
              }
            >
              <div
                className={
                  styles.panelHeader
                }
              >
                <div>
                  <h2>
                    Ask ISE AI
                  </h2>
                  <p>
                    Test the same
                    grounded answer
                    flow used by
                    customer
                    channels.
                  </p>
                </div>

                {chatResult ? (
                  <div
                    className={
                      styles.runMeta
                    }
                  >
                    <span>
                      {
                        chatResult.provider
                      }
                    </span>
                    <span>
                      {
                        chatResult.model
                      }
                    </span>
                    <span>
                      {
                        chatResult.latencyMs
                      }
                      ms
                    </span>
                  </div>
                ) : null}
              </div>

              <div
                className={
                  styles.chatBody
                }
              >
                {!chatResult ? (
                  <div
                    className={
                      styles.emptyState
                    }
                  >
                    <div
                      className={
                        styles.emptyIcon
                      }
                    >
                      AI
                    </div>
                    <h3>
                      Start a test
                      conversation
                    </h3>
                    <p>
                      Ask about
                      admissions,
                      programs or
                      another topic
                      currently in
                      the public
                      Knowledge Base.
                    </p>
                  </div>
                ) : (
                  <>
                    <article
                      className={
                        styles.userMessage
                      }
                    >
                      <span>
                        You
                      </span>
                      <p>
                        {
                          submittedQuestion
                        }
                      </p>
                    </article>

                    <article
                      className={
                        styles.aiMessage
                      }
                    >
                      <div
                        className={
                          styles.aiIdentity
                        }
                      >
                        <span
                          className={
                            styles.aiBadge
                          }
                        >
                          AI
                        </span>
                        <strong>
                          ISE AI
                          Assistant
                        </strong>
                      </div>

                      <p
                        className={
                          styles.answerText
                        }
                      >
                        {
                          chatResult.answer
                        }
                      </p>

                      <div
                        className={
                          styles.feedbackBar
                        }
                      >
                        <span>
                          Is this
                          answer
                          correct?
                        </span>

                        <button
                          type="button"
                          className={
                            feedbackMode ===
                            "correct"
                              ? styles.feedbackButtonActive
                              : styles.feedbackButton
                          }
                          onClick={
                            markCorrect
                          }
                          disabled={
                            savingFeedback ||
                            approved
                          }
                        >
                          👍 Correct
                        </button>

                        <button
                          type="button"
                          className={
                            feedbackMode ===
                            "incorrect"
                              ? styles.feedbackButtonDangerActive
                              : styles.feedbackButton
                          }
                          onClick={() => {
                            setFeedbackMode(
                              "incorrect",
                            );
                            setFeedbackStatus(
                              "",
                            );
                          }}
                          disabled={
                            approved
                          }
                        >
                          👎 Incorrect
                        </button>
                      </div>
                    </article>
                  </>
                )}
              </div>

              {error ? (
                <div
                  className={
                    styles.inlineError
                  }
                >
                  {error}
                </div>
              ) : null}

              <form
                onSubmit={
                  handleSend
                }
                className={
                  styles.composer
                }
              >
                <textarea
                  value={message}
                  onChange={(
                    event,
                  ) =>
                    setMessage(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Ask a question to test the ISE AI…"
                  rows={3}
                  disabled={sending}
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                        "Enter" &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();

                      event
                        .currentTarget
                        .form
                        ?.requestSubmit();
                    }
                  }}
                />

                <div
                  className={
                    styles.composerFooter
                  }
                >
                  <span>
                    Enter to send •
                    Shift+Enter for
                    a new line
                  </span>

                  <button
                    type="submit"
                    className={
                      styles.primaryButton
                    }
                    disabled={
                      sending ||
                      !message.trim()
                    }
                  >
                    {sending
                      ? "Testing…"
                      : "Send"}
                  </button>
                </div>
              </form>
            </div>

            {feedbackMode ===
              "incorrect" &&
            chatResult ? (
              <section
                className={
                  styles.correctionPanel
                }
              >
                <div
                  className={
                    styles.sectionHeading
                  }
                >
                  <div>
                    <p
                      className={
                        styles.eyebrow
                      }
                    >
                      ADMIN
                      CORRECTION
                    </p>
                    <h2>
                      Teach the AI
                    </h2>
                  </div>

                  {approved ? (
                    <span
                      className={
                        styles.approvedBadge
                      }
                    >
                      ✓ Approved
                    </span>
                  ) : null}
                </div>

                <div
                  className={
                    styles.formGrid
                  }
                >
                  <label
                    className={
                      styles.fieldFull
                    }
                  >
                    <span>
                      Reason
                    </span>
                    <select
                      value={
                        reason
                      }
                      onChange={(
                        event,
                      ) =>
                        setReason(
                          event.target
                            .value as FeedbackReason,
                        )
                      }
                      disabled={
                        approved
                      }
                    >
                      {Object.entries(
                        reasonLabels,
                      ).map(
                        ([
                          value,
                          label,
                        ]) => (
                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {
                              label
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label
                    className={
                      styles.fieldFull
                    }
                  >
                    <span>
                      Correct
                      answer
                    </span>
                    <textarea
                      rows={5}
                      value={
                        correctedAnswer
                      }
                      onChange={(
                        event,
                      ) =>
                        setCorrectedAnswer(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Enter the verified answer that the AI should use…"
                      disabled={
                        approved
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Topic
                    </span>
                    <input
                      value={
                        topic
                      }
                      onChange={(
                        event,
                      ) =>
                        setTopic(
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        approved
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Audience
                    </span>
                    <select
                      value={
                        audience
                      }
                      onChange={(
                        event,
                      ) =>
                        setAudience(
                          event.target
                            .value as
                            | "public"
                            | "internal",
                        )
                      }
                      disabled={
                        approved
                      }
                    >
                      <option
                        value="public"
                      >
                        Public
                      </option>
                      <option
                        value="internal"
                      >
                        Internal
                      </option>
                    </select>
                  </label>

                  <label>
                    <span>
                      Academic
                      Year
                    </span>
                    <input
                      value={
                        academicYear
                      }
                      onChange={(
                        event,
                      ) =>
                        setAcademicYear(
                          event.target
                            .value,
                        )
                      }
                      placeholder="e.g. AY2027"
                      disabled={
                        approved
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Admin note
                      (optional)
                    </span>
                    <input
                      value={
                        adminNote
                      }
                      onChange={(
                        event,
                      ) =>
                        setAdminNote(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Verification note"
                      disabled={
                        approved
                      }
                    />
                  </label>
                </div>

                {feedbackStatus ? (
                  <div
                    className={
                      approved
                        ? styles.successNotice
                        : styles.notice
                    }
                  >
                    {
                      feedbackStatus
                    }
                  </div>
                ) : null}

                <div
                  className={
                    styles.correctionActions
                  }
                >
                  <button
                    type="button"
                    className={
                      styles.secondaryButton
                    }
                    disabled={
                      savingFeedback ||
                      approved
                    }
                    onClick={() =>
                      void saveFeedback(
                        "negative",
                      )
                    }
                  >
                    {feedbackId
                      ? "Feedback saved"
                      : savingFeedback
                        ? "Saving…"
                        : "Save feedback"}
                  </button>

                  <button
                    type="button"
                    className={
                      styles.primaryButton
                    }
                    disabled={
                      approving ||
                      approved
                    }
                    onClick={() =>
                      void approveKnowledge()
                    }
                  >
                    {approved
                      ? "✓ Approved to Knowledge"
                      : approving
                        ? "Approving…"
                        : "Approve to Knowledge"}
                  </button>
                </div>

                <p
                  className={
                    styles.guardrail
                  }
                >
                  Saving feedback
                  does not update
                  RAG. Only
                  “Approve to
                  Knowledge”
                  creates an active
                  approved Q&A and
                  embedding.
                </p>
              </section>
            ) : null}
          </section>

          <aside
            className={
              styles.inspector
            }
          >
            <section
              className={
                styles.inspectorCard
              }
            >
              <div
                className={
                  styles.inspectorHeader
                }
              >
                <div>
                  <p
                    className={
                      styles.eyebrow
                    }
                  >
                    GROUNDING
                  </p>
                  <h2>
                    Sources
                  </h2>
                </div>

                <span
                  className={
                    styles.countBadge
                  }
                >
                  {chatResult
                    ?.sources
                    .length ??
                    0}
                </span>
              </div>

              {!chatResult ||
              chatResult.sources
                .length === 0 ? (
                <p
                  className={
                    styles.muted
                  }
                >
                  Sources used by
                  the latest answer
                  will appear here.
                </p>
              ) : (
                <div
                  className={
                    styles.sourceList
                  }
                >
                  {chatResult.sources.map(
                    (
                      source,
                      index,
                    ) => (
                      <article
                        key={
                          source.id
                        }
                        className={
                          styles.sourceCard
                        }
                      >
                        <div
                          className={
                            styles.sourceTop
                          }
                        >
                          <span
                            className={
                              styles.sourceIndex
                            }
                          >
                            {index +
                              1}
                          </span>
                          <strong>
                            {
                              source.title
                            }
                          </strong>
                        </div>

                        <div
                          className={
                            styles.sourceScore
                          }
                        >
                          <span>
                            Retrieval
                            score
                          </span>
                          <strong>
                            {scoreLabel(
                              source.score,
                            )}
                          </strong>
                        </div>

                        <code>
                          {
                            source.id
                          }
                        </code>
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>

            <section
              className={
                styles.inspectorCard
              }
            >
              <p
                className={
                  styles.eyebrow
                }
              >
                TEST RUN
              </p>
              <h2>
                Diagnostics
              </h2>

              <dl
                className={
                  styles.diagnostics
                }
              >
                <div>
                  <dt>
                    Channel
                  </dt>
                  <dd>
                    test
                  </dd>
                </div>
                <div>
                  <dt>
                    Audience
                  </dt>
                  <dd>
                    public
                  </dd>
                </div>
                <div>
                  <dt>
                    Provider
                  </dt>
                  <dd>
                    {chatResult
                      ?.provider ??
                      "—"}
                  </dd>
                </div>
                <div>
                  <dt>
                    Model
                  </dt>
                  <dd>
                    {chatResult
                      ?.model ??
                      "—"}
                  </dd>
                </div>
                <div>
                  <dt>
                    Latency
                  </dt>
                  <dd>
                    {chatResult
                      ? `${chatResult.latencyMs} ms`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
