import { describe, it, expect } from 'vitest';
import {
  STUDIO_SECTIONS,
  MODELS_SECTIONS,
  MODELS_NAV_LABEL,
  SectionGroups,
  SectionsInGroup,
  SectionLabel,
  SectionIcon,
  HasSection,
  RouteHomeNavigate,
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
    expect(SectionGroups(STUDIO_SECTIONS)).toEqual(['', 'Build', 'Run']);
    expect(SectionsInGroup(STUDIO_SECTIONS, '').map((s) => s.key)).toEqual(['home']);
    expect(SectionsInGroup(STUDIO_SECTIONS, 'Build').map((s) => s.key)).toEqual(['pipelines', 'catalog']);
    expect(SectionsInGroup(STUDIO_SECTIONS, 'Run').map((s) => s.key)).toEqual(['experiments', 'compare']);
  });

  it('Models is a single ungrouped list', () => {
    expect(SectionGroups(MODELS_SECTIONS)).toEqual(['']);
    expect(SectionsInGroup(MODELS_SECTIONS, '').map((s) => s.key)).toEqual(['registry', 'production']);
  });
});

describe('predictive-studio.nav — lookups (tolerant fallbacks)', () => {
  it('resolves known labels/icons and falls back without throwing for unknown keys', () => {
    expect(SectionLabel(STUDIO_SECTIONS, 'pipelines')).toBe('Training Pipelines');
    expect(SectionLabel(STUDIO_SECTIONS, 'home')).toBe('Overview');
    // unknown-to-this-door key falls back to the raw key, never throws
    expect(SectionLabel(STUDIO_SECTIONS, 'registry')).toBe('registry');
    expect(SectionIcon(STUDIO_SECTIONS, 'registry')).toMatch(/^fa-/);
  });

  it('hasSection scopes membership to the door', () => {
    expect(HasSection(STUDIO_SECTIONS, 'experiments')).toBe(true);
    expect(HasSection(STUDIO_SECTIONS, 'registry')).toBe(false);
    expect(HasSection(MODELS_SECTIONS, 'production')).toBe(true);
    expect(HasSection(MODELS_SECTIONS, 'home')).toBe(false);
  });
});

describe('predictive-studio.nav — routeHomeNavigate (cross-door Overview navigation)', () => {
  it('a Studio target switches the section in-place', () => {
    expect(RouteHomeNavigate('pipelines')).toEqual({ kind: 'section', key: 'pipelines' });
    expect(RouteHomeNavigate('catalog')).toEqual({ kind: 'section', key: 'catalog' });
    expect(RouteHomeNavigate('experiments')).toEqual({ kind: 'section', key: 'experiments' });
    expect(RouteHomeNavigate('compare')).toEqual({ kind: 'section', key: 'compare' });
  });

  it('a Models target crosses to the Models door, deep-linked to that section', () => {
    expect(RouteHomeNavigate('registry')).toEqual({ kind: 'app', navLabel: MODELS_NAV_LABEL, section: 'registry' });
    expect(RouteHomeNavigate('production')).toEqual({ kind: 'app', navLabel: MODELS_NAV_LABEL, section: 'production' });
  });

  it('navigating to home (the section we are already on) is a no-op', () => {
    expect(RouteHomeNavigate('home')).toEqual({ kind: 'none' });
  });
});
