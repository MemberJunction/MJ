/**
 * Extracts the winning ML Model ID for drill-through navigation.
 * Priority: report.bestModelId > top leaderboard entry's modelId
 */
try {
  const data = JSON.parse(content);

  if (data.report && data.report.bestModelId) {
    return data.report.bestModelId;
  }

  if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
    const top = data.leaderboard[0];
    if (top && top.modelId) {
      return top.modelId;
    }
  }

  return null;
} catch (e) {
  return null;
}
