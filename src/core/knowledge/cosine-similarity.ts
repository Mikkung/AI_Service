export function cosineSimilarity(
  a: number[],
  b: number[],
): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const aValue = a[i] ?? 0;
    const bValue = b[i] ?? 0;

    dotProduct += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return (
    dotProduct /
    (Math.sqrt(normA) * Math.sqrt(normB))
  );
}