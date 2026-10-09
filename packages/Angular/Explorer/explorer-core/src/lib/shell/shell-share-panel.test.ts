import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The shell marks its main content area as a panel a call can share on its own: a call's Share menu offers it under
 * "This panel" as "Main content" (to a call outside it, such as the floating chat's). Rendering the shell takes the
 * whole app, so this reads the template and the module that compiles it. A static attribute with no directive behind
 * it compiles without a word, which is why the module's import is checked too.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(resolve(here, file), 'utf8');

/** The opening tag of the shell's main content area. */
function mainContentTag(): string {
  const tag = read('shell.component.html').match(/<mj-tab-container\b[^>]*\bid="mj-main-content"[^>]*>/);
  expect(tag, 'the shell renders its main content in <mj-tab-container id="mj-main-content">').not.toBeNull();
  return tag?.[0] ?? '';
}

describe('the shell offers its main content as a shareable panel', () => {
  it('marks the main content area as "Main content", with its menu icon', () => {
    const tag = mainContentTag();
    expect(tag).toMatch(/\smjSharePanel="Main content"\s/);
    expect(tag).toMatch(/\smjSharePanelIcon="fa-solid fa-table-cells-large"\s/);
  });

  it('compiles the template with the directive behind the attribute', () => {
    const source = read('shell.module.ts');
    expect(source).toContain("import { SharePanelDirective } from '@memberjunction/ng-realtime-media';");
    expect(source).toMatch(/imports: \[[^\]]*\bSharePanelDirective\b[^\]]*\]/);
  });
});
