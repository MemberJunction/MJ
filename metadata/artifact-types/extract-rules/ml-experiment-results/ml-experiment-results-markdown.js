/**
 * Extracts the full experiment results report in markdown.
 * Priority: report.markdown (authored by the agent's report phase)
 */
try {
  const data = JSON.parse(content);

  if (data.report && data.report.markdown) {
    return data.report.markdown;
  }

  return null;
} catch (e) {
  return null;
}
