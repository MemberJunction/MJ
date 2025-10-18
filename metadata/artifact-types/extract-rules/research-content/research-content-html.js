/**
 * Extracts the full research report in HTML format
 * Priority: report.html
 */
try {
  const data = JSON.parse(content);

  // Primary field: report.html
  if (data.report && data.report.html) {
    return data.report.html;
  }

  return null;
} catch (e) {
  return null;
}
