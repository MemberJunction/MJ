try {
  const spec = JSON.parse(content);
  const archetypeName = spec && spec.Archetype && typeof spec.Archetype.Name === 'string'
    ? spec.Archetype.Name.trim()
    : '';
  return archetypeName.length > 0 ? archetypeName : null;
} catch (_e) {
  return null;
}
