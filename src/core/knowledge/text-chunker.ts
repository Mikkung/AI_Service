export interface TextChunk {
  index: number;
  text: string;
}

export interface ChunkTextOptions {
  maxChars?: number;
  overlapChars?: number;
}

function normalizeText(
  input: string,
): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(
  input: string,
  options: ChunkTextOptions = {},
): TextChunk[] {
  const maxChars =
    options.maxChars ?? 1800;

  const overlapChars =
    options.overlapChars ?? 250;

  if (maxChars < 500) {
    throw new Error(
      "maxChars must be at least 500.",
    );
  }

  if (
    overlapChars < 0 ||
    overlapChars >= maxChars
  ) {
    throw new Error(
      "overlapChars must be >= 0 and smaller than maxChars.",
    );
  }

  const text =
    normalizeText(input);

  if (!text) {
    return [];
  }

  if (text.length <= maxChars) {
    return [
      {
        index: 0,
        text,
      },
    ];
  }

  const chunks: TextChunk[] = [];

  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(
      start + maxChars,
      text.length,
    );

    /*
     * Try not to cut directly in the middle
     * of a paragraph.
     */
    if (end < text.length) {
      const window =
        text.slice(start, end);

      const paragraphBreak =
        window.lastIndexOf("\n\n");

      const sentenceBreak =
        Math.max(
          window.lastIndexOf(". "),
          window.lastIndexOf("? "),
          window.lastIndexOf("! "),
          window.lastIndexOf("。"),
          window.lastIndexOf("？"),
          window.lastIndexOf("！"),
        );

      const preferredBreak =
        Math.max(
          paragraphBreak,
          sentenceBreak,
        );

      /*
       * Only use the preferred break if it
       * is not too close to the beginning.
       */
      if (
        preferredBreak >
        Math.floor(maxChars * 0.6)
      ) {
        end =
          start +
          preferredBreak +
          1;
      }
    }

    const chunk =
      text
        .slice(start, end)
        .trim();

    if (chunk) {
      chunks.push({
        index,
        text: chunk,
      });

      index += 1;
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(
      end - overlapChars,
      start + 1,
    );
  }

  return chunks;
}