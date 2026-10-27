const TENANT_ISSUER_PATTERN =
  /^https:\/\/login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/v2\.0\/?$/i;

export interface EntraStaffAuthConfig {
  clientId: string;
  clientSecret: string;
  issuer: string;
}

export function isTenantSpecificEntraIssuer(
  value: string | undefined,
): boolean {
  return Boolean(
    value &&
      TENANT_ISSUER_PATTERN.test(
        value.trim(),
      ),
  );
}

export function getEntraStaffAuthConfig():
  EntraStaffAuthConfig | null {
  const clientId =
    process.env
      .AUTH_MICROSOFT_ENTRA_ID_ID
      ?.trim();
  const clientSecret =
    process.env
      .AUTH_MICROSOFT_ENTRA_ID_SECRET
      ?.trim();
  const issuer =
    process.env
      .AUTH_MICROSOFT_ENTRA_ID_ISSUER
      ?.trim();

  if (
    !clientId ||
    !clientSecret ||
    !issuer ||
    !isTenantSpecificEntraIssuer(
      issuer,
    )
  ) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    issuer,
  };
}

export function isLegacyAdminUiLoginEnabled(
  value =
    process.env
      .ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED,
): boolean {
  if (value === undefined || value === "") {
    return true;
  }

  return value.trim().toLowerCase() ===
    "true";
}
