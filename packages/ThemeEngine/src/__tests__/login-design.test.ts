import { describe, expect, it } from 'vitest';
import {
  DefaultLoginDesign, LOGIN_BLOCK_TYPES, LOGIN_REGIONS, LoginBlock, LoginContrastWarnings, LoginDesign, LoginDesignProblems,
  LoginDesignTokens, LoginLogoURL, LoginThemeTokens, NewLoginBlock, NormalizeLoginDesign, ParseLoginDesign, PublicLoginLogos,
  PublicLoginScreenFromTheme, SanitizePublicLoginScreen, StartingLoginColor, StoredLoginDesignProblems,
} from '../login-design.js';

/** A fresh default design with one change applied. */
const design = (fn: (d: LoginDesign) => void = () => {}): LoginDesign => {
  const d = DefaultLoginDesign();
  fn(d);
  return d;
};
/** The same, as a loose record, for writing values the types would not allow. */
const raw = (fn: (d: Record<string, unknown>) => void): string => {
  const d = DefaultLoginDesign() as unknown as Record<string, unknown>;
  fn(d);
  return JSON.stringify(d);
};
const stored = (d: LoginDesign): string[] => StoredLoginDesignProblems(JSON.stringify(d));

/** A block of each type, filled in so it may be saved. */
function completeBlock(type: (typeof LOGIN_BLOCK_TYPES)[number]): LoginBlock {
  const b = NewLoginBlock(type);
  if (b.Type === 'links') b.Links = [{ Label: 'Privacy', Href: 'https://example.org/privacy' }];
  if (b.Type === 'image') { b.URL = 'https://cdn.example.org/a.png'; b.Alt = 'Our campus'; }
  if (b.Type === 'card') b.Href = 'mailto:help@example.org';
  return b;
}

describe('a stored design', () => {
  it('the default design may be saved and reads back unchanged', () => {
    const d = DefaultLoginDesign();
    expect(stored(d)).toEqual([]);
    expect(JSON.stringify(ParseLoginDesign(JSON.stringify(d)))).toBe(JSON.stringify(d));
  });

  it.each(LOGIN_BLOCK_TYPES)('a completed %s block may be saved in every region', (type) => {
    for (const r of LOGIN_REGIONS) {
      expect(stored(design((d) => { d.Regions[r] = [completeBlock(type)]; }))).toEqual([]);
    }
  });

  it('NULL or blank means "no design" and is always fine', () => {
    expect(StoredLoginDesignProblems(null)).toEqual([]);
    expect(StoredLoginDesignProblems('  ')).toEqual([]);
  });

  it('every design the normalizer produces from junk may be saved, or is reported for its content only', () => {
    const junk: unknown[] = [null, 1, 'x', [], {}, { Version: 1 }, { Version: 1, Regions: { Banner: [{ Type: 'logo' }, 7, { Type: 'nope' }] } }];
    for (const j of junk) {
      const n = NormalizeLoginDesign(j);
      if (n) expect(StoredLoginDesignProblems(JSON.stringify(n)).every((p) => !p.includes('cannot use'))).toBe(true);
    }
  });
});

