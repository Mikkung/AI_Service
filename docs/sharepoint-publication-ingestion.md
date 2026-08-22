# SharePoint Publication Ingestion

Phase E2 supports two transport paths into the same publication use case. Phase E2.1 makes the primary production transport raw binary so Power Automate does not need to base64-encode the full file.

```text
SharePoint Approved
  -> Power Automate Get file content
  -> Power Automate HTTP raw binary body
  -> Vercel
  -> PublishApprovedKnowledge
  -> OpenAI Managed RAG
```

```text
SharePoint Approved
  -> Power Automate Standard Connectors
  -> OneDrive Publish Queue
  -> local queue CLI
  -> PublishApprovedKnowledge
  -> OpenAI Managed RAG
```

The fallback path exists in case Power Automate HTTP Premium becomes unavailable, tenant licensing changes, or the HTTP connector is disabled by policy. Both transports normalize their input before calling `PublishApprovedKnowledge`; publication, idempotency, approval, audience, effective-date, and provider rules are not duplicated in transport code.

## Public Boundary

External AI uses PUBLIC knowledge only.

Internal AI later may use PUBLIC + INTERNAL knowledge, but Phase E2 does not implement Teams or internal RAG.

Only SharePoint items with `approvalStatus = "Approved"` and `audience = "public"` may enter the public OpenAI vector store. The backend enforces this even if Power Automate already filtered the item.

## Primary HTTP Contract

Endpoint:

```text
POST /api/integrations/sharepoint/publication
Authorization: Bearer <SHAREPOINT_PUBLISHER_SECRET>
Content-Type: application/octet-stream or application/json
```

Production Power Automate should send raw file bytes:

```text
Method: POST
URI: /api/integrations/sharepoint/publication

Headers:
Authorization = Bearer <SHAREPOINT_PUBLISHER_SECRET>
Content-Type = application/octet-stream
X-ISE-Source-System = sharepoint
X-ISE-Source-Item-Id = <SharePoint ID>
X-ISE-File-Name = <file name with extension>
X-ISE-Audience = public
X-ISE-Approval-Status = Approved
X-ISE-Knowledge-Category = <Knowledge Category>
X-ISE-Knowledge-Version = <Knowledge Version>
X-ISE-Knowledge-Owner = <Knowledge Owner>
X-ISE-Effective-From = <optional ISO timestamp>
X-ISE-Effective-To = <optional ISO timestamp>
X-ISE-Source-Modified-At = <optional ISO timestamp>

Body:
File Content output from Get file content
```

Do not wrap the body in `base64(...)`. The HTTP body should be `body('Get_file_content')` / the File Content dynamic output directly.

The JSON/base64 contract remains supported for local testing and backward-compatible tools:

```json
{
  "sourceSystem": "sharepoint",
  "sourceItemId": "12345",
  "sourceVersion": "1.0",
  "fileName": "ISE Admission AY2027.docx",
  "contentBase64": "BASE64_FILE_BYTES",
  "audience": "public",
  "knowledgeCategory": "Admission",
  "knowledgeOwner": "ISE",
  "knowledgeVersion": "AY2027",
  "effectiveFrom": null,
  "effectiveTo": null,
  "approvalStatus": "Approved",
  "sourceModifiedAt": "2027-01-01T00:00:00.000Z"
}
```

Both transports are normalized into the same `ApprovedKnowledgePublicationInput`. The current adapter rejects files over 8 MB before publishing and does not truncate content. JSON/base64 can still hit Power Automate or Vercel/serverless body-size limits earlier than raw binary; a future staged upload/blob transport can replace the HTTP adapter without changing `PublishApprovedKnowledge`.

## OneDrive Queue Contract

Power Automate fallback writes two files:

```text
<queue>/
  <stable-id>__<filename>
  <stable-id>__<filename>.publish.json
```

The sidecar JSON contains the metadata. The worker does not trust metadata encoded only in the filename.

```json
{
  "sourceSystem": "sharepoint",
  "sourceItemId": "12345",
  "sourceVersion": "1.0",
  "fileName": "ISE Admission AY2027.docx",
  "audience": "public",
  "knowledgeCategory": "Admission",
  "knowledgeOwner": "ISE",
  "knowledgeVersion": "AY2027",
  "effectiveFrom": null,
  "effectiveTo": null,
  "approvalStatus": "Approved",
  "sourceModifiedAt": "2027-01-01T00:00:00.000Z"
}
```

Run the worker:

```bash
npm run knowledge:publish-queue -- --queue "<path>"
```

The worker processes manifests independently, reports per-item results, does not delete source files by default, and is safe to rerun because `PublishApprovedKnowledge` is idempotent for the same source identity, content hash, and publication metadata fingerprint.

## Environment

Add this server-side value:

```text
SHAREPOINT_PUBLISHER_SECRET=
OPENAI_PUBLIC_VECTOR_STORE_ID=
```

`OPENAI_PUBLIC_VECTOR_STORE_ID` is optional but recommended for production. If it is set, the publisher uses exactly that vector store and does not create another. If it is absent, the production wiring stores the created vector-store ID in Firestore and reuses it.

Do not send `OPENAI_API_KEY` or vector store IDs in transport payloads. Provider IDs remain server-side publication metadata.
