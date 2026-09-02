/**
 * Extracts a short description for an ML Model Story artifact.
 *
 * `BusinessConnection` says why the model matters and what someone would do differently — a better
 * one-line summary than the mechanical `Story`, which explains how it decides.
 */
try {
  const data = JSON.parse(content);
  const pick = data.BusinessConnection || data.Story || data.businessConnection || data.story;

  if (typeof pick === 'string' && pick.trim()) {
    const text = pick.trim();
    return text.length > 300 ? text.substring(0, 300) + '...' : text;
  }
  return null;
} catch (e) {
  return null;
}
