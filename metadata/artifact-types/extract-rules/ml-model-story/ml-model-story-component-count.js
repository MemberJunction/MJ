/** How many components this story describes. */
try {
  const data = JSON.parse(content);
  const components = data.Components || data.components;
  return Array.isArray(components) ? components.length : 0;
} catch (e) {
  return 0;
}
