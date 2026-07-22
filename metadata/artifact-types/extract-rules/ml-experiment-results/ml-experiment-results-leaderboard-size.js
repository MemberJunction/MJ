/**
 * Extracts the number of iterations on the leaderboard.
 *
 * The canonical artifact shape is the Core `ModelingPlanSpec` (PascalCase):
 * a `Leaderboard` array. Prefer it; fall back to a lowercase `leaderboard`.
 */
try {
  const data = JSON.parse(content);

  if (Array.isArray(data.Leaderboard)) {
    return data.Leaderboard.length;
  }
  if (Array.isArray(data.leaderboard)) {
    return data.leaderboard.length;
  }

  return 0;
} catch (e) {
  return 0;
}
