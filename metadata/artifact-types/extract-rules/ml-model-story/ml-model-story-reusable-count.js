/**
 * How many components are marked HIGH reuse potential.
 *
 * This is the number that makes a story worth searching: it counts the parts of this model someone
 * building a different model would plausibly want.
 */
try {
  const data = JSON.parse(content);
  const components = data.Components || data.components;
  if (!Array.isArray(components)) {
    return 0;
  }
  return components.filter(function (c) {
    const contribution = c && (c.Contribution || c.contribution);
    const potential = contribution && (contribution.ReusePotential || contribution.reusePotential);
    return potential === 'high';
  }).length;
} catch (e) {
  return 0;
}
