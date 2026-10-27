# Microsoft Entra Staff Login Setup

F6.0 uses Auth.js with a single-tenant Microsoft Entra ID application and an explicit staff email allowlist. It requests only the OIDC `openid`, `profile`, and `email` scopes; no Microsoft Graph API permission is required.

## Entra application registration

1. Open the Microsoft Entra admin center.
2. Go to **Identity > Applications > App registrations**.
3. Select **New registration**.
4. Choose **Accounts in this organizational directory only**.
5. Add these **Web** redirect URIs:
   - Production: `https://ai-service-swart.vercel.app/api/auth/callback/microsoft-entra-id`
   - Local: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
6. Record the **Application (client) ID** and **Directory (tenant) ID**.
7. Under **Certificates & secrets**, create a client secret and store its value securely. Do not commit it.
8. Construct the tenant-specific issuer:
   `https://login.microsoftonline.com/<TENANT_ID>/v2.0`

Do not use `common`, `organizations`, or `consumers` as the issuer. Do not add Microsoft Graph permissions for F6.0.

## Environment configuration

Generate `AUTH_SECRET` using a cryptographically secure value (for example, `npx auth secret`) and configure:

```dotenv
AUTH_SECRET=<cryptographically-random-secret>
AUTH_MICROSOFT_ENTRA_ID_ID=<application-client-id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client-secret-value>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
STAFF_ALLOWED_EMAILS=person1@chula.ac.th,person2@chula.ac.th
ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=true
```

`STAFF_ALLOWED_EMAILS` is an exact, comma-separated allowlist. Values are trimmed, lowercased, deduplicated, and validated as email addresses. An empty list denies every Entra identity; an organizational domain suffix is never treated as authorization.

## Deployment and verification

1. Add the environment values to the deployment environment.
2. Redeploy the application.
3. Open `/admin/inbox` and select **Sign in with Microsoft**.
4. Verify that an explicitly allowlisted account can enter.
5. Verify that a valid organizational account not on the allowlist is denied.
6. Verify sign out and the eight-hour session policy.
7. During migration and Meta review, leave `ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=true` only if temporary key access is still needed.
8. After Entra production validation and a review-safe cutover, set `ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=false` and redeploy.

Disabling legacy Staff Inbox login does not remove or change `APP_API_KEY` protection on unrelated administrative and integration endpoints.
