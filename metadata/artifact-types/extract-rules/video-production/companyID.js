try {
  const spec = JSON.parse(content);
  const companyId = spec && typeof spec.CompanyID === 'string'
    ? spec.CompanyID.trim()
    : '';
  return companyId.length > 0 ? companyId : null;
} catch (_e) {
  return null;
}
