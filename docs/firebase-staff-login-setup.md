# Firebase Email/Password Staff Login Setup

F6.0 uses Firebase Authentication email/password credentials for a closed set of administrator-provisioned Staff Inbox accounts. A valid Firebase account alone does not grant access: the verified Firebase ID token must contain an email that exactly matches the server-only `STAFF_ALLOWED_EMAILS` allowlist.

Access is based on possession of the provisioned Firebase credentials plus explicit server-side allowlisting. Firebase email verification is not used as an additional authorization requirement.

There is no public account registration. Staff accounts are created manually by an administrator in Firebase Authentication, and the application does not expose a sign-up API or page.

## Firebase Console

1. Open the Firebase Console for the existing project.
2. Go to **Authentication > Sign-in method**.
3. Enable **Email/Password** and save the provider configuration.
4. Email Link sign-in does not need to be enabled.
5. Go to **Authentication > Users**.
6. Select **Add user** and manually create each authorized staff account with its email and initial password.
7. Register or select the Firebase Web app and copy its public web configuration values.

Use a separate Firebase account for each staff member. Account passwords belong only in Firebase Authentication and must never be added to application environment variables, source code, or documentation.

## Environment configuration

Configure the public Firebase Web identifiers:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

These values identify the Firebase Web app and are not server secrets. Never expose the Firebase service account, private key, allowlist, application API key, or staff session secret.

Configure the Firebase Admin project and credential:

```dotenv
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_B64=
```

Configure the server-only authorization and session policy:

```dotenv
STAFF_ALLOWED_EMAILS=staff1@example.com,staff2@example.com
STAFF_AUTH_SESSION_SECRET=<cryptographically-random-value-at-least-32-characters>
ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=true
```

`STAFF_ALLOWED_EMAILS` is comma-separated, trimmed, lowercased, deduplicated, and matched exactly. Domain membership does not grant access, and an empty allowlist denies everyone. Every manually provisioned Firebase staff email must also be listed explicitly.

No password-related environment variables are needed. Passwords remain exclusively in Firebase Authentication.

## Authentication and authorization flow

```text
Firebase email/password authentication
    -> Firebase ID token
    -> Firebase Admin ID-token verification
    -> normalized email claim
    -> exact STAFF_ALLOWED_EMAILS match
    -> signed HttpOnly eight-hour Staff Inbox session
    -> Staff Inbox
```

The browser does not persist the password or manually store the Firebase ID token. After the server session is created, the Firebase browser session is signed out and Staff Inbox API access continues through the signed HttpOnly application session.

Firebase email verification is intentionally not required for these manually provisioned closed-system accounts. Authorization still requires successful Firebase credential authentication, Firebase Admin token verification, a valid email claim, and exact server allowlisting. Normal Firebase disabled-account and token-revocation behavior remains in effect.

## Deployment and verification

1. Add the public and server-only variables to the intended Vercel environment.
2. Confirm that `STAFF_ALLOWED_EMAILS` contains each authorized account's exact email.
3. Redeploy the application.
4. Test a provisioned allowlisted account with the correct password.
5. Test the same account with a wrong password and confirm the UI shows only `Invalid email or password.`
6. Test a valid Firebase user that is not allowlisted and confirm access is denied.
7. Test logout and confirm the server Staff Inbox session expires.
8. Keep `ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=true` until migration and Meta App Review safety are confirmed.
9. Later set `ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED=false` and redeploy to remove the temporary Staff Inbox key-login UI.

Disabling legacy Staff Inbox login does not change `APP_API_KEY` protection for unrelated administrative or integration endpoints.
