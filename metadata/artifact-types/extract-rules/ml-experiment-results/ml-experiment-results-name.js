/**
 * Extracts the name/title for ML Experiment Results artifacts.
 * Priority: report.name > goal (truncated) > default
 */
try {
  const data = JSON.parse(content);

  if (data.report && data.report.name) {
    return data.report.name;
  }

  if (data.goal) {
    return data.goal.length > 100 ? data.goal.substring(0, 100) + '...' : data.goal;
  }

  return 'ML Experiment Results';
} catch (e) {
  return 'ML Experiment Results';
}
