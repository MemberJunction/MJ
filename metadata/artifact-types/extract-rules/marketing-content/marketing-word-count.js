/**
 * Extracts the word count for marketing content artifacts
 * Returns the total word count of the content
 */
try {
  const data = JSON.parse(content);

  // Extract from copywriter.wordCount
  if (data.copywriter && typeof data.copywriter.wordCount === 'number') {
    return data.copywriter.wordCount;
  }

  return null;
} catch (e) {
  return null;
}
