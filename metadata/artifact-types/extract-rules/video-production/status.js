try {
  const spec = JSON.parse(content);
  const status = spec && typeof spec.Status === 'string'
    ? spec.Status.trim()
    : '';
  return status.length > 0 ? status : null;
} catch (_e) {
  return null;
}
