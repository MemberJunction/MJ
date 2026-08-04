/**
 * Extracts the name/title for ML Experiment Results artifacts.
 *
 * The canonical artifact shape is the Core `ModelingPlanSpec` (PascalCase):
 * `Goal` carries the business objective. Priority:
 * Name > Goal (truncated) > (lowercase / report fallbacks) > default.
 */
try {
  const data = JSON.parse(content);

  if (typeof data.Name === 'string' && data.Name.trim()) {
    return data.Name;
  }

  if (typeof data.Goal === 'string' && data.Goal.trim()) {
    return data.Goal.length > 100 ? data.Goal.substring(0, 100) + '...' : data.Goal;
  }

  // Fallbacks (older / LLM-authored lowercase + report shapes).
  if (data.report && data.report.name) {
    return data.report.name;
  }
  if (typeof data.goal === 'string' && data.goal.trim()) {
    return data.goal.length > 100 ? data.goal.substring(0, 100) + '...' : data.goal;
  }

  return 'ML Experiment Results';
} catch (e) {
  return 'ML Experiment Results';
}
