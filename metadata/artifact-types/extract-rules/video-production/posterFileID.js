try {
  const spec = JSON.parse(content);
  const posterFileId = spec && spec.Output && typeof spec.Output.PosterFileID === 'string'
    ? spec.Output.PosterFileID.trim()
    : '';
  return posterFileId.length > 0 && !posterFileId.startsWith('inline:') ? posterFileId : null;
} catch (_e) {
  return null;
}

