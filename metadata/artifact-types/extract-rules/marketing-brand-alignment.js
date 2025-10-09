/**
 * Extracts the brand alignment score for marketing content artifacts
 * Returns a number between 0-100
 */
(function(content) {
  try {
    const data = JSON.parse(content);

    // Extract from brand.alignmentScore
    if (data.brand && typeof data.brand.alignmentScore === 'number') {
      return data.brand.alignmentScore;
    }

    return null;
  } catch (e) {
    return null;
  }
})(content);
