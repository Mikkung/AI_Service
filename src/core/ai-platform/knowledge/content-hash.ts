import { createHash } from "node:crypto";

export function computeContentHash(
  content: string | Buffer,
): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}
