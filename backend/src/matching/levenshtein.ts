/**
 * Levenshtein distance (edit distance) between two strings.
 * Uses the classic Wagner-Fischer DP algorithm with O(min(m,n)) space.
 * No external dependencies — this is intentionally self-contained.
 */
export function levenshteinDistance(a: string, b: string): number {
  // Ensure `a` is the shorter string (saves memory in the 1-row DP)
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // Edge cases
  if (m === 0) return n;

  // Only need two rows at a time — previous and current
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);

  // Initialize base row
  for (let j = 0; j <= m; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost     // substitution
      );
    }
    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}
