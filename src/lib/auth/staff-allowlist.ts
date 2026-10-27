const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeStaffEmail(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase();

  return EMAIL_PATTERN.test(normalized)
    ? normalized
    : null;
}

export function parseStaffAllowedEmails(
  value: string | undefined,
): Set<string> {
  const emails = new Set<string>();

  for (const candidate of
    value?.split(",") ?? []) {
    const normalized =
      normalizeStaffEmail(candidate);
    if (normalized) {
      emails.add(normalized);
    }
  }

  return emails;
}

export function isAllowedStaffEmail(
  value: unknown,
  allowedEmails =
    parseStaffAllowedEmails(
      process.env.STAFF_ALLOWED_EMAILS,
    ),
): boolean {
  const normalized =
    normalizeStaffEmail(value);

  return normalized !== null &&
    allowedEmails.has(normalized);
}

export function getVerifiedEntraIdentifier(
  user: { email?: string | null },
  profile?: unknown,
): string | null {
  const userEmail =
    normalizeStaffEmail(user.email);
  if (userEmail) {
    return userEmail;
  }

  if (
    profile === null ||
    typeof profile !== "object" ||
    Array.isArray(profile)
  ) {
    return null;
  }

  const claims = profile as Record<
    string,
    unknown
  >;

  return normalizeStaffEmail(
    claims.preferred_username,
  ) ?? normalizeStaffEmail(
    claims.email,
  );
}
