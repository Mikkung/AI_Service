# ISE AI Assistant Platform Architecture

Phase A defines provider-independent architecture contracts only. It does not connect to OpenAI, Gemini, Azure, SharePoint, LINE, Facebook, Teams, Staff Inbox, Queue, booking, or any paid API.

## Architecture Diagram

```text
                     KNOWLEDGE
                    SharePoint
                        |
                  Govern / Approve
                        |
                 KnowledgePublisher
                        |
                 Managed RAG Provider
                        |
                   AnswerService
                        |
         +--------------+---------------+
         |                              |
      EXTERNAL                        INTERNAL
 LINE / FB / Web                     MS Teams
         |                              |
         +--------------+---------------+
                        |
                Conversation Core
                        |
               Human Handoff
                        |
                 Future Action
                        |
          Queue / Request / Booking
```

## 1. Knowledge Source Of Truth

The long-term source of truth is the SharePoint Knowledge Hub. Documents should be authored, reviewed, approved, and versioned there before publication.

Phase C expands this into a provider-neutral knowledge catalog. The core domain sees only `KnowledgeDocument`, `KnowledgeSourceAdapter`, `KnowledgeRepository`, approval audit records, and publication records. No new production database, SharePoint connector, file upload, vector store, or external ingestion flow is implemented.

## 2. Knowledge Governance

Knowledge metadata supports lifecycle states: `draft`, `review`, `approved`, `superseded`, and `archived`. It also carries audience, source system, version, effective dates, owner, category, source reference, filename, content type, and content hash.

Approval actions are recorded as audit records. Future publishers should accept only governed documents from the approved source pipeline.

```text
                 SHAREPOINT
                  (future)
                     |
             Source Adapter
                     |
                     v
                  DRAFT
                     |
                     v
                  REVIEW
                     |
               Human Approval
                     |
                     v
                 APPROVED
                     |
          +----------+----------+
          |                     |
       PUBLIC                INTERNAL
          |                     |
 Managed RAG Provider      Internal Serving
  (OpenAI File Search)    (future MS Teams)
          |
          v
      AI Answers
```

Allowed knowledge lifecycle transitions are:

- `draft` -> `review`
- `review` -> `draft`
- `review` -> `approved`
- `approved` -> `superseded`
- `approved` -> `archived`
- `superseded` -> `archived`
- `draft` -> `archived`

Invalid shortcuts such as `draft` -> `approved`, `approved` -> `draft`, and `superseded` -> `approved` are rejected by the knowledge state machine.

Current approved knowledge is selected only when:

- status is `approved`
- `effectiveFrom` is absent or less than/equal to the current UTC time
- `effectiveTo` is absent or greater than/equal to the current UTC time
- audience and category match the query

Effective dates must be explicit metadata. The system does not infer dates from titles, academic years, filenames, or version strings.

## 3. Managed RAG Abstraction

`KnowledgePublisher` is the boundary from approved documents into a managed retrieval provider. It is provider-independent and can later target OpenAI File Search, Gemini managed search, Azure AI Search, or another managed RAG system.

Structured model output is not treated as structured knowledge. The architecture does not introduce fact tables that staff must manually maintain.

`KnowledgePublication` records are separate from `KnowledgeDocument`. Provider-specific serving references such as file IDs, vector store references, Gemini document IDs, or Azure index IDs belong in publication records or provider metadata, never in the generic document model.

Publishing is approved-only:

```text
Source changed
     |
Draft / Review
     |
Human Approval
     |
Publish
```

The architecture explicitly avoids:

```text
Source changed
     |
Automatically replace production knowledge
```

Publishing is idempotent. If a document already has a published record for the same target provider, environment, and content hash, the publisher returns `already_current` and does not create duplicate work.

Public publication targets accept public approved knowledge only. Internal knowledge must not be published into public serving targets.

Version replacement is explicit:

```text
v1 approved/current
        |
new v2 draft
        |
v2 review
        |
v2 approved
        |
explicit supersede
        |
v1 superseded
v2 current
```

Superseded documents remain available for audit and historical lookup, but they do not appear in normal current-public knowledge.

## SharePoint-Ready Source Contract

The core domain is SharePoint-ready but not SharePoint-dependent. It does not import Microsoft Graph types, SharePoint item types, SharePoint URLs, or Microsoft SDK models.

Future source adapters expose only:

- `SourceDocumentDescriptor`
- `SourceDocumentPayload`
- `KnowledgeSourceAdapter`

Expected future SharePoint metadata columns:

- `Title`
- `KnowledgeCategory`
- `Audience`: `Public` or `Internal`
- `KnowledgeStatus`: `Draft`, `Review`, `Approved`, `Superseded`
- `Owner`
- `Version`
- `EffectiveFrom`
- `EffectiveTo`
- `ReplacementDocumentId`

