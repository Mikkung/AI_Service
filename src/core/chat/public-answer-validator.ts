export const MISSING_INFORMATION_FALLBACK =
  "ข้อมูลนี้ยังไม่มีอยู่ในฐานข้อมูลที่ตรวจสอบได้ กรุณายืนยันกับเจ้าหน้าที่ ISE";

export const MAX_ANSWER_REPAIR_ATTEMPTS = 1;

export type AnswerPolicyViolation =
  | "internal_rag_terminology"
  | "at_least_one_changed_to_only_one"
  | "explicit_no_minimum_treated_as_missing"
  | "unsupported_contact_advice"
  | "answer_subject_changed"
  | "accepted_alternative_made_mandatory"
  | "unsupported_multiple_score_submission_rule";

export interface PublicAnswerValidationOptions {
  userMessage?: string;
}

export interface PublicAnswerValidationResult {
  ok: boolean;
  violations: AnswerPolicyViolation[];
}

interface InternalTermPattern {
  label: string;
  pattern: RegExp;
}

const internalTermPatterns: InternalTermPattern[] = [
  {
    label: "RETRIEVED CONTEXT",
    pattern: /\bretrieved\s+context\b/i,
  },
  {
    label: "CONTEXT <number>",
    pattern: /\bcontext\s*\d+\b/i,
  },
  {
    label: "chunkId",
    pattern: /\bchunkid\b/i,
  },
  {
    label: "chunk",
    pattern: /\bchunk\b/i,
  },
  {
    label: "sourceId",
    pattern: /\bsourceid\b/i,
  },
  {
    label: "embedding",
    pattern: /\bembedding\b/i,
  },
  {
    label: "เอกสาร_criteria",
    pattern: /เอกสาร_criteria/i,
  },
  {
    label: "prompt",
    pattern: /\bprompt\b/i,
  },
  {
    label: "system instruction",
    pattern: /\bsystem\s+instruction\b/i,
  },
];

const onlyOnePatterns = [
  /\bonly\s+one\b/i,
  /\bone\s+result\s+only\b/i,
  /เพียงหนึ่ง/,
  /เพียงตัวเดียว/,
  /เพียงรายการเดียว/,
  /ได้แค่หนึ่ง/,
];

const unlimitedSubmissionPatterns = [
  /\bunlimited\s+submissions?\b/i,
  /\bno\s+limit(?:s|ation)?\s+(?:on\s+)?(?:the\s+)?(?:number\s+of\s+)?(?:submissions?|results?)\b/i,
  /ไม่มีข้อจำกัดจำนวนรายการ/,
  /ส่งได้ไม่จำกัด/,
  /ไม่จำกัดจำนวน/,
];

const acceptedAlternativeTestNames = [
  "IELTS",
  "TOEFL",
  "CU-TEP",
  "Duolingo",
  "SAT",
  "CU-AAT",
  "ACT",
  "AP Calculus",
  "CU-ENT",
  "TGAT",
  "TPAT3",
] as const;

const mandatoryAlternativePatterns =
  acceptedAlternativeTestNames.flatMap(
    (testName) => {
      const escapedTestName =
        escapeRegExp(testName);

      return [
        new RegExp(
          `\\bmust\\s+have\\s+(?:an?\\s+)?${escapedTestName}\\b`,
          "i",
        ),
        new RegExp(
          `\\b${escapedTestName}\\s+is\\s+(?:required|mandatory)\\b`,
          "i",
        ),
        new RegExp(
          `ต้องมี(?:อย่างน้อยหนึ่ง(?:รายการ)?\\s*)?(?:ผล(?:การ)?สอบ\\s*)?${escapedTestName}`,
          "i",
        ),
        new RegExp(
          `ต้องใช้\\s*${escapedTestName}`,
          "i",
        ),
      ];
    },
  );

const nonMandatoryAlternativePatterns =
  acceptedAlternativeTestNames.flatMap(
    (testName) => {
      const escapedTestName =
        escapeRegExp(testName);

      return [
        new RegExp(
          `ไม่(?:จำเป็น)?ต้องมี[^.\\n]*${escapedTestName}`,
          "i",
        ),
        new RegExp(
          `ไม่จำเป็นต้องใช้\\s*${escapedTestName}`,
          "i",
        ),
      ];
    },
  );

