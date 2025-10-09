/**
 * Extracts the content type for marketing content artifacts
 * Returns the type of marketing content (blog_post, social_media, email, etc.)
 */
try {
  const data = JSON.parse(content);

  // Extract from metadata.contentType
  if (data.metadata && data.metadata.contentType) {
    return data.metadata.contentType;
  }

  return null;
} catch (e) {
  return null;
}