Approved historical QA is also represented as `sourceSystem = "approved_qa"`. Human answers must flow through candidate review and approval before becoming knowledge; they are never published automatically.

## 4. ISE AI Service

`GroundedQAProvider` is the core answering abstraction. It accepts a question, explicit audience, optional knowledge scope, and optional conversation context. It returns an answer, answerability, citations, optional evidence, provider metadata, and usage.

`AnswerService` calls a provider, then applies the generic `GroundingGate`. Callers depend on the service result, not on provider-specific response objects.

## 5. External Channels

External channels are:

- LINE
- Facebook
- Website

External channels map to external channel audience and public knowledge only. They must not choose or upgrade themselves to internal knowledge.

## 6. Internal Channel

The internal channel is:

- MS Teams

Teams maps to internal channel audience. Future identity and permission checks should decide which internal knowledge is available to a specific staff user.

## 7. Human Handoff

The conversation core defines modes for future handoff:

- `ai_active`
- `waiting_human`
- `human_active`
- `resolved`

Phase A only defines shared types and valid transitions. It does not implement Staff Inbox, staff reply UI, notifications, or persistence changes.

Phase B adds the provider-independent Conversation Core and Human Handoff state machine.

```text
                       USER
                        |
               Channel Adapter
                        |
                Conversation Core
                        |
              +---------+---------+
              |                   |
          ai_active          human-owned
              |                   |
       AnswerService         Staff Inbox
              |                   |
              |             Human Reply
              |                   |
              +---------+---------+
                        |
                    Resolve
                        |
                  Return to AI
```

Conversation ownership is explicit:

- `ai_active`: user messages may invoke `AnswerService`.
- `waiting_human`: user messages are stored for staff; AI does not answer.
- `human_active`: user messages are stored for the assigned staff agent; AI does not answer.
- `resolved`: conversation is closed until a separate return-to-AI operation reopens AI handling.

Allowed state transitions are:

- `ai_active` -> `waiting_human`
- `waiting_human` -> `human_active`
- `waiting_human` -> `resolved`
- `human_active` -> `resolved`
- `resolved` -> `ai_active`

Invalid shortcuts such as `ai_active` -> `human_active` are rejected by the state machine.

`HumanHandoff` models chat ownership only. It is not a queue ticket and does not carry queue number, SLA, priority, appointment, or workflow fields.

## 8. Future Queue / Request Workflow

`ServiceActionGateway` defines future action boundaries:

- `createRequest`
- `createQueueEntry`
- `bookAppointment`
- `escalate`

No queue implementation is included. Queue remains a separate future business system.

```text
Conversation Core
       |
       +---- Future Domain Events
                    |
              Action Gateway
                    |
             Queue / Request
                (future)
```

Phase B emits or returns generic domain events such as:

- `ConversationHandoffRequested`
- `ConversationTakenOver`
- `ConversationResolved`

Future systems can subscribe to these events and decide whether to create a request, queue entry, appointment, or escalation. Conversation Core itself must not create those business records.

## Conversation Persistence

Phase B uses in-memory repositories for architecture validation and tests:

- `ConversationRepository`
- `HandoffRepository`

These contracts hide persistence details from the domain layer. A future Firestore implementation should add transactional protection for staff takeover and idempotent message writes.

## Concurrency And Idempotency Notes

Future channel and persistence phases should handle:

- duplicate channel webhook messages
- channel message idempotency keys
- retry-safe human replies
- two staff agents attempting takeover at the same time
- optimistic concurrency or database transactions
- staff identity and authorization checks

The current admin experiment endpoints are development-only and use `x-api-key`. They are not production staff authentication.

## 9. Security Boundaries

Audience is required in `GroundedQARequest`. Server-side channel policy maps each channel to its allowed knowledge audience:

- `web`, `line`, `facebook` -> `public`
- `teams` -> `internal`

The mock admin endpoint is protected by the existing `x-api-key` mechanism and calls only the mock provider.

## 10. Provider Portability

Core interfaces do not depend on OpenAI, Gemini, Azure, LINE, Facebook, or Teams SDK types. Future integrations should live in adapters while the core contracts stay provider-neutral.

## 11. Phase D OpenAI Public RAG Experiment

Phase D adds an isolated OpenAI managed RAG provider for public development knowledge only. It does not replace or modify `/api/chat`, the existing Firestore retrieval path, embeddings, chunking, source expansion, provider configuration, or production knowledge collections.

The public OpenAI development vector store is named `ISE Public Knowledge - Development`. The OpenAI publisher creates or reuses this store through a local development config file and stores OpenAI file/vector-store identifiers only in `KnowledgePublication.externalResourceId` and `KnowledgePublication.providerMetadata`.

