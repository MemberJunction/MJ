/**
 * Renders an ML Model Story as markdown — this IS the viewer until an Angular plugin ships.
 *
 * Order is deliberate and matches how someone actually evaluates a model: what it decides, what the
 * data says, why it matters, what each part contributes (and when that part is worth reusing), and
 * finally what NOT to conclude. Caveats come last so they are the thing left in mind, and they are
 * never omitted — a story without its limits is marketing.
 *
 * Anything absent is skipped rather than rendered as an empty heading, so a partial story reads as
 * a shorter story instead of a broken one.
 */
try {
  const data = JSON.parse(content);
  const get = function (a, b) {
    const v = data[a] !== undefined ? data[a] : data[b];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };

  const out = [];
  const headline = get('Headline', 'headline');
  if (headline) {
    out.push('# ' + headline);
  }

  const grade = data.TrustGrade || data.trustGrade;
  if (typeof grade === 'string' && grade.trim()) {
    // Stated up front: it frames how much weight the rest of the prose deserves.
    out.push('**Trust grade: ' + grade.trim() + '**');
  }

  const story = get('Story', 'story');
  if (story) {
    out.push('## What it decides\n\n' + story);
  }

  const dataStory = get('DataStory', 'dataStory');
  if (dataStory) {
    out.push('## What the data says\n\n' + dataStory);
  }

  const business = get('BusinessConnection', 'businessConnection');
  if (business) {
    out.push('## Why it matters\n\n' + business);
  }

  const components = data.Components || data.components;
  if (Array.isArray(components) && components.length > 0) {
    const parts = ['## What it is made of'];
    for (let i = 0; i < components.length; i++) {
      const c = components[i] || {};
      const cHead = c.Headline || c.headline || 'Component ' + (i + 1);
      const cStory = c.Story || c.story;
      const contribution = c.Contribution || c.contribution || {};
      const role = contribution.Role || contribution.role;
      const weight = contribution.Weight !== undefined ? contribution.Weight : contribution.weight;
      const evidence = contribution.Evidence || contribution.evidence;
      const potential = contribution.ReusePotential || contribution.reusePotential;
      const reuseWhen = contribution.ReuseWhen || contribution.reuseWhen;

      parts.push('### ' + cHead);
      if (cStory) {
        parts.push(cStory);
      }

      // The role line carries the measured facts together, so the claim and its evidence are
      // never separated — a role without its evidence is just an assertion.
      const facts = [];
      if (role) {
        facts.push('**Role:** ' + role);
      }
      if (typeof weight === 'number' && isFinite(weight)) {
        facts.push('**Share:** ' + Math.round(weight * 100) + '%');
      }
      if (evidence) {
        facts.push('**Evidence:** ' + evidence);
      }
      if (facts.length > 0) {
        parts.push(facts.join(' · '));
      }

      if (potential || reuseWhen) {
        const label = potential ? potential + ' reuse potential' : 'Reuse';
        parts.push('> **' + label + '.** ' + (reuseWhen || ''));
      }
    }
    out.push(parts.join('\n\n'));
  }

  const caveats = data.Caveats || data.caveats;
  if (Array.isArray(caveats) && caveats.length > 0) {
    const lines = ['## What not to conclude'];
    for (let i = 0; i < caveats.length; i++) {
      if (typeof caveats[i] === 'string' && caveats[i].trim()) {
        lines.push('- ' + caveats[i].trim());
      }
    }
    out.push(lines.join('\n'));
  }

  return out.length > 0 ? out.join('\n\n') : null;
} catch (e) {
  return null;
}
