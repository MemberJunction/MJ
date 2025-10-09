/**
 * Extracts the name/title for marketing content artifacts
 * Priority: content.headline > seo.metaTitle > metadata.originalBrief (truncated)
 */
try {
  const data = JSON.parse(content);

  // First priority: content.headline
  if (data.content && data.content.headline) {
    return data.content.headline;
  }

  // Second priority: seo.metaTitle
  if (data.seo && data.seo.metaTitle) {
    return data.seo.metaTitle;
  }

  // Fallback: metadata.originalBrief (truncated to reasonable length)
  if (data.metadata && data.metadata.originalBrief) {
    const brief = data.metadata.originalBrief;
    return brief.length > 100 ? brief.substring(0, 100) + '...' : brief;
  }

  return null;
} catch (e) {
  return null;
}
