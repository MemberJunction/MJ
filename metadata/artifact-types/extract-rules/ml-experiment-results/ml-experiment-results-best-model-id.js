/**
 * Extracts the winning ML Model ID for drill-through navigation.
 *
 * The canonical artifact shape is the Core `ModelingPlanSpec` (PascalCase):
 * a `Leaderboard` array of `{ IterationID, Metric, ModelID }` entries, best-first.
 * Priority: BestModel.ID > top Leaderboard entry's ModelID > (lowercase / report fallbacks).
 */
try {
  const data = JSON.parse(content);

  // Canonical: an explicit best-model pointer (object or scalar).
  if (data.BestModel && data.BestModel.ID) {
    return data.BestModel.ID;
  }
  if (typeof data.BestModelID === 'string') {
    return data.BestModelID;
  }

  // Canonical: top leaderboard entry's ModelID (PascalCase).
  if (Array.isArray(data.Leaderboard) && data.Leaderboard.length > 0) {
    const top = data.Leaderboard[0];
    if (top && top.ModelID) {
      return top.ModelID;
    }
  }

  // Fallbacks (older / LLM-authored lowercase + report shapes).
  if (data.report && data.report.bestModelId) {
    return data.report.bestModelId;
  }
  if (typeof data.bestModelId === 'string') {
    return data.bestModelId;
  }
  if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
    const topLc = data.leaderboard[0];
    if (topLc && (topLc.modelId || topLc.ModelID)) {
      return topLc.modelId || topLc.ModelID;
    }
  }

  return null;
} catch (e) {
  return null;
}