describe('what the server refuses', () => {
  const hostile: Array<[string, string]> = [
    ['an unknown top-level field', raw((d) => { d['Script'] = 'x'; })],
    ['another version', raw((d) => { d['Version'] = 2; })],
    ['an unknown layout', raw((d) => { d['Layout'] = 'sideways'; })],
    ['a color that breaks out of its declaration', raw((d) => { d['Background'] = { Kind: 'color', Color: '#fff;}', Color2: null, ImageURL: null, Overlay: 40 }; })],
    ['a background image over http', raw((d) => { d['Background'] = { Kind: 'image', Color: null, Color2: null, ImageURL: 'http://x.org/a.jpg', Overlay: 40 }; })],
    ['an overlay out of range', raw((d) => { (d['Background'] as Record<string, unknown>)['Overlay'] = 200; })],
    ['a fractional overlay', raw((d) => { (d['Background'] as Record<string, unknown>)['Overlay'] = 40.5; })],
    ['a color that is not #rrggbb', raw((d) => { d['Colors'] = { PanelBg: 'red;}body{display:none' }; })],
    ['a #rrggbb color with CSS after it', raw((d) => { d['Colors'] = { PanelBg: '#ffffff;}body{display:none' }; })],
    ['a #rrggbb color with CSS before it', raw((d) => { d['Colors'] = { PanelBg: 'red;}a{color:#ffffff' }; })],
    ['a color token the page does not have', raw((d) => { d['Colors'] = { ButtonBg: '#ffffff' }; })],
    ['an unknown card radius', raw((d) => { d['CardRadius'] = 'huge'; })],
    ['a missing field', raw((d) => { delete d['BannerShare']; })],
    ['an unknown region', raw((d) => { (d['Regions'] as Record<string, unknown>)['Footer'] = []; })],
    ['an unknown block type', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ID: 'b-1', Type: 'script', Width: 'full', HideWhenStacked: false }]; })],
    ['a block with an extra field', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...NewLoginBlock('spacer'), Html: '<b>' }]; })],
    ['a block ID outside the pattern', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...NewLoginBlock('spacer'), ID: 'X Y' }]; })],
    ['a boolean given as text', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...NewLoginBlock('spacer'), HideWhenStacked: 'yes' }]; })],
    ['a card icon not on the list', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...completeBlock('card'), Icon: 'fa-solid fa-skull' }]; })],
    ['a javascript: card link', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...completeBlock('card'), Href: 'javascript:alert(1)' }]; })],
    ['a headline past its limit', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...NewLoginBlock('headline'), Text: 'x'.repeat(121) }]; })],
    ['13 blocks in one region', raw((d) => { (d['Regions'] as Record<string, unknown[]>)['PanelTop'] = Array.from({ length: 13 }, () => NewLoginBlock('spacer')); })],
  ];
  it.each(hostile)('refuses %s', (_label, json) => {
    expect(StoredLoginDesignProblems(json).length).toBeGreaterThan(0);
  });

  it('refuses a link block with a javascript: link, an empty label, or no links', () => {
    const links = (l: Array<{ Label: string; Href: string }>) => design((d) => {
      const b = completeBlock('links');
      if (b.Type === 'links') b.Links = l;
      d.Regions.PanelBottom = [b];
    });
    expect(stored(links([{ Label: 'x', Href: 'javascript:alert(1)' }])).length).toBeGreaterThan(0);
    expect(stored(links([{ Label: ' ', Href: 'https://example.org' }])).length).toBeGreaterThan(0);
    expect(stored(links([])).length).toBeGreaterThan(0);
  });

  it('refuses two blocks with the same ID', () => {
    const b = NewLoginBlock('spacer');
    expect(stored(design((d) => { d.Regions.Banner = [b]; d.Regions.PanelTop = [{ ...b }]; }))).toHaveLength(1);
  });

  it('refuses text that is not JSON and a document over the size cap', () => {
    expect(StoredLoginDesignProblems('{"Version":1')).toHaveLength(1);
    expect(StoredLoginDesignProblems('x'.repeat(64_001))).toHaveLength(1);
  });

  it('says where the unusable value is', () => {
    expect(StoredLoginDesignProblems(raw((d) => { d['Layout'] = 'sideways'; }))[0]).toContain('"Layout"');
  });
});

describe('reading a stored design never throws and never draws what is unsafe', () => {
  it.each(['', 'null', '[]', '{"Version":1,"Regions":7}', '{"Version":1,"Regions":{"Banner":[null,{"Type":"card"}]}}'])(
    'parses %s', (text) => {
      expect(() => ParseLoginDesign(text)).not.toThrow();
    },
  );

  it('drops a javascript: card link from a hand-edited row', () => {
    const d = ParseLoginDesign(raw((x) => {
      (x['Regions'] as Record<string, unknown[]>)['Banner'] = [{ ...completeBlock('card'), Href: 'javascript:alert(1)' }];
    }));
    const card = d?.Regions.Banner[0];
    expect(card?.Type === 'card' && card.Href).toBeNull();
  });

  it('drops a color with CSS after a valid #rrggbb from a hand-edited row', () => {
    const d = ParseLoginDesign(raw((x) => { x['Colors'] = { PanelBg: '#ffffff;}body{display:none' }; }));
    expect(d?.Colors.PanelBg).toBeUndefined();
  });
});

