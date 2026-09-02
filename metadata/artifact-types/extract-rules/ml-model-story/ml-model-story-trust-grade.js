/**
 * The deterministic trust grade the story was written AGAINST.
 *
 * Given to the tagger rather than chosen by it, so it is a measured verdict and not a claim the
 * prose makes about itself. Only the four known grades are returned — anything else is dropped
 * rather than surfaced as if it were a real grade.
 */
try {
  const data = JSON.parse(content);
  const grade = data.TrustGrade || data.trustGrade;

  if (typeof grade === 'string' && ['Poor', 'Fair', 'Good', 'Excellent'].indexOf(grade) >= 0) {
    return grade;
  }
  return null;
} catch (e) {
  return null;
}
