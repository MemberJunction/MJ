/**
 * Extracts the name/title for research content artifacts
 * Priority: report.name > metadata.researchGoal (truncated)
 */
try {
  const data = JSON.parse(content);

  // First priority: report.name
  if (data.report && data.report.name) {
    return data.report.name;
  }

  // Fallback: metadata.researchGoal (truncated to reasonable length)
  if (data.metadata && data.metadata.researchGoal) {
    const goal = data.metadata.researchGoal;
    return goal.length > 100 ? goal.substring(0, 100) + '...' : goal;
  }

  return 'Research Report';
} catch (e) {
  return 'Research Report';
}
