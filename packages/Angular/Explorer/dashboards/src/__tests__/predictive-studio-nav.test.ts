import { describe, it, expect } from 'vitest';
import {
  STUDIO_SECTIONS,
  MODELS_SECTIONS,
  MODELS_NAV_LABEL,
  sectionGroups,
  sectionsInGroup,
  sectionLabel,
  sectionIcon,
  hasSection,
  routeHomeNavigate,
} from '../PredictiveStudio/predictive-studio.nav';

describe('predictive-studio.nav — door section descriptors', () => {
  it('Studio hosts the build/run sections; Models hosts the lifecycle sections (no overlap, no Predictions)', () => {
    const studio = STUDIO_SECTIONS.map((s) => s.key);
    const models = MODELS_SECTIONS.map((s) => s.key);
    expect(studio).toEqual(['home', 'pipelines', 'catalog', 'experiments', 'compare']);
    expect(models).toEqual(['registry', 'production']);
    // disjoint — a section lives in exactly one door
    expect(studio.filter((k) => models.includes(k))).toEqual([]);
  });

  it('every section has a non-empty label + icon', () => {
    for (const s of [...STUDIO_SECTIONS, ...MODELS_SECTIONS]) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon).toMatch(/^fa-/);
    }
  });

  it('groups Studio as ungrouped Overview, then Build, then Run (first-seen order)', () => {
    expect(sectionGroups(STUDIO_SECTIONS)).toEqual(['', 'Build', 'Run']);
    expect(sectionsInGroup(STUDIO_SECTIONS, '').map((s) => s.key)).toEqual(['home']);
    expect(sectionsInGroup(STUDIO_SECTIONS, 'Build').map((s) => s.key)).toEqual(['pipelines', 'catalog']);
    expect(sectionsInGroup(STUDIO_SECTIONS, 'Run').map((s) => s.key)).toEqual(['experiments', 'compare']);
  });

  it('Models is a single ungrouped list', () => {
    expect(sectionGroups(MODELS_SECTIONS)).toEqual(['']);
    expect(sectionsInGroup(MODELS_SECTIONS, '').map((s) => s.key)).toEqual(['registry', 'production']);
  });
});

describe('predictive-studio.nav — lookups (tolerant fallbacks)', () => {
  it('resolves known labels/icons and falls back without throwing for unknown keys', () => {
    expect(sectionLabel(STUDIO_SECTIONS, 'pipelines')).toBe('Training Pipelines');
    expect(sectionLabel(STUDIO_SECTIONS, 'home')).toBe('Overview');
    // unknown-to-this-door key falls back to the raw key, never throws
    expect(sectionLabel(STUDIO_SECTIONS, 'registry')).toBe('registry');
    expect(sectionIcon(STUDIO_SECTIONS, 'registry')).toMatch(/^fa-/);
  });

  it('hasSection scopes membership to the door', () => {
    expect(hasSection(STUDIO_SECTIONS, 'experiments')).toBe(true);
    expect(hasSection(STUDIO_SECTIONS, 'registry')).toBe(false);
    expect(hasSection(MODELS_SECTIONS, 'production')).toBe(true);
    expect(hasSection(MODELS_SECTIONS, 'home')).toBe(false);
  });
});

describe('predictive-studio.nav — routeHomeNavigate (cross-door Overview navigation)', () => {
  it('a Studio target switches the section in-place', () => {
    expect(routeHomeNavigate('pipelines')).toEqual({ kind: 'section', key: 'pipelines' });
    expect(routeHomeNavigate('catalog')).toEqual({ kind: 'section', key: 'catalog' });
    expect(routeHomeNavigate('experiments')).toEqual({ kind: 'section', key: 'experiments' });
    expect(routeHomeNavigate('compare')).toEqual({ kind: 'section', key: 'compare' });
  });

  it('a Models target crosses to the Models door, deep-linked to that section', () => {
    expect(routeHomeNavigate('registry')).toEqual({ kind: 'app', navLabel: MODELS_NAV_LABEL, section: 'registry' });
    expect(routeHomeNavigate('production')).toEqual({ kind: 'app', navLabel: MODELS_NAV_LABEL, section: 'production' });
  });

  it('navigating to home (the section we are already on) is a no-op', () => {
    expect(routeHomeNavigate('home')).toEqual({ kind: 'none' });
  });
});
