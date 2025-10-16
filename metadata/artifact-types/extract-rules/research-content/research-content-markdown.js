/**
 * Extracts the full research report in markdown format
 * Priority: report.markdown
 */
try {
  const data = JSON.parse(content);

  // Primary field: report.markdown
  if (data.report && data.report.markdown) {
    return data.report.markdown;
  }

  return null;
} catch (e) {
  return null;
}