const contactAdvicePatterns = [
  /\bcontact\s+(?:ise|admissions|an\s+office|office)\b/i,
  /\bask\s+(?:staff|ise)\b/i,
  /\badmissions\s+office\b/i,
  /\badministration\s+office\b/i,
  /กรุณา(?:ติดต่อ|สอบถาม)/,
  /ติดต่อ(?:กับ)?\s*(?:ISE|เจ้าหน้าที่|ฝ่ายรับสมัคร|สำนักงาน)/i,
  /สอบถาม(?:กับ)?\s*(?:เจ้าหน้าที่|ISE|ฝ่ายรับสมัคร)/i,
  /ยืนยันกับเจ้าหน้าที่\s*ISE/i,
];

const contactQuestionPatterns = [
  /\bcontact\b/i,
  /\bemail\b/i,
  /\bphone\b/i,
  /ติดต่อ/,
  /อีเมล/,
  /โทร/,
  /เบอร์/,
];

const missingAnswerPatterns = [
  /ข้อมูลนี้ยังไม่มีอยู่ในฐานข้อมูลที่ตรวจสอบได้/,
  /ไม่มีอยู่ในฐานข้อมูล/,
  /ไม่มีข้อมูลในฐานข้อมูล/,
  /ไม่พบข้อมูล/,
];

const noMinimumTests = [
  "CU-ENT",
  "TGAT",
  "TPAT3",
] as const;

type Anchor =
  | "fee"
  | "ielts"
  | "toefl"
  | "cu-ent"
  | "tgat"
  | "tpat3"
  | "interview"
  | "sat"
  | "act"
  | "cu-aat"
  | "option1"
  | "option2"
  | "option3"
  | "option4";

interface AnchorPattern {
  anchor: Anchor;
  pattern: RegExp;
}

const anchorPatterns: AnchorPattern[] = [
  {
    anchor: "fee",
    pattern: /\btuition\b|\bfees?\b|ค่าเทอม|ค่าธรรมเนียม/i,
  },
  {
    anchor: "ielts",
    pattern: /\bIELTS\b/i,
  },
  {
    anchor: "toefl",
    pattern: /\bTOEFL\b/i,
  },
  {
    anchor: "cu-ent",
    pattern: /\bCU-?ENT\b/i,
  },
  {
    anchor: "tgat",
    pattern: /\bTGAT\b/i,
  },
  {
    anchor: "tpat3",
    pattern: /\bTPAT\s*3\b|\bTPAT3\b/i,
  },
  {
    anchor: "interview",
    pattern: /\binterview\b|สัมภาษณ์/i,
  },
  {
    anchor: "sat",
    pattern: /\bSAT\b/i,
  },
  {
    anchor: "act",
    pattern: /\bACT\b/i,
  },
  {
    anchor: "cu-aat",
    pattern: /\bCU-?AAT\b/i,
  },
  {
    anchor: "option1",
    pattern: /\boption\s*1\b|Option 1|ทางเลือก\s*1|ออปชัน\s*1/i,
  },
  {
    anchor: "option2",
    pattern: /\boption\s*2\b|Option 2|ทางเลือก\s*2|ออปชัน\s*2/i,
  },
  {
    anchor: "option3",
    pattern: /\boption\s*3\b|Option 3|ทางเลือก\s*3|ออปชัน\s*3/i,
  },
  {
    anchor: "option4",
    pattern: /\boption\s*4\b|Option 4|ทางเลือก\s*4|ออปชัน\s*4/i,
  },
];

const testAnchors = new Set<Anchor>([
  "ielts",
  "toefl",
  "cu-ent",
  "tgat",
  "tpat3",
  "sat",
  "act",
  "cu-aat",
]);

const optionAnchors = new Set<Anchor>([
  "option1",
  "option2",
  "option3",
  "option4",
]);

