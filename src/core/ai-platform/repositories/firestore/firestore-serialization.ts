function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function sanitizeValue(
  value: unknown,
): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitizeValue)
      .filter(
        (item) =>
          item !== undefined,
      );
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized: Record<
    string,
    unknown
  > = {};

  for (const [
    key,
    nestedValue,
  ] of Object.entries(value)) {
    const sanitizedValue =
      sanitizeValue(nestedValue);

    if (
      sanitizedValue !== undefined
    ) {
      sanitized[key] =
        sanitizedValue;
    }
  }

  return sanitized;
}

export function removeUndefinedFirestoreValues<
  T,
>(value: T): T {
  return sanitizeValue(value) as T;
}
