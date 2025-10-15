/**
 * Extracts the total number of sources consulted
 */
try {
  const data = JSON.parse(content);

  if (data.sources && Array.isArray(data.sources)) {
    return data.sources.length;
  }

  return 0;
} catch (e) {
  return 0;
}
