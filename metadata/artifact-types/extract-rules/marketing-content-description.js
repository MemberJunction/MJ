/**
 * Extracts the description/subheadline for marketing content artifacts
 * Priority: content.subheadline > metadata.originalBrief
 */
(function(content) {
  try {
    const data = JSON.parse(content);

    // First priority: content.subheadline
    if (data.content && data.content.subheadline) {
      return data.content.subheadline;
    }

    // Fallback: metadata.originalBrief
    if (data.metadata && data.metadata.originalBrief) {
      return data.metadata.originalBrief;
    }

    return null;
  } catch (e) {
    return null;
  }
})(content);
