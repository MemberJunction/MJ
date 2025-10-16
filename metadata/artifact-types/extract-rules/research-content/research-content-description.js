/**
 * Extracts the description/summary for research content artifacts
 * Priority: report.description > metadata.researchGoal
 */
try {
  const data = JSON.parse(content);

  // First priority: report.description
  if (data.report && data.report.description) {
    return data.report.description;
  }

  // Fallback: metadata.researchGoal
  if (data.metadata && data.metadata.researchGoal) {
    return data.metadata.researchGoal;
  }

  return null;
} catch (e) {
  return null;
}
