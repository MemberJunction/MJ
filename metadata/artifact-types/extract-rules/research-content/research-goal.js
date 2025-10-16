/**
 * Extracts the original research goal/request
 */
try {
  const data = JSON.parse(content);

  if (data.metadata && data.metadata.researchGoal) {
    return data.metadata.researchGoal;
  }

  return null;
} catch (e) {
  return null;
}
