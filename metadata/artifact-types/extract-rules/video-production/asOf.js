try {
  const spec = JSON.parse(content);
  const asOf = spec && spec.DataSnapshot && typeof spec.DataSnapshot.AsOf === 'string'
    ? spec.DataSnapshot.AsOf.trim()
    : '';
  return asOf.length > 0 ? asOf : null;
} catch (_e) {
  return null;
}
