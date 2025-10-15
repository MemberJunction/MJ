/**
 * Checks whether contradictory information was found during research
 */
try {
  const data = JSON.parse(content);

  if (data.contradictions && Array.isArray(data.contradictions)) {
    return data.contradictions.length > 0;
  }

  return false;
} catch (e) {
  return false;
}
