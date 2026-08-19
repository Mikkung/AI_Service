import type {
  DocumentQAOutput,
} from "@/core/experiments/document-qa/types";

export function normalizeEvidenceText(
  text: string,
): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function verifyDocumentQAEvidence(
  output: Pick<
    DocumentQAOutput,
    "answerable" | "evidence"
  >,
  sourceText: string,
): boolean {
  if (!output.answerable) {
    return output.evidence.length === 0;
  }

  if (output.evidence.length === 0) {
    return false;
  }

  const normalizedSource =
    normalizeEvidenceText(sourceText);

  return output.evidence.every(
    (item) => {
      const normalizedEvidence =
        normalizeEvidenceText(item.text);

      return (
        normalizedEvidence.length > 0 &&
        normalizedSource.includes(
          normalizedEvidence,
        )
      );
    },
  );
}
