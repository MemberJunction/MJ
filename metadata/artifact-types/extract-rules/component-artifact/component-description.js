/**
 * Extracts the description/summary for research content artifacts
 * Priority: report.description > metadata.researchGoal
 */
try {
  const data = JSON.parse(content);

  // First priority: report.description
  if (data.description) {
    return data.description;
  }

  return null;
} catch (e) {
  return null;
}
