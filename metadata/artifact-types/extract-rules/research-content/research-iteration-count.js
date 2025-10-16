/**
 * Extracts the number of research iterations performed
 */
try {
  const data = JSON.parse(content);

  if (data.metadata && typeof data.metadata.currentIteration === 'number') {
    return data.metadata.currentIteration;
  }

  return 0;
} catch (e) {
  return 0;
}
