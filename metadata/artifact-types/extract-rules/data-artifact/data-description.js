/**
 * Extracts the description/summary for Data artifacts
 */
try {
  const data = JSON.parse(content);
  if (typeof data.description === 'string' && data.description.trim()) {
    return data.description.trim();
  }
  if (typeof data.interpretation === 'string' && data.interpretation.trim()) {
    return data.interpretation.trim();
  }
  return null;
} catch (e) {
  return null;
}