The OpenAI provider uses the Responses API with File Search and low reasoning effort. It does not use web search. Unsupported answers must be emitted as `UNSUPPORTED_BY_KB` by the provider prompt and are mapped to `answerable=false` with no citations.

Admin-only experiment endpoints:

- `POST /api/admin/experiments/rag-v2/publish`: creates a public draft, requires explicit `approve=true`, transitions it through review and approval, then publishes to OpenAI development.
- `POST /api/admin/experiments/rag-v2/chat`: answers public questions through the OpenAI File Search provider and returns grounding, citation, retrieval, usage, and latency metadata.

Operator scripts:

- `npm run rag-v2:publish-admission -- --file <path> --api-key <APP_API_KEY> --confirm-approve`
- `npm run benchmark:rag-v2-admission -- --api-key <APP_API_KEY> --smoke`
- `npm run benchmark:rag-v2-admission -- --api-key <APP_API_KEY>`

## 12. Phase E2 SharePoint Publication Transports

Phase E2 adds two ingestion transports for approved public SharePoint knowledge while preserving one shared publication use case. Phase E2.1 makes the primary transport raw binary and adds Firestore-backed serverless persistence:

- Primary: SharePoint Approved -> Power Automate Get file content -> HTTP raw binary body -> `/api/integrations/sharepoint/publication` -> `PublishApprovedKnowledge` -> OpenAI Managed RAG
- Fallback: SharePoint Approved -> Power Automate Standard Connectors -> OneDrive Publish Queue -> `npm run knowledge:publish-queue` -> `PublishApprovedKnowledge` -> OpenAI Managed RAG

The fallback exists in case Power Automate HTTP Premium becomes unavailable, tenant licensing changes, or the HTTP connector is disabled by policy.

The public integration endpoint uses `Authorization: Bearer <SHAREPOINT_PUBLISHER_SECRET>`, not `APP_API_KEY`. It independently enforces `approvalStatus = "Approved"` and `audience = "public"` before public publication.

Production publication state is stored in Firestore collections for AI-platform governance documents, publications, and OpenAI vector-store config. `OPENAI_PUBLIC_VECTOR_STORE_ID` can override vector-store creation and force reuse of a pre-created public vector store.

External AI remains PUBLIC only. Internal AI later may use PUBLIC + INTERNAL knowledge, but Phase E2 does not implement Teams or internal RAG.

## 13. External Channel Response Modes

LINE and Facebook channel accounts have a provider-neutral response mode:

- `off`: do not generate an AI response and do not send automatically.
- `draft`: AI generation may produce a separately persisted suggested reply, but nothing is sent automatically.
- `auto`: a grounded, safe AI answer may be eligible for later automatic delivery by a channel adapter.

An external account without configuration resolves to `off`. Response mode is separate from knowledge audience: LINE and Facebook remain restricted to public knowledge in every mode, and `auto` never bypasses grounding policy.

`SuggestedReplyDraft` is a separate domain record, not an outbound `ConversationMessage`. Saving or editing a draft does not append an AI message, change conversation ownership, or imply delivery.

Human read state is also independent. `lastStaffReadAt` changes only through a future explicit staff-read action. AI processing, draft generation, RAG, recovery, and webhook ingestion must never mark a conversation as read by staff.

## 14. LINE Messaging Adapter

The LINE webhook verifies the HMAC-SHA256 signature over the exact raw request body before parsing JSON. The webhook root `destination` selects the LINE account response configuration; payload data cannot select another channel or knowledge audience.

An active LINE conversation is resolved by `channel`, `channelAccountId` (the webhook `destination`), and `channelUserId`. This prevents the same LINE user identifier from reusing a conversation across different Official Accounts. The account field is optional on the provider-neutral conversation record so older and non-account-scoped records remain readable.

```text
LINE webhook
    -> verify signature
    -> resolve destination config
    -> persist inbound message
    -> off   : stop
    -> draft : generate and store SuggestedReplyDraft, never send
    -> auto  : existing grounded conversation flow, send only safe AI output
```

All LINE modes use public knowledge only. `off` still persists inbound messages for staff, `draft` never creates a sent AI conversation message, and unsupported auto answers retain existing handoff behavior without a fabricated LINE reply. Webhook ingestion, draft generation, and auto replies never update `lastStaffReadAt`.

### Staff Inbox and assisted replies

LINE draft mode follows: inbound message -> grounded AI suggestion -> Staff Inbox -> staff review/edit -> LINE Push API -> human conversation message. A suggested draft is not chat history and is never presented as sent. Delivery changes the linked draft to `sent` only after LINE accepts the push.

