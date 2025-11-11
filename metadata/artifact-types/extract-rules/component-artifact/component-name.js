/**
 * Extracts the name/title for interactive components
 */
try {
  const data = JSON.parse(content);

  // First priority: report.name
  if (data.title || data.name) {
    return data.title || data.name;
  }

  return 'Interactive Component';
} catch (e) {
  return 'Interactive Component';
}
