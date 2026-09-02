/**
 * Extracts the name for an ML Model Story artifact.
 *
 * The canonical shape is the Core `ModelStory` (PascalCase): `Headline` is written to be the one
 * line a business user would recognize, so it IS the name. Falls back through the prose before
 * giving up, because an untitled story in a list is unfindable.
 */
try {
  const data = JSON.parse(content);

  if (typeof data.Headline === 'string' && data.Headline.trim()) {
    return data.Headline.trim();
  }
  if (typeof data.Story === 'string' && data.Story.trim()) {
    const first = data.Story.trim().split(/(?<=[.!?])\s/)[0];
    return first.length > 100 ? first.substring(0, 100) + '...' : first;
  }
  // Lowercase fallback for an LLM-authored shape that skipped the schema.
  if (typeof data.headline === 'string' && data.headline.trim()) {
    return data.headline.trim();
  }

  return 'ML Model Story';
} catch (e) {
  return 'ML Model Story';
}
