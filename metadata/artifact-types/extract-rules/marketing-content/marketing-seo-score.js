/**
 * Extracts the SEO optimization score for marketing content artifacts
 * Returns a number between 0-100
 */
try {
  const data = JSON.parse(content);

  // Extract from seo.optimizationScore
  if (data.seo && typeof data.seo.optimizationScore === 'number') {
    return data.seo.optimizationScore;
  }

  return null;
} catch (e) {
  return null;
}
