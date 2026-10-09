import type {
  ImageUnderstandingResult,
} from "@/core/ai-platform/media/image-understanding-provider";

const IDENTITY_DOCUMENT_CONTEXT =
  "User sent an identity document. Sensitive identifying fields were not retained.";

const PROHIBITED_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern:
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[redacted]",
  },
  {
    pattern:
      /(?:\+66|0)\s*\d(?:[\s().-]*\d){7,9}\b/g,
    replacement: "[redacted]",
  },
  {
    pattern:
      /\b(?:\d[ -]?){12,18}\d\b/g,
    replacement: "[redacted]",
  },
  {
    pattern:
      /\b((?:candidate|registration|student|citizen|national|government)\s*(?:id|number|no\.?)?)\s*[:#=-]?\s*[A-Z0-9][A-Z0-9./-]{3,}\b/gi,
    replacement: "$1: [redacted]",
  },
  {
    pattern:
      /\b(passport(?:\s*(?:id|number|no\.?))?)\s*[:#=-]?\s*[A-Z0-9][A-Z0-9-]{5,19}\b/gi,
    replacement: "$1: [redacted]",
  },
  {
    pattern:
      /\b(password|passcode|credential|access token|api key|secret)\s*[:=]\s*\S+/gi,
    replacement: "$1: [redacted]",
  },
  {
    pattern:
      /\b(full name|address|signature|email|e-mail|phone|telephone|mobile)\s*[:=]?\s*[^\n,;|]+/gi,
    replacement: "$1: [redacted]",
  },
  {
    pattern:
      /(เลข(?:ประจำตัว|บัตรประชาชน|หนังสือเดินทาง|ผู้สมัคร|นักเรียน))\s*[:#=-]?\s*[A-Z0-9ก-๙./-]{4,}/g,
    replacement: "$1: [redacted]",
  },
  {
    pattern:
      /(ชื่อ-นามสกุล|ที่อยู่|ลายเซ็น|อีเมล|โทรศัพท์|เบอร์โทร|รหัสผ่าน|โทเคน)\s*[:=]?\s*[^\n,;|]+/g,
    replacement: "$1: [redacted]",
  },
];

const MAX_SAFE_CONTEXT_LENGTH = 2000;

export function sanitizeMediaContextText(
  value: string,
): string {
  let sanitized = value;

  for (const {
    pattern,
    replacement,
  } of PROHIBITED_PATTERNS) {
    sanitized = sanitized.replace(
      pattern,
      replacement,
    );
  }

  return sanitized
    .replace(/(?:\[redacted\]\s*){2,}/g, "[redacted] ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SAFE_CONTEXT_LENGTH);
}

export function sanitizeImageUnderstandingResult(
  result: ImageUnderstandingResult,
): ImageUnderstandingResult {
  if (result.category === "identity_document") {
    return {
      ...result,
      sensitivity: "sensitive",
      safeContextText:
        IDENTITY_DOCUMENT_CONTEXT,
      requiresHumanReview: true,
      metadata: undefined,
    };
  }

  const safeContextText =
    sanitizeMediaContextText(
      result.safeContextText,
    );

  return {
    ...result,
    safeContextText,
    requiresHumanReview:
      result.requiresHumanReview ||
      safeContextText.length === 0,
    metadata: undefined,
  };
}
