try {
  const spec = JSON.parse(content);
  const purpose = spec && spec.Film && typeof spec.Film.Purpose === 'string'
    ? spec.Film.Purpose.trim()
    : '';
  return purpose.length > 0 ? purpose : null;
} catch (_e) {
  return null;
}