export function validatePublicAnswer(
  answer: string,
  context: string,
  options: PublicAnswerValidationOptions = {},
): PublicAnswerValidationResult {
  const violations =
    new Set<AnswerPolicyViolation>();

  if (containsInternalRagTerminology(answer)) {
    violations.add(
      "internal_rag_terminology",
    );
  }

  if (
    contextHasAtLeastOneSemantics(
      context,
    ) &&
    onlyOnePatterns.some((pattern) =>
      pattern.test(answer),
    )
  ) {
    violations.add(
      "at_least_one_changed_to_only_one",
    );
  }

  if (
    contextHasExplicitNoMinimum(
      context,
    ) &&
    answerLooksMissing(answer)
  ) {
    violations.add(
      "explicit_no_minimum_treated_as_missing",
    );
  }

  if (
    !isExactMissingFallback(answer) &&
    !userAskedForContact(
      options.userMessage,
    ) &&
    contactAdvicePatterns.some(
      (pattern) =>
        pattern.test(answer),
    )
  ) {
    violations.add(
      "unsupported_contact_advice",
    );
  }

  if (
    options.userMessage &&
    answerChangesSubject(
      options.userMessage,
      answer,
    )
  ) {
    violations.add(
      "answer_subject_changed",
    );
  }

  if (
    mandatoryAlternativePatterns.some(
      (pattern) =>
        pattern.test(answer),
    ) &&
    !nonMandatoryAlternativePatterns.some(
      (pattern) =>
        pattern.test(answer),
    )
  ) {
    violations.add(
      "accepted_alternative_made_mandatory",
    );
  }

  if (
    unlimitedSubmissionPatterns.some(
      (pattern) =>
        pattern.test(answer),
    )
  ) {
    violations.add(
      "unsupported_multiple_score_submission_rule",
    );
  }

  return {
    ok: violations.size === 0,
    violations:
      Array.from(violations),
  };
}

export function answerChangesSubject(
  userMessage: string,
  answer: string,
): boolean {
  if (
    isExactMissingFallback(answer)
  ) {
    return false;
  }

  const questionAnchors =
    extractAnchors(userMessage);
  const answerAnchors =
    extractAnchors(answer);

  if (questionAnchors.size === 0) {
    return false;
  }

  if (
    questionAnchors.has("fee")
  ) {
    return hasCompetingAnswerAnchor(
      answerAnchors,
      new Set<Anchor>(["fee"]),
    );
  }

  const requestedTests =
    intersectAnchors(
      questionAnchors,
      testAnchors,
    );
  const answerTests =
    intersectAnchors(
      answerAnchors,
      testAnchors,
    );

  if (
    requestedTests.size > 0 &&
    answerTests.size > 0 &&
    !setsOverlap(
      requestedTests,
      answerTests,
    )
  ) {
    return true;
  }

  const requestedOptions =
    intersectAnchors(
      questionAnchors,
      optionAnchors,
    );
  const answerOptions =
    intersectAnchors(
      answerAnchors,
      optionAnchors,
    );

  if (
    requestedOptions.size > 0 &&
    answerOptions.size > 0 &&
    !setsOverlap(
      requestedOptions,
      answerOptions,
    )
  ) {
    return true;
  }

  if (
    questionAnchors.has("interview") &&
    !answerAnchors.has("interview") &&
    hasCompetingAnswerAnchor(
      answerAnchors,
      new Set<Anchor>([
        "interview",
        ...requestedOptions,
      ]),
    )
  ) {
    return true;
  }

  return false;
}

export function containsInternalRagTerminology(
  answer: string,
): boolean {
  return internalTermPatterns.some(
    ({ pattern }) =>
      pattern.test(answer),
  );
}

export function repairPublicAnswerDeterministically(
  answer: string,
  context: string,
  options: PublicAnswerValidationOptions = {},
): string {
  const explicitNoMinimumAnswer =
    buildExplicitNoMinimumAnswer(
      context,
      options.userMessage,
    );

  if (
    explicitNoMinimumAnswer &&
    answerLooksMissing(answer)
  ) {
    return explicitNoMinimumAnswer;
  }

  let repaired =
    removeInternalTerminology(answer);

  if (
    contextHasAtLeastOneSemantics(
      context,
    )
  ) {
    repaired = repaired
      .replace(
        /\bonly\s+one\b/gi,
        "at least one",
      )
      .replace(
        /\bone\s+result\s+only\b/gi,
        "at least one result",
      )
      .replace(
        /เพียงหนึ่ง/g,
        "อย่างน้อยหนึ่งรายการที่ผ่านเกณฑ์",
      )
      .replace(
        /เพียงตัวเดียว/g,
        "อย่างน้อยหนึ่งรายการที่ผ่านเกณฑ์",
      )
      .replace(
        /เพียงรายการเดียว/g,
        "อย่างน้อยหนึ่งรายการที่ผ่านเกณฑ์",
      )
      .replace(
        /ได้แค่หนึ่ง/g,
        "อย่างน้อยหนึ่งรายการที่ผ่านเกณฑ์",
      );
  }

  repaired =
    repairMandatoryAlternativeWording(
      repaired,
    )
      .replace(
        /ไม่มีข้อจำกัดจำนวนรายการ/g,
        "สามารถส่งผลสอบที่ผ่านเกณฑ์ได้หนึ่งรายการขึ้นไป แต่ข้อมูลที่ตรวจสอบได้ไม่ได้ระบุวิธีเลือกหรือคำนวณคะแนนเมื่อส่งหลายรายการ",
      )
      .replace(
        /ส่งได้ไม่จำกัด|ไม่จำกัดจำนวน/g,
        "ส่งผลสอบที่ผ่านเกณฑ์ได้หนึ่งรายการขึ้นไป",
      )
      .replace(
        /\bunlimited\s+submissions?\b/gi,
        "one or more qualifying results",
      )
      .replace(
        /\bno\s+limit(?:s|ation)?\s+(?:on\s+)?(?:the\s+)?(?:number\s+of\s+)?(?:submissions?|results?)\b/gi,
        "one or more qualifying results may be submitted, but the multiple-result selection rule is unspecified",
      );

  if (
    !isExactMissingFallback(
      repaired,
    ) &&
    !userAskedForContact(
      options.userMessage,
    )
  ) {
    repaired =
      removeContactAdviceSentences(
        repaired,
      );
  }

  return repaired.trim();
}

