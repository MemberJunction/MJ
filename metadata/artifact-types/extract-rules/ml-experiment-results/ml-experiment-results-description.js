/**
 * Extracts a short description/summary for ML Experiment Results artifacts.
 *
 * The canonical artifact shape is the Core `ModelingPlanSpec` (PascalCase):
 * `Goal` carries the business objective. Priority:
 * Summary > Goal > (lowercase / report fallbacks) > default.
 */
try {
  const data = JSON.parse(content);

  if (typeof data.Summary === 'string' && data.Summary.trim()) {
    return data.Summary;
  }

  if (typeof data.Goal === 'string' && data.Goal.trim()) {
    return data.Goal;
  }

  // Fallbacks (older / LLM-authored lowercase + report shapes).
  if (data.report && data.report.summary) {
    return data.report.summary;
  }
  if (typeof data.goal === 'string' && data.goal.trim()) {
    return data.goal;
  }

  return 'Results of a Predictive Studio experiment session.';
} catch (e) {
  return 'Results of a Predictive Studio experiment session.';
}
