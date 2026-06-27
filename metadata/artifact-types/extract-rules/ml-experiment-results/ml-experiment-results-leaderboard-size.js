/**
 * Extracts the number of iterations on the leaderboard.
 */
try {
  const data = JSON.parse(content);

  if (Array.isArray(data.leaderboard)) {
    return data.leaderboard.length;
  }

  return 0;
} catch (e) {
  return 0;
}
