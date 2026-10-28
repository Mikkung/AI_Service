# Firebase Passwordless Staff Login Setup

F6.0 uses Firebase Authentication email-link sign-in to prove control of an email account. Firebase authentication does not prove employment or organizational membership. Staff Inbox authorization additionally requires an exact match in the server-only `STAFF_ALLOWED_EMAILS` allowlist.

## Firebase Console

1. Open the Firebase Console for the existing project.
2. Go to **Authentication > Sign-in method**.
3. Enable the **Email/Password** provider.
4. Enable **Email link (passwordless sign-in)** and save the provider configuration.
5. Under **Authentication > Settings > Authorized domains**, allow only the required application domains:
   - `ai-service-swart.vercel.app`
   - `localhost`
6. Register or select the Firebase Web app and copy its public web configuration values.

This flow uses Firebase's current in-app email action handling and does not depend on deprecated Firebase Dynamic Links. No Google Sign-In provider is required.

## Environment configuration

Configure the public Firebase Web identifiers:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

These values identify the Firebase Web app and are not server secrets. Never expose the Firebase service account, private key, allowlist, application API key, or staff session secret.

Configure the server-only policy and session values:

```dotenv
STAFF_ALLOWED_EMAILS=person1@example.com,person2@example.com
STAFF_AUTH_SESSION_SECRET=<cryptographically-random-value-at-least-32-characters>
ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=true
```

Keep the existing Firebase Admin variables, including `FIREBASE_PROJECT_ID` and the deployed service-account configuration. The public project ID is separate because Next.js must embed it into the browser bundle.

`STAFF_ALLOWED_EMAILS` is comma-separated, lowercased, trimmed, deduplicated, and matched exactly. Domain membership and plus-address variants are not authorization. An empty allowlist denies everyone.

## Email-link continuation URLs

- Production: `https://ai-service-swart.vercel.app/admin/inbox/auth/complete`
- Local: `http://localhost:3000/admin/inbox/auth/complete`

The application sets `handleCodeInApp: true`. The originating browser temporarily stores only the entered email to complete the Firebase flow. If the link opens on another device, the completion page asks for the email again. Firebase ID tokens are never stored manually in local storage.

## Deployment and verification

1. Add all public and server-only variables to the intended deployment environment.
2. Redeploy the application.
3. Request a link for an allowlisted email and verify successful Staff Inbox access.
4. Verify that a valid, email-verified Firebase account not on the allowlist cannot establish a Staff Inbox session.
5. Test logout and confirm that the server session cookie expires.
6. Test locally using `localhost` and the local continuation URL before relying on Vercel.
7. During migration and Meta App Review, retain `ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=true` only while key access remains necessary.
8. After passwordless login is production-verified and the migration is safe, set `ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=false` and redeploy.

Firebase's public email-link endpoint can be called by browser users. Security therefore never depends on preventing link requests: Firebase Admin verifies the resulting token, requires `email_verified=true`, and the server independently enforces the exact allowlist before issuing its HttpOnly eight-hour session. Keep Firebase Authentication email-enumeration protection enabled when available, and retain neutral UI responses for link requests.

Disabling legacy Staff Inbox login does not change `APP_API_KEY` protection for unrelated administrative or integration endpoints.
