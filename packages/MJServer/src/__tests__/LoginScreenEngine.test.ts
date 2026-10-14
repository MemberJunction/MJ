import { describe, it, expect, vi } from 'vitest';
import { DefaultLoginDesign } from '@memberjunction/theme-engine';

/**
 * `GetPublicLoginScreen` feeds an UNAUTHENTICATED endpoint: these assert what may not escape it (the
 * draft, an unsafe value) and the empty answer that keeps the stock login screen. The sanitizing itself
 * is tested in theme-engine; here, that the engine wires it up.
 */

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    public LoadedConfigs: unknown[] = [];
    protected async Load(configs: unknown[]): Promise<void> {
      this.LoadedConfigs = configs;
    }
    protected GetConfigData<T>(propertyName: string): T[] {
      return (this as unknown as Record<string, T[]>)[propertyName] ?? [];
    }
    public static getInstance<T>(this: new () => T): T {
      return new this();
    }
  },
  RegisterForStartup: () => (target: unknown) => target,
}));

import { LoginScreenEngine } from '../auth/LoginScreenEngine.js';

/** Minimal stand-in for a generated MJThemeEntity row. */
type Row = {
  Name: string;
  Seeds: string;
  LoginScreen: string | null;
  LoginScreenDraft: string | null;
  LightMarkURL: string | null;
  DarkMarkURL: string | null;
  WordmarkURL: string | null;
  MonochromeURL: string | null;
};

function engineWith(rows: Partial<Row>[]): LoginScreenEngine {
  const engine = new (LoginScreenEngine as unknown as new () => LoginScreenEngine)();
  const full: Row[] = rows.map((r) => ({
    Name: 'Acme', Seeds: '{"primary":"#0076b6"}', LoginScreen: null, LoginScreenDraft: null,
    LightMarkURL: null, DarkMarkURL: null, WordmarkURL: null, MonochromeURL: null, ...r,
  }));
  (engine as unknown as Record<string, Row[]>)['_defaultThemes'] = full;
  return engine;
}

describe('LoginScreenEngine', () => {
  it('loads the default Active theme, most recently changed first', async () => {
    const engine = engineWith([]);
    await engine.Config();
    expect((engine as unknown as { LoadedConfigs: unknown[] }).LoadedConfigs).toEqual([
      expect.objectContaining({ EntityName: 'MJ: Themes', Filter: `IsDefault = 1 AND Status = 'Active'`, OrderBy: '__mj_UpdatedAt DESC' }),
    ]);
  });

  it('serves the published design, logos and seeds, and never the draft', () => {
    const design = DefaultLoginDesign();
    const draft = JSON.stringify({ ...DefaultLoginDesign(), Heading: 'Secret launch page' });
    const result = engineWith([{ LoginScreen: JSON.stringify(design), LoginScreenDraft: draft, LightMarkURL: 'https://cdn.example.org/m.svg' }])
      .GetPublicLoginScreen();
    expect(result).toEqual({ ThemeName: 'Acme', Design: design, Seeds: { primary: '#0076b6' }, Logos: { lightMarkURL: 'https://cdn.example.org/m.svg' } });
    expect(JSON.stringify(result)).not.toContain('Secret launch page');
  });

  it('drops an unsafe design, seed and logo from a row edited outside the entity layer', () => {
    const tampered = DefaultLoginDesign();
    tampered.Regions.PanelBottom = [{ ID: 'b-x', Type: 'links', Links: [{ Label: 'Help', Href: 'javascript:alert(1)' }], Width: 'full', HideWhenStacked: false }];
    const result = engineWith([{
      LoginScreen: JSON.stringify(tampered),
      Seeds: JSON.stringify({ primary: '#0076b6', fontFamily: 'x;} body{background:url(https://evil/t)} a{' }),
      LightMarkURL: 'javascript:alert(1)',
    }]).GetPublicLoginScreen();
    expect(result.Design).toBeNull();
    expect(result.Seeds).toEqual({ primary: '#0076b6' });
    expect(result.Logos).toEqual({});
  });

  it('answers empty when there is no default theme', () => {
    expect(engineWith([]).GetPublicLoginScreen()).toEqual({ ThemeName: null, Design: null, Seeds: null, Logos: {} });
  });
});
