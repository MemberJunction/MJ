/**
 * Extracts the target audience for marketing content artifacts
 */
try {
  const data = JSON.parse(content);

  // Extract from metadata.targetAudience
  if (data.metadata && data.metadata.targetAudience) {
    return data.metadata.targetAudience;
  }

  return null;
} catch (e) {
  return null;
}