describe('the tokens a design sets', () => {
  const tok = (fn: (d: LoginDesign) => void) => LoginDesignTokens(design(fn));

  it('the defaults set no token, so the stock login screen is untouched', () => {
    expect(tok(() => {})).toEqual({});
  });

  it('an image background darkens and covers', () => {
    const t = tok((d) => { d.Background = { Kind: 'image', Color: null, Color2: null, ImageURL: 'https://cdn.example.org/p.jpg', Overlay: 40 }; });
    expect(t['--mj-login-banner-bg']).toMatch(/rgba\(0, 0, 0, 0\.40\).*url\('https:\/\/cdn\.example\.org\/p\.jpg'\) center \/ cover/);
  });

  it('dark text restates every banner token derived from the text color', () => {
    const t = tok((d) => { d.Tone = 'dark'; });
    for (const k of ['--mj-login-banner-text', '--mj-login-banner-text-secondary', '--mj-login-banner-card-bg', '--mj-login-banner-card-border', '--mj-login-banner-card-text']) {
      expect(t).toHaveProperty(k);
    }
  });

  it('a background set without its text color gets readable text, and corners and split map to tokens', () => {
    const t = tok((d) => { d.Colors = { PanelBg: '#0f172a', CardBg: '#ffffff' }; d.CardRadius = 'none'; d.BannerShare = 'wide'; d.PanelWidth = 'wide'; });
    expect(t['--mj-login-panel-text']).toBe('var(--mj-color-neutral-0)');
    expect(t['--mj-login-card-text']).toBe('var(--mj-color-neutral-900)');
    expect(t['--mj-login-card-radius']).toBe('0');
    expect(t['--mj-login-banner-flex']).toBe('1.5');
    expect(t['--mj-login-picker-max-width']).toBe('24rem');
  });

  it('no token value can end its declaration', () => {
    const sets = [
      tok((d) => { d.Background = { Kind: 'gradient', Color: '#112233', Color2: '#445566', ImageURL: null, Overlay: 0 }; }),
      tok((d) => { d.Background = { Kind: 'image', Color: null, Color2: null, ImageURL: 'https://x.org/a.png#x;y{z}', Overlay: 10 }; }),
      tok((d) => { d.Tone = 'dark'; d.Colors = { BannerText: '#fef3c7', BannerCardBg: '#000000' }; }),
    ];
    for (const t of sets) for (const v of Object.values(t)) expect(v).not.toMatch(/[;{}<>]/);
  });
});

describe('the editor helpers', () => {
  it('warns about low contrast rather than refusing it', () => {
    const d = design((x) => { x.Colors = { PanelBg: '#ffffff', PanelText: '#eeeeee' }; });
    expect(LoginContrastWarnings(d)).toHaveLength(1);
    expect(LoginContrastWarnings(d, ['CardBg'])).toHaveLength(0);
    expect(LoginDesignProblems(d)).toEqual([]);
  });

  it('starts a new text color readable on its background, by the same rule the tokens use', () => {
    expect(StartingLoginColor(design((x) => { x.Colors = { PanelBg: '#0f172a' }; }), 'PanelText')).toBe('#ffffff');
    // A mid gray, where dark text has twice the contrast of white.
    const gray = design((x) => { x.Colors = { PanelBg: '#9ca3af' }; });
    expect(StartingLoginColor(gray, 'PanelText')).toBe('#1f2937');
    expect(LoginDesignTokens(gray)['--mj-login-panel-text']).toBe('var(--mj-color-neutral-900)');
  });

  it('a logo block falls back to the light mark, then the wordmark, and never draws an unsafe URL', () => {
    expect(LoginLogoURL('dark', { lightMarkURL: 'https://x.org/l.svg' })).toBe('https://x.org/l.svg');
    expect(LoginLogoURL('dark', { wordmarkURL: 'https://x.org/w.svg' })).toBe('https://x.org/w.svg');
    expect(LoginLogoURL('light', { lightMarkURL: 'javascript:alert(1)' })).toBeNull();
    expect(LoginLogoURL('light', {})).toBeNull();
  });
});

describe('the editor and the server agree', () => {
  /** Edits a person can make in the inspector, good and bad, as raw values. */
  const edits: Array<(d: LoginDesign) => void> = [
    (d) => { d.Colors.CardBg = '#fff'; },
    (d) => { d.Colors.PanelBg = '#0f172a'; },
    (d) => { d.Colors.BannerText = 'red'; },
    (d) => { d.Background = { ...d.Background, Kind: 'image', ImageURL: 'http://x.org/a.jpg' }; },
    (d) => { d.Background = { ...d.Background, Kind: 'image', ImageURL: 'https://x.org/a.jpg' }; },
    (d) => { d.Background = { ...d.Background, Kind: 'gradient', Color: '#112233', Color2: '#abc' }; },
    (d) => { d.Background = { ...d.Background, Kind: 'color', Color: '#112233' }; },
    (d) => { d.Background.Kind = 'brand'; },
    (d) => { d.Heading = 'x'.repeat(61); },
    (d) => { d.Heading = 'Sign in'; },
    (d) => { d.Regions.PanelTop.push(completeBlock('card')); },
    (d) => { d.Regions.PanelTop.push(NewLoginBlock('image')); },
    (d) => { d.Regions.Banner.push(NewLoginBlock('links')); },
    (d) => { d.Regions.PanelBottom.push(completeBlock('links')); },
    (d) => { d.Regions.Banner = []; },
  ];
  it('a design the editor finds nothing wrong with is one the server accepts, across 400 random edit runs', () => {
    let seed = 7;
    const rand = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let run = 0; run < 400; run++) {
      const d = DefaultLoginDesign();
      for (let i = 0, n = 1 + rand(5); i < n; i++) edits[rand(edits.length)](d);
      const editorOk = LoginDesignProblems(d).length === 0;
      const serverOk = StoredLoginDesignProblems(JSON.stringify(d)).length === 0;
      expect({ run, editorOk, serverOk }).toEqual({ run, editorOk, serverOk: editorOk });
    }
  });

  it('refuses a __proto__ key, which reads as inherited on the normalized side', () => {
    expect(StoredLoginDesignProblems(raw((d) => { Object.defineProperty(d, '__proto__', { value: {}, enumerable: true }); })).length).toBeGreaterThan(0);
    expect(StoredLoginDesignProblems(JSON.stringify(DefaultLoginDesign()).replace('{"Version"', '{"__proto__":{},"Version"')).length).toBeGreaterThan(0);
  });
});

describe('what reaches a page with no session', () => {
  it('keeps only safe logo URLs', () => {
    expect(PublicLoginLogos({ lightMarkURL: 'https://x.org/m.svg', darkMarkURL: 'javascript:alert(1)', wordmarkURL: "https://x.org/a\r');}", monochromeURL: '/assets/m.svg' }))
      .toEqual({ lightMarkURL: 'https://x.org/m.svg', monochromeURL: '/assets/m.svg' });
    expect(PublicLoginLogos(null)).toEqual({});
  });

  it('turns seeds into login-scoped tokens per color mode, and nothing without seeds', () => {
    const light = LoginThemeTokens({ primary: '#0076b6' }, false);
    expect(light['--mj-color-brand-500']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light['--mj-brand-primary']).toBe('var(--mj-color-brand-500)');
    expect(LoginThemeTokens({ primary: '#0076b6' }, true)['--mj-login-grad-start']).toBe('var(--mj-color-neutral-950)');
    expect(LoginThemeTokens(null, false)).toEqual({});
    for (const v of Object.values(light)) expect(v).not.toMatch(/[;{}<>]/);
  });

  it('serves a design only when it has no problem, and a theme row only its published design', () => {
    const unsafe = design((d) => { d.Regions.PanelBottom = [{ ...completeBlock('links'), Links: [{ Label: 'x', Href: 'javascript:alert(1)' }] } as LoginBlock]; });
    expect(SanitizePublicLoginScreen({ ThemeName: 'Acme', Design: unsafe, Seeds: null, Logos: {} }).Design).toBeNull();
    expect(SanitizePublicLoginScreen('nope')).toEqual({ ThemeName: null, Design: null, Seeds: null, Logos: {} });

    const row = { Name: 'Acme', LoginScreen: JSON.stringify(DefaultLoginDesign()), Seeds: 'not json', LightMarkURL: null, DarkMarkURL: null, WordmarkURL: null, MonochromeURL: null };
    expect(PublicLoginScreenFromTheme(row)).toMatchObject({ ThemeName: 'Acme', Seeds: null, Logos: {} });
    expect(PublicLoginScreenFromTheme(row).Design?.Layout).toBe('split');
  });
});
