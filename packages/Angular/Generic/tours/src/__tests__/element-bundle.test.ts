import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '../..');
const distElementDir = join(pkgRoot, 'dist/element');
const shellPath = join(distElementDir, 'mj-tours.js');
const sessionPath = join(distElementDir, 'mj-tours-session.js');

const FORBIDDEN_IN_SHELL = [
  /node_modules[\\/]@angular[\\/]/,
  /node_modules[\\/]rxjs[\\/]/,
  /node_modules[\\/]zone\.js[\\/]/,
  /node_modules[\\/]@memberjunction[\\/]/,
  /[\\/]MJ[A-Za-z]+[\\/]dist[\\/]/,
  /[\\/]Tours[\\/]Runtime[\\/]dist[\\/]/,
];

function allJsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...allJsFiles(full));
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('@memberjunction/ng-tours two-stage element bundle', () => {
  it('enforces FORBIDDEN_IN_SHELL and exports Stage-1 shell source cleanly without Angular/RxJS/MJ imports', () => {
    const shellSource = readFileSync(join(pkgRoot, 'src/shell-entry.ts'), 'utf8')
      + '\n'
      + readFileSync(join(pkgRoot, 'src/shell/shell-element.ts'), 'utf8')
      + '\n'
      + readFileSync(join(pkgRoot, 'src/shell/session-loader.ts'), 'utf8');

    // Strip `import type` statements; verify zero runtime imports from Angular, RxJS, Zone, or MJ packages
    const withoutTypeImports = shellSource.replace(/import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
    expect(withoutTypeImports).not.toMatch(/from\s+['"]@angular\//);
    expect(withoutTypeImports).not.toMatch(/from\s+['"]rxjs/);
    expect(withoutTypeImports).not.toMatch(/from\s+['"]zone\.js/);
    expect(withoutTypeImports).not.toMatch(/from\s+['"]@memberjunction\//);

    // Core anchor manifest exists in src/
    const manifest = JSON.parse(readFileSync(join(pkgRoot, 'src/core-anchor-manifest.json'), 'utf8')) as {
      Anchors: Array<{ Key: string }>;
    };
    expect(manifest.Anchors.map((a) => a.Key)).toContain('core.shell.app-switcher');
    expect(manifest.Anchors.map((a) => a.Key)).toContain('core.shell.tours-launcher');
  });

  it('verifies built dist/element artifacts when compiled (budget, FORBIDDEN_IN_SHELL, AOT linker, ClassFactory keys)', () => {
    if (!existsSync(shellPath) || !existsSync(sessionPath)) {
      return;
    }

    const shellBytes = readFileSync(shellPath);
    expect(gzipSync(shellBytes).length).toBeLessThanOrEqual(25 * 1024);

    const shellText = readFileSync(shellPath, 'utf8');
    expect(shellText).toContain('customElements.get');
    expect(shellText).not.toContain('ɵɵngDeclare');

    const meta = JSON.parse(readFileSync(join(distElementDir, 'meta.json'), 'utf8')) as {
      shell: { inputs: Record<string, unknown> };
    };
    const leaked = Object.keys(meta.shell.inputs).filter((input) =>
      FORBIDDEN_IN_SHELL.some((re) => re.test(input)),
    );
    expect(leaked).toEqual([]);

    const jsFiles = allJsFiles(distElementDir);
    const unlinked = jsFiles.filter((f) => readFileSync(f, 'utf8').includes('ɵɵngDeclare'));
    expect(unlinked).toEqual([]);

    const allBundleText = jsFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const key of [
      'Spotlight',
      'Action',
      'Beacon',
      'Modal',
      'Banner',
      'Choice',
      'Media',
      'EmbeddedComponent',
      'AskAgent',
      'Overlay',
      'SidePanel',
      'Embedded',
    ]) {
      expect(allBundleText, `Missing @RegisterClass key '${key}'`).toContain(key);
    }
  });
});
