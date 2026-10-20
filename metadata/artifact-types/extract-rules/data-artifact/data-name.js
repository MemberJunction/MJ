/**
 * Extracts the name/title for Data artifacts (single-table and multi-table query/view specs)
 */
try {
  const data = JSON.parse(content);
  if (typeof data.title === 'string' && data.title.trim()) {
    return data.title.trim();
  }
  if (typeof data.name === 'string' && data.name.trim()) {
    return data.name.trim();
  }
  if (typeof data.savedQueryName === 'string' && data.savedQueryName.trim()) {
    return data.savedQueryName.trim();
  }
  if (typeof data.viewName === 'string' && data.viewName.trim()) {
    return data.viewName.trim();
  }
  return null;
} catch (e) {
  return null;
}
