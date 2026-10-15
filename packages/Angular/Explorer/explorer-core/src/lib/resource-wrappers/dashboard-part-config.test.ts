import { describe, it, expect } from 'vitest';
import type { PanelConfig } from '@memberjunction/ng-dashboard-viewer';
import { ValidatePartConfig, MergePartConfig, DescribePartConfigs, type DashboardPartTypeName } from './dashboard-part-config';

describe('ValidatePartConfig', () => {
  it('accepts a View with an entity name and sets type', () => {
    expect(ValidatePartConfig('View', { entityName: 'MJ: Users', displayMode: 'cards' })).toEqual({
      ok: true,
      config: { type: 'View', entityName: 'MJ: Users', displayMode: 'cards' },
    });
  });
  it('rejects a View with neither viewId nor entityName', () => {
    const r = ValidatePartConfig('View', { displayMode: 'grid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('viewId');
  });
  it('rejects an unknown key and lists the allowed ones', () => {
    const r = ValidatePartConfig('Query', { queryId: 'q1', colour: 'red' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('autoRefreshSeconds');
  });
  it('requires an http(s) url for WebURL', () => {
    expect(ValidatePartConfig('WebURL', { url: 'ftp://x' }).ok).toBe(false);
    expect(ValidatePartConfig('WebURL', { url: 'https://example.com' }).ok).toBe(true);
  });
  it('requires artifactId for Artifact', () => {
    expect(ValidatePartConfig('Artifact', { versionNumber: 2 }).ok).toBe(false);
  });
  it('rejects a non-object', () => expect(ValidatePartConfig('View', 'nope').ok).toBe(false));

  it('rejects null and arrays', () => {
    expect(ValidatePartConfig('View', null).ok).toBe(false);
    expect(ValidatePartConfig('View', [{ entityName: 'MJ: Users' }]).ok).toBe(false);
  });
  it('rejects a part type name it has no rule for, including names every object inherits', () => {
    // The tools cast a part type read from metadata or a stored config, so any string can arrive here.
    for (const name of ['Chart', 'constructor', '__proto__', 'toString']) {
      const r = ValidatePartConfig(name as DashboardPartTypeName, { url: 'https://example.com' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('Unknown part type');
    }
  });
  it('replaces a type key in the input with the part type and leaves the input as it was', () => {
    const raw = { type: 'View', queryId: 'q1' };
    expect(ValidatePartConfig('Query', raw)).toEqual({ ok: true, config: { type: 'Query', queryId: 'q1' } });
    expect(raw).toEqual({ type: 'View', queryId: 'q1' });
  });
  it('treats a blank required key as missing', () => {
    const r = ValidatePartConfig('View', { entityName: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('needs viewId or entityName');
  });
  it('accepts each config as its config panel writes it, unset fields included', () => {
    const written: Array<[DashboardPartTypeName, Record<string, unknown>]> = [
      [
        'View',
        {
          type: 'View',
          entityName: undefined,
          viewId: 'v1',
          extraFilter: undefined,
          displayMode: 'map',
          mapRenderMode: 'heatmap',
          allowModeSwitch: true,
          enableSelection: false,
          selectionMode: 'none',
        },
      ],
      [
        'Query',
        {
          type: 'Query',
          queryId: 'q1',
          queryName: undefined,
          showParameterControls: true,
          parameterLayout: 'sidebar',
          autoRefreshSeconds: 300,
          showExecutionMetadata: false,
        },
      ],
      [
        'Artifact',
        { type: 'Artifact', artifactId: 'a1', versionNumber: undefined, showHeader: false, showTabs: true, showVersionSelector: true, showMetadata: false },
      ],
      ['WebURL', { type: 'WebURL', url: 'http://example.com/page', sandboxMode: 'strict', allowFullscreen: false, refreshOnResize: true }],
    ];
    for (const [partType, config] of written) expect(ValidatePartConfig(partType, config)).toEqual({ ok: true, config });
  });
  it('trims ids, names and URLs as the config panels do, and leaves the input as it was', () => {
    const raw = { viewId: ' v1 ', entityName: '\tMJ: Users\n' };
    expect(ValidatePartConfig('View', raw)).toEqual({ ok: true, config: { type: 'View', viewId: 'v1', entityName: 'MJ: Users' } });
    expect(raw).toEqual({ viewId: ' v1 ', entityName: '\tMJ: Users\n' });
    expect(ValidatePartConfig('Query', { queryId: ' q1 ', queryName: ' Top ' })).toEqual({
      ok: true,
      config: { type: 'Query', queryId: 'q1', queryName: 'Top' },
    });
    expect(ValidatePartConfig('Artifact', { artifactId: ' a1 ' })).toEqual({ ok: true, config: { type: 'Artifact', artifactId: 'a1' } });
    expect(ValidatePartConfig('WebURL', { url: '  https://example.com/report  ' })).toEqual({
      ok: true,
      config: { type: 'WebURL', url: 'https://example.com/report' },
    });
  });
  it('rejects a blank id next to a set one', () => {
    // The View part loads by viewId first, so a blank viewId would hide the entity name.
    const r = ValidatePartConfig('View', { viewId: '  ', entityName: 'MJ: Users' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('View config: viewId must be a non-blank string.');
  });
  it('checks url the way the WebURL config panel does', () => {
    expect(ValidatePartConfig('WebURL', { url: 'HTTPS://Example.com/report' }).ok).toBe(true);
    expect(ValidatePartConfig('WebURL', { url: 'https://' }).ok).toBe(false);
    expect(ValidatePartConfig('WebURL', { url: 'javascript:alert(1)' }).ok).toBe(false);
  });
  it('lets an optional key be null', () => {
    expect(ValidatePartConfig('Artifact', { artifactId: 'a1', versionNumber: null }).ok).toBe(true);
  });
  it('rejects a value of the wrong type and names the key', () => {
    const r = ValidatePartConfig('Artifact', { artifactId: 'a1', showHeader: 'yes' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Artifact config: showHeader must be true or false.');
    expect(ValidatePartConfig('View', { viewId: 42 }).ok).toBe(false);
  });
  it('rejects a choice the config panel does not offer and lists the choices', () => {
    const r = ValidatePartConfig('View', { entityName: 'MJ: Users', displayMode: 'table' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('grid, cards, timeline, map');
    expect(ValidatePartConfig('WebURL', { url: 'https://example.com', sandboxMode: 'none' }).ok).toBe(false);
  });
  it('accepts only the auto refresh intervals the Query config panel offers', () => {
    expect(ValidatePartConfig('Query', { queryId: 'q1', autoRefreshSeconds: 0 }).ok).toBe(true);
    expect(ValidatePartConfig('Query', { queryId: 'q1', autoRefreshSeconds: 1 }).ok).toBe(false);
    expect(ValidatePartConfig('Query', { queryId: 'q1', autoRefreshSeconds: '60' }).ok).toBe(false);
  });
  it('requires a whole version number above 0', () => {
    expect(ValidatePartConfig('Artifact', { artifactId: 'a1', versionNumber: 3 }).ok).toBe(true);
    expect(ValidatePartConfig('Artifact', { artifactId: 'a1', versionNumber: 0 }).ok).toBe(false);
    expect(ValidatePartConfig('Artifact', { artifactId: 'a1', versionNumber: 1.5 }).ok).toBe(false);
  });
});

describe('MergePartConfig', () => {
  it('overlays the patch and keeps type', () => {
    expect(MergePartConfig({ type: 'Query', queryId: 'q1', autoRefreshSeconds: 30 }, { autoRefreshSeconds: 60, type: 'View' })).toEqual({
      type: 'Query',
      queryId: 'q1',
      autoRefreshSeconds: 60,
    });
  });
  it('leaves both inputs as they were', () => {
    const current: PanelConfig = { type: 'Query', queryId: 'q1' };
    const patch = { queryId: 'q2' };
    MergePartConfig(current, patch);
    expect(current).toEqual({ type: 'Query', queryId: 'q1' });
    expect(patch).toEqual({ queryId: 'q2' });
  });
});

describe('DescribePartConfigs', () => {
  it('names every part type', () => {
    const text = DescribePartConfigs();
    for (const name of ['View', 'Query', 'Artifact', 'WebURL']) expect(text).toContain(name);
  });
  it('names the required keys and the fixed choices, with no closing period', () => {
    const text = DescribePartConfigs();
    expect(text).toContain('View: needs viewId or entityName; optional extraFilter, displayMode (grid|cards|timeline|map)');
    expect(text).toContain('autoRefreshSeconds (0|30|60|300|600)');
    expect(text).toContain('WebURL: needs url (http:// or https://)');
    expect(text.endsWith('.')).toBe(false);
  });
});
