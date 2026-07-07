/**
 * Extracts the full experiment results report in markdown.
 *
 * The canonical artifact shape is the Core `ModelingPlanSpec` (PascalCase):
 * a `Markdown` narrative authored by the agent's report phase. Priority:
 * Markdown > (lowercase / report fallbacks).
 */
try {
  const data = JSON.parse(content);

  if (typeof data.Markdown === 'string' && data.Markdown.trim()) {
    return data.Markdown;
  }

  // Fallbacks (older / LLM-authored lowercase + report shapes).
  if (data.report && data.report.markdown) {
    return data.report.markdown;
  }
  if (typeof data.markdown === 'string' && data.markdown.trim()) {
    return data.markdown;
  }

  return null;
} catch (e) {
  return null;
}
