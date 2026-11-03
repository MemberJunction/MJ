try {
  const spec = JSON.parse(content);
  const formats = spec && spec.Film && Array.isArray(spec.Film.Formats)
    ? spec.Film.Formats.filter(function (f) { return typeof f === 'string' && f.trim().length > 0; })
    : [];
  return formats;
} catch (_e) {
  return [];
}