export function ensureCompletePublicAnswer(
  answer: string,
  context: string,
  options: PublicAnswerValidationOptions = {},
): string {
  const trimmedAnswer =
    answer.trim();

  if (trimmedAnswer.length > 1) {
    return trimmedAnswer;
  }

  const explicitNoMinimumAnswer =
    buildExplicitNoMinimumAnswer(
      context,
      options.userMessage,
    );

  if (explicitNoMinimumAnswer) {
    return explicitNoMinimumAnswer;
  }

  if (
    !options.userMessage ||
    !contextAppearsToAnswerQuestion(
      options.userMessage,
      context,
    ) ||
    MISSING_INFORMATION_FALLBACK.startsWith(
      trimmedAnswer,
    )
  ) {
    return MISSING_INFORMATION_FALLBACK;
  }

  return trimmedAnswer;
}

export function contextAppearsToAnswerQuestion(
  userMessage: string,
  context: string,
): boolean {
  const questionAnchors =
    extractAnchors(userMessage);

  if (questionAnchors.size === 0) {
    return true;
  }

  if (
    questionAnchors.has("fee")
  ) {
    return (
      /\btuition\b|\bfees?\b|ค่าเทอม|ค่าธรรมเนียม|บาท|baht/i.test(
        context,
      )
    );
  }

  for (const anchor of questionAnchors) {
    const pattern =
      anchorPatterns.find(
        (item) =>
          item.anchor === anchor,
      )?.pattern;

    if (
      pattern &&
      !pattern.test(context)
    ) {
      return false;
    }
  }

  return true;
}

export function shouldAttemptAnswerRepair(
  attempts: number,
): boolean {
  return (
    attempts <
    MAX_ANSWER_REPAIR_ATTEMPTS
  );
}

function contextHasAtLeastOneSemantics(
  context: string,
): boolean {
  return (
    /\bat\s+least\s+one\b/i.test(
      context,
    ) ||
    /อย่างน้อยหนึ่ง/.test(context)
  );
}

function contextHasExplicitNoMinimum(
  context: string,
): boolean {
  return noMinimumTests.some((testName) =>
    contextHasNoMinimumForTest(
      context,
      testName,
    ),
  );
}

function contextHasNoMinimumForTest(
  context: string,
  testName: string,
): boolean {
  const escapedTestName =
    testName.replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      "\\$&",
    );

  return (
    new RegExp(
      `no\\s+minimum[^.\\n]*${escapedTestName}[^.\\n]*specified`,
      "i",
    ).test(context) ||
    new RegExp(
      `no\\s+minimum\\s+${escapedTestName}[^.\\n]*specified`,
      "i",
    ).test(context) ||
    new RegExp(
      `${escapedTestName}[^.\\n]*(?:ไม่ได้ระบุ|ยังไม่ได้ระบุ|ไม่มีการระบุ)คะแนนขั้นต่ำ`,
      "i",
    ).test(context) ||
    new RegExp(
      `(?:ไม่ได้ระบุ|ยังไม่ได้ระบุ|ไม่มีการระบุ)คะแนนขั้นต่ำ[^.\\n]*${escapedTestName}`,
      "i",
    ).test(context)
  );
}

