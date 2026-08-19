# SharePoint Publication Ingestion

Phase E2 supports two transport paths into the same publication use case:

```text
SharePoint Approved
  -> Power Automate HTTP
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

## HTTP Contract

Endpoint:

```text
POST /api/integrations/sharepoint/publication
Authorization: Bearer <SHAREPOINT_PUBLISHER_SECRET>
Content-Type: application/json
```

Payload:

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

`contentBase64` is decoded server-side. The current adapter rejects files over 8 MB before publishing and does not truncate content. Vercel/serverless body-size limits can still make large JSON/base64 uploads unsuitable later; a future staged upload/blob transport can replace the HTTP adapter without changing `PublishApprovedKnowledge`.

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

The worker processes manifests independently, reports per-item results, does not delete source files by default, and is safe to rerun because `PublishApprovedKnowledge` is idempotent for the same source identity and content hash.

## Environment

Add this server-side value:

```text
SHAREPOINT_PUBLISHER_SECRET=
```

Do not send `OPENAI_API_KEY` or vector store IDs in transport payloads. Provider IDs remain server-side publication metadata.
