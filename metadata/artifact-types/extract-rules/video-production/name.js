try {
  const spec = JSON.parse(content);
  const oneSentence = spec && spec.Film && typeof spec.Film.OneSentence === 'string'
    ? spec.Film.OneSentence.trim()
    : '';
  if (oneSentence.length > 0) {
    return oneSentence.slice(0, 100);
  }
  const archetypeName = spec && spec.Archetype && typeof spec.Archetype.Name === 'string'
    ? spec.Archetype.Name.trim()
    : '';
  if (archetypeName.length > 0) {
    return archetypeName;
  }
  return 'Video Production';
} catch (_e) {
  return 'Video Production';
}