An assisted staff reply is distinct from human takeover. It does not require or create a handoff, does not assign an agent, and does not change an `ai_active` conversation to `human_active`. Existing waiting, takeover, resolve, and return-to-AI transitions remain unchanged.

Staff read state is also independent from AI processing. `lastInboundAt` changes only when a new user message is atomically persisted. `lastStaffReadAt` changes only through an explicit Inbox read action or a confirmed staff send. LINE Push is the delayed human-response transport and uses a durable client request ID as its stable LINE retry key.

F5.1 processes supported webhook events sequentially and synchronously as an MVP. A future phase may move work behind asynchronous infrastructure, but F5.1 adds no queue, retry worker, or scheduled job.

## 15. Channel-Neutral Media and LINE Images

F5.3A adds optional provider-neutral image attachments to conversation messages. Text-only records remain backward compatible. LINE image processing follows this transient path:

```text
LINE image webhook
    -> verify exact raw-body signature
    -> persist image message and attachment reference
    -> fetch bytes from api-data.line.me
    -> transient vision extraction
    -> privacy sanitization
    -> persist safe media context only
    -> discard raw bytes
```

Raw image bytes and Base64 data are never stored in Firestore or uploaded to permanent object storage. Persisted attachment data is limited to the trusted LINE message ID, content type, analysis status, classification, sensitivity, redacted context, and minimal diagnostics.

Response modes retain their existing meaning:

- `off`: persist the image with `not_requested`; do not fetch or analyze it.
- `draft`: analyze and persist safe context; do not create a generic draft or send a reply.
- `auto`: analyze and persist safe context; do not make an image-only eligibility decision or send an unsupported reply.

For a later text message, ready image context is added to conversation history as user-provided evidence:

```text
safe media context + subsequent user question
    -> existing public File Search RAG
    -> GroundingGate
    -> off / draft / auto delivery policy
```

Image observations are not approved institutional knowledge. Admission criteria, eligibility decisions, and other institutional facts must still come from approved public knowledge and retain normal citation and grounding requirements.

Image webhook processing remains synchronous in F5.3A. LINE media fetches have an 8-second abort deadline and vision inference has a 12-second abort deadline. The inbound receipt owns image processing, so a duplicate webhook cannot start a second analysis. Failures atomically finalize the attachment and receipt; an interrupted expired image lease is finalized as failed and marked for human review rather than entering the text-answer pipeline.

An AI-enabled text message arriving while the latest image is still processing waits for persisted analysis for at most 8 seconds. When analysis becomes ready, its sanitized context is included in the normal grounded answer. If that wait expires, the text message is persisted once under the existing inbound lease and is not answered without the image context; the existing recovery path can safely resolve the deferred receipt after the image settles.

The Staff Inbox shows image status and safe context. Its authenticated preview route resolves the trusted LINE media ID from the stored conversation message and proxies LINE's temporary preview with `Cache-Control: private, no-store`. Preview expiry is expected; F5.3A intentionally has no persistent media store.

## Facebook Messenger Text (F5.4A)

Facebook Messenger text follows the same external-channel core as LINE:

`Meta webhook -> Facebook adapter -> Conversation / AnswerService / GroundingGate -> Draft, Auto, or Handoff`

The webhook verifies `x-hub-signature-256` against the exact raw request body before parsing JSON. Page identity is trusted from server configuration, and conversation identity is the tuple `facebook + Page ID + PSID`. Facebook is an external channel and can retrieve public knowledge only.

Response mode is account-scoped. `off` stores inbound text only, `draft` creates a staff-reviewable suggested reply, and `auto` sends only a safe AI message produced by the shared conversation pipeline. Echoes and unsupported Messenger event types are ignored.

Staff Messenger replies are blocked at and beyond 24 hours after the latest inbound message. Facebook has no equivalent of LINE's retry key: an ambiguous network outcome is recorded as `uncertain` and requires manual reconciliation instead of an automatic resend. Confirmed sends alone create a human conversation message and mark a linked draft sent. LINE retry-key behavior is unchanged.

The Staff Inbox queries recent LINE and Facebook conversations separately using the existing `channel + updatedAt` query, merges and sorts the bounded results, and offers All, LINE, and Facebook views. LINE media preview remains LINE-only. Facebook image/media support is deferred to F5.4B and will feed the shared image-understanding pipeline.

## Public Privacy Policy

`GET /privacy` is a public, unauthenticated privacy-policy page for the ISE AI Service. It documents website/chat, LINE, Facebook Messenger, AI-assisted, staff-assisted, media, retention, and data-deletion practices. The route is intended to provide users with transparent privacy information and to support Meta and other third-party platform review requirements.
