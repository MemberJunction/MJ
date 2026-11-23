import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_OR_HSL_RE = /\b(?:rgba?|hsla?)\s*\(/gi;
const RAW_STORAGE_RE = /\b(?:localStorage|sessionStorage)\b/g;
const WINDOW_PRINT_RE = /\bwindow\.print\s*\(/g;
const LEGACY_NG_DIRECTIVE_RE = /(?:\*ngIf|\*ngFor|\*ngSwitch)\b/g;
const MJ_BTN_OVERRIDE_RE = /\.mj-btn\b/g;
const NAMED_COLOR_VALUE_RE =
  /(?:^|[\s;{])(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow)\s*:\s*([^;{}]*)/gi;
const FORBIDDEN_NAMED_COLORS =
  /(?<![\w.-])(?:white|black|red|blue|green|gray|grey|silver|navy|teal|orange|yellow|purple|pink|brown|maroon|olive|lime|aqua|fuchsia|coral|crimson|gold|indigo|ivory|khaki|lavender|magenta|plum|salmon|sienna|tan|turquoise|violet|wheat)\b/i;

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('ShellNoAccessComponent — Design Token & Angular Hygiene Lint', () => {
  const css = readFileSync(join(__dirname, 'shell-no-access.component.css'), 'utf8');
  const html = readFileSync(join(__dirname, 'shell-no-access.component.html'), 'utf8');
  const ts = readFileSync(join(__dirname, 'shell-no-access.component.ts'), 'utf8');

  it('uses strictly --mj-* CSS custom properties with zero hex, rgb(), rgba(), hsl(), or named color literals', () => {
    const cleanCss = stripCssComments(css);
    const cleanCssWithoutVarFallbacks = cleanCss.replace(/var\([^)]*\)/g, 'var(--token)');

    expect(cleanCssWithoutVarFallbacks.match(HEX_COLOR_RE)).toBeNull();
    expect(cleanCssWithoutVarFallbacks.match(RGB_OR_HSL_RE)).toBeNull();
    expect(cleanCss.match(MJ_BTN_OVERRIDE_RE)).toBeNull();

    const namedColorViolations: string[] = [];
    for (const match of cleanCssWithoutVarFallbacks.matchAll(NAMED_COLOR_VALUE_RE)) {
      const value = match[1] ?? '';
      if (FORBIDDEN_NAMED_COLORS.test(value)) {
        namedColorViolations.push(value.trim());
      }
    }
    expect(namedColorViolations).toEqual([]);

    expect(css).toContain('var(--mj-bg-page)');
    expect(css).toContain('var(--mj-bg-surface)');
    expect(css).toContain('var(--mj-text-primary)');
    expect(css).toContain('var(--mj-text-secondary)');
    expect(css).toContain('var(--mj-border-default)');
    expect(css).toContain('var(--mj-brand-primary)');
  });

  it('contains zero color literals or legacy *ngIf/*ngFor directives in template HTML', () => {
    expect(html.match(HEX_COLOR_RE)).toBeNull();
    expect(html.match(RGB_OR_HSL_RE)).toBeNull();
    expect(html.match(LEGACY_NG_DIRECTIVE_RE)).toBeNull();
    expect(html).toContain('@if (');
  });

  it('uses OnPush change detection, zero web storage, and zero window.print() in TypeScript', () => {
    expect(ts).toContain('ChangeDetectionStrategy.OnPush');
    expect(ts.match(RAW_STORAGE_RE)).toBeNull();
    expect(ts.match(WINDOW_PRINT_RE)).toBeNull();
  });
});
