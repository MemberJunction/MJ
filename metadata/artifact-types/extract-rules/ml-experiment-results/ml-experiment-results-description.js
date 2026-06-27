/**
 * Extracts a short description/summary for ML Experiment Results artifacts.
 * Priority: report.summary > goal > default
 */
try {
  const data = JSON.parse(content);

  if (data.report && data.report.summary) {
    return data.report.summary;
  }

  if (data.goal) {
    return data.goal;
  }

  return 'Results of a Predictive Studio experiment session.';
} catch (e) {
  return 'Results of a Predictive Studio experiment session.';
}