function buildExplicitNoMinimumAnswer(
  context: string,
  userMessage?: string,
): string | undefined {
  const targetTest =
    noMinimumTests.find(
      (testName) =>
        userMessage
          ?.toLocaleLowerCase()
          .includes(
            testName.toLocaleLowerCase(),
          ),
    );

  if (
    !targetTest ||
    !contextHasNoMinimumForTest(
      context,
      targetTest,
    )
  ) {
    return undefined;
  }

  return `ปัจจุบันเกณฑ์ AY2027 ยังไม่ได้ระบุคะแนนขั้นต่ำของ ${targetTest}`;
}

function extractAnchors(
  text: string,
): Set<Anchor> {
  const anchors =
    new Set<Anchor>();

  for (const item of anchorPatterns) {
    if (item.pattern.test(text)) {
      anchors.add(item.anchor);
    }
  }

  return anchors;
}

function intersectAnchors(
  anchors: Set<Anchor>,
  targetAnchors: Set<Anchor>,
): Set<Anchor> {
  return new Set(
    Array.from(anchors).filter(
      (anchor) =>
        targetAnchors.has(anchor),
    ),
  );
}

function setsOverlap<T>(
  a: Set<T>,
  b: Set<T>,
): boolean {
  return Array.from(a).some(
    (item) => b.has(item),
  );
}

function hasCompetingAnswerAnchor(
  answerAnchors: Set<Anchor>,
  allowedAnchors: Set<Anchor>,
): boolean {
  return Array.from(answerAnchors)
    .some(
      (anchor) =>
        !allowedAnchors.has(anchor),
    );
}

function repairMandatoryAlternativeWording(
  answer: string,
): string {
  return acceptedAlternativeTestNames.reduce(
    (current, testName) => {
      const escapedTestName =
        escapeRegExp(testName);
      const thaiAlternative =
        testName === "IELTS"
          ? `${testName} เป็นหนึ่งในตัวเลือกผลสอบภาษาอังกฤษที่ยอมรับ`
          : `${testName} เป็นหนึ่งในตัวเลือกผลสอบที่ยอมรับ`;
      const englishAlternative =
        testName === "IELTS"
          ? `${testName} is an accepted English option`
          : `${testName} is an accepted option`;

      return current
        .replace(
          new RegExp(
            `ต้องมีอย่างน้อยหนึ่ง(?:รายการ)?(?:ผล(?:การ)?สอบ)?\\s*${escapedTestName}`,
            "gi",
          ),
          thaiAlternative,
        )
        .replace(
          new RegExp(
            `ต้องมี(?:อย่างน้อยหนึ่ง(?:รายการ)?\\s*)?(?:ผล(?:การ)?สอบ\\s*)?${escapedTestName}`,
            "gi",
          ),
          thaiAlternative,
        )
        .replace(
          new RegExp(
            `ต้องใช้\\s*${escapedTestName}`,
            "gi",
          ),
          `หากเลือกใช้ ${testName}`,
        )
        .replace(
          new RegExp(
            `\\bmust\\s+have\\s+(?:an?\\s+)?${escapedTestName}\\b`,
            "gi",
          ),
          `may use ${testName} as an accepted option`,
        )
        .replace(
          new RegExp(
            `\\b${escapedTestName}\\s+is\\s+(?:required|mandatory)\\b`,
            "gi",
          ),
          englishAlternative,
        );
    },
    answer,
  );
}

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[-/\\^$*+?.()|[\]{}]/g,
    "\\$&",
  );
}

function answerLooksMissing(
  answer: string,
): boolean {
  return missingAnswerPatterns.some(
    (pattern) =>
      pattern.test(answer),
  );
}

function isExactMissingFallback(
  answer: string,
): boolean {
  return (
    answer.trim() ===
    MISSING_INFORMATION_FALLBACK
  );
}

function userAskedForContact(
  userMessage?: string,
): boolean {
  if (!userMessage) {
    return false;
  }

  return contactQuestionPatterns.some(
    (pattern) =>
      pattern.test(userMessage),
  );
}

function removeInternalTerminology(
  answer: string,
): string {
  return internalTermPatterns.reduce(
    (current, { pattern }) =>
      current.replace(
        pattern,
        "ข้อมูล",
      ),
    answer,
  );
}

function removeContactAdviceSentences(
  answer: string,
): string {
  return answer
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .filter((sentence) => {
      const trimmed =
        sentence.trim();

      return (
        trimmed.length > 0 &&
        !contactAdvicePatterns.some(
          (pattern) =>
            pattern.test(trimmed),
        )
      );
    })
    .join(" ")
    .trim();
}
