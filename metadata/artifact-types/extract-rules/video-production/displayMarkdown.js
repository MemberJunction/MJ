try {
  const spec = JSON.parse(content);
  if (!spec || typeof spec !== 'object') {
    return null;
  }

  const oneSentence = spec.Film && typeof spec.Film.OneSentence === 'string' && spec.Film.OneSentence.trim().length > 0
    ? spec.Film.OneSentence.trim()
    : 'Video Production';
  const archetype = spec.Archetype && typeof spec.Archetype.Name === 'string' && spec.Archetype.Name.trim().length > 0
    ? spec.Archetype.Name.trim()
    : 'Unspecified';
  const duration = spec.Film && typeof spec.Film.DurationSeconds === 'number' && Number.isFinite(spec.Film.DurationSeconds)
    ? spec.Film.DurationSeconds + 's'
    : 'Unspecified';
  const formats = spec.Film && Array.isArray(spec.Film.Formats) && spec.Film.Formats.length > 0
    ? spec.Film.Formats.join(', ')
    : 'Unspecified';
  const status = typeof spec.Status === 'string' && spec.Status.trim().length > 0
    ? spec.Status.trim()
    : 'Unspecified';

  const lines = [
    '# ' + oneSentence,
    '',
    '- **Archetype:** ' + archetype,
    '- **Duration:** ' + duration,
    '- **Formats:** ' + formats,
    '- **Status:** ' + status
  ];

  const asOf = spec.DataSnapshot && typeof spec.DataSnapshot.AsOf === 'string'
    ? spec.DataSnapshot.AsOf.trim()
    : '';
  if (asOf.length > 0) {
    lines.push('- Data as of ' + asOf);
  }

  const approved = spec.Assets && Array.isArray(spec.Assets.Approved)
    ? spec.Assets.Approved
    : [];
  const generatedCount = approved.filter(function (asset) {
    return asset && asset.Provenance === 'Generated';
  }).length;
  if (generatedCount > 0) {
    lines.push('- Contains AI-generated assets: ' + generatedCount);
  }

  return lines.join('\n');
} catch (_e) {
  return null;
}
