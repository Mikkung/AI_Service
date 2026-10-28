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
