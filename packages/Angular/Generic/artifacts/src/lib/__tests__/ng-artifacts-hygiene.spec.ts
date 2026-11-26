import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LIB_DIR = resolve(__dirname, '..');
const CORE_ENTITIES_DIR = resolve(__dirname, '../../../../../../MJCoreEntities/src/custom');

const NEW_COMPONENT_TS_FILES = [
  resolve(LIB_DIR, 'components/mj-artifact-slideover/mj-artifact-slideover.component.ts'),
  resolve(LIB_DIR, 'components/mj-record-docs-list/mj-record-docs-list.component.ts'),
  resolve(LIB_DIR, 'components/mj-embedded-doc-panel/mj-embedded-doc-panel.component.ts'),
];

const NEW_ALL_TS_FILES = [
  ...NEW_COMPONENT_TS_FILES,
  resolve(LIB_DIR, 'services/mj-artifact-slideover.service.ts'),
  resolve(CORE_ENTITIES_DIR, 'PromoteNoteToArtifact.ts'),
];

const NEW_STYLE_FILES = [
  resolve(LIB_DIR, 'components/mj-artifact-slideover/mj-artifact-slideover.component.css'),
  resolve(LIB_DIR, 'components/mj-record-docs-list/mj-record-docs-list.component.css'),
  resolve(LIB_DIR, 'components/mj-embedded-doc-panel/mj-embedded-doc-panel.component.css'),
];

const NEW_TEMPLATE_FILES = [
  resolve(LIB_DIR, 'components/mj-artifact-slideover/mj-artifact-slideover.component.html'),
  resolve(LIB_DIR, 'components/mj-record-docs-list/mj-record-docs-list.component.html'),
  resolve(LIB_DIR, 'components/mj-embedded-doc-panel/mj-embedded-doc-panel.component.html'),
];

describe('MJ Docs Phase 0 Slice 3 — @memberjunction/ng-artifacts & PromoteNoteToArtifact Hygiene', () => {
  it('contains zero raw #hex, rgb(), rgba(), hsl(), hsla() color literals in CSS and HTML templates', () => {
    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
    for (const filePath of [...NEW_STYLE_FILES, ...NEW_TEMPLATE_FILES]) {
      const content = readFileSync(filePath, 'utf8');
      expect(content, `Raw color literal found in ${filePath}`).not.toMatch(rawColorRegex);
    }
  });

  it('contains zero .mj-btn overrides in component CSS files', () => {
    const mjBtnOverrideRegex = /\.mj-btn(?![a-zA-Z0-9_-])|\.mj-btn--/;
    for (const filePath of NEW_STYLE_FILES) {
      const content = readFileSync(filePath, 'utf8');
      expect(content, `.mj-btn override found in ${filePath}`).not.toMatch(mjBtnOverrideRegex);
    }
  });

  it('uses modern @if/@for syntax with zero *ngIf/*ngFor directives in templates', () => {
    for (const filePath of NEW_TEMPLATE_FILES) {
      const content = readFileSync(filePath, 'utf8');
      expect(content, `Legacy structural directive found in ${filePath}`).not.toMatch(/\*ng(If|For|Switch)\b/);
      expect(content, `Expected modern @if control flow in ${filePath}`).toMatch(/@if\s*\(/);
    }
  });

  it('uses ChangeDetectionStrategy.OnPush and inject() on every new Angular component', () => {
    for (const filePath of NEW_COMPONENT_TS_FILES) {
      const content = readFileSync(filePath, 'utf8');
      expect(content, `Missing ChangeDetectionStrategy.OnPush in ${filePath}`).toContain(
        'ChangeDetectionStrategy.OnPush',
      );
      expect(content, `Missing inject() DI in ${filePath}`).toMatch(/\binject\s*\(/);
    }
  });

  it('contains zero localStorage/sessionStorage, zero window.print, zero @angular/router, zero any/unknown casts, and zero .Get()/.Set()', () => {
    for (const filePath of [...NEW_ALL_TS_FILES, ...NEW_TEMPLATE_FILES]) {
      const content = readFileSync(filePath, 'utf8');
      expect(content, `localStorage/sessionStorage found in ${filePath}`).not.toMatch(
        /\b(localStorage|sessionStorage)\b/,
      );
      expect(content, `window.print found in ${filePath}`).not.toMatch(/\bwindow\.print\b/);
      expect(content, `@angular/router import found in ${filePath}`).not.toMatch(/@angular\/router/);
      expect(content, `Explicit any or lazy unknown cast found in ${filePath}`).not.toMatch(
        /:\s*any\b|\bas\s+any\b|<any>|\bas\s+unknown\b/,
      );
      expect(content, `Untyped .Get()/.Set() entity accessor found in ${filePath}`).not.toMatch(
        /\.(Get|Set)\s*\(\s*['"]/,
      );
    }
  });
});
