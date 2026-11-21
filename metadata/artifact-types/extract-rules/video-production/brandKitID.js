try {
  const spec = JSON.parse(content);
  const brandKitId = spec && typeof spec.BrandKitID === 'string'
    ? spec.BrandKitID.trim()
    : '';
  return brandKitId.length > 0 ? brandKitId : null;
} catch (_e) {
  return null;
}
