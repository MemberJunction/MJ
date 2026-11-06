try {
  const spec = JSON.parse(content);
  const duration = spec && spec.Film ? spec.Film.DurationSeconds : undefined;
  return typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
} catch (_e) {
  return null;
}
