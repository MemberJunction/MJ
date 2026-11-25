#!/usr/bin/env node
/**
 * Compiles `@memberjunction/ng-tours`'s Light DOM global style layer (`@layer mj-tours-defaults`).
 *
 * Mirrors `packages/Angular/Generic/realtime-widget/scripts/build-global-styles.mjs`:
 * - Pulls `--mj-*` design tokens from `@memberjunction/ng-shared-generic/dist/lib/_tokens.scss`
 * - Pulls `.mj-btn*` styles from `@memberjunction/ng-ui-components/dist/lib/button/button.scss`
 * - Pulls Font Awesome Free Solid CSS + inlined woff2 font (outside `@layer` for `@font-face`)
 * - Includes `:where(...)` low-specificity `mjt-*` component defaults inside `@layer mj-tours-defaults`
 *   so unlayered host `--mj-*` themes always win while non-MJ HTML pages get crisp defaults.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../../..');
const FALLBACK_SEARCH_ROOTS = [
    join(HERE, '..'),
    join(REPO_ROOT, 'packages/Angular/Generic/realtime-widget'),
    REPO_ROOT,
];

let compileString;
try {
    const sassPath = require.resolve('sass', { paths: FALLBACK_SEARCH_ROOTS });
    const sassMod = await import(pathToFileURL(sassPath).href);
    compileString = sassMod.compileString ?? sassMod.default?.compileString;
} catch (e) {
    if (e?.code !== 'MODULE_NOT_FOUND' && e?.code !== 'ERR_MODULE_NOT_FOUND') {
        throw e;
    }
    console.log('tour global style layer: skipped — `sass` is not installed.');
    process.exit(0);
}

const OUTPUT_FILE = join(HERE, '..', 'src', 'lib', 'theme', 'tour-global-styles.generated.css');
const TOUR_BASE_CSS_FILE = join(HERE, '..', 'src', 'lib', 'overlay', 'tour-styles.css');
const LAYER = 'mj-tours-defaults';

const SOURCES = [
    {
        package: '@memberjunction/ng-shared-generic',
        fallbackPath: join(REPO_ROOT, 'packages/Angular/Generic/shared/dist/lib/_tokens.scss'),
        file: 'dist/lib/_tokens.scss',
        why: 'the --mj-* design tokens',
        stripColorScheme: true,
    },
    {
        package: '@memberjunction/ng-ui-components',
        fallbackPath: join(REPO_ROOT, 'packages/Angular/Generic/ui-components/dist/lib/button/button.scss'),
        file: 'dist/lib/button/button.scss',
        why: 'mjButton (.mj-btn*)',
    },
];

const FONT_AWESOME = {
    package: '@fortawesome/fontawesome-free',
    core: 'css/fontawesome.min.css',
    style: 'css/solid.min.css',
    font: 'webfonts/fa-solid-900.woff2',
};

const REQUIRED_OUTPUT = [
    '@layer mj-tours-defaults',
    '--mj-bg-surface',
    '--mj-brand-primary',
    '--mj-z-tour-popover',
    '--mj-z-tour-modal',
    '.mj-btn{',
    '.mj-btn--primary',
    'data:font/woff2;base64,',
    'font-family:"Font Awesome 6 Free"',
];

const EXPECTED_COLOR_SCHEME_DECLARATIONS = 2;
const COLOR_SCHEME_DECLARATION_RE = /^[ \t]*color-scheme:[^;]+;[ \t]*\r?\n/gm;

function resolvePackageFile(packageName, file, fallbackPath) {
    try {
        const entry = require.resolve(packageName, { paths: FALLBACK_SEARCH_ROOTS });
        const marker = join('node_modules', ...packageName.split('/'));
        const rootEnd = entry.lastIndexOf(marker);
        if (rootEnd !== -1) {
            return join(entry.slice(0, rootEnd + marker.length), file);
        }
        let dir = dirname(entry);
        for (;;) {
            try {
                if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === packageName) {
                    return join(dir, file);
                }
            } catch {
                // continue climbing
            }
            const parent = dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    } catch {
        if (fallbackPath && existsSync(fallbackPath)) {
            return fallbackPath;
        }
        // Fallback to .pnpm store for devDependencies before pnpm install runs on a fresh package
        if (packageName === '@fortawesome/fontawesome-free') {
            const pnpmFa = join(REPO_ROOT, 'packages/Angular/Generic/realtime-widget/node_modules/@fortawesome/fontawesome-free', file);
            if (existsSync(pnpmFa)) {
                return pnpmFa;
            }
        }
    }
    if (fallbackPath && existsSync(fallbackPath)) {
        return fallbackPath;
    }
    throw new Error(`Cannot locate ${packageName}/${file}`);
}

function stripColorScheme(css, label) {
    const found = css.match(COLOR_SCHEME_DECLARATION_RE) ?? [];
    if (found.length !== EXPECTED_COLOR_SCHEME_DECLARATIONS) {
        throw new Error(
            `${label}: expected ${EXPECTED_COLOR_SCHEME_DECLARATIONS} color-scheme declarations, found ${found.length}.`,
        );
    }
    return css.replace(COLOR_SCHEME_DECLARATION_RE, '');
}

function readSources() {
    return SOURCES.map((source) => {
        const path = resolvePackageFile(source.package, source.file, source.fallbackPath);
        const raw = readFileSync(path, 'utf8');
        const label = `${source.package}/${source.file}`;
        return {
            label,
            why: source.why,
            scss: source.stripColorScheme ? stripColorScheme(raw, label) : raw,
        };
    });
}

function readFontAwesome() {
    const read = (file) => readFileSync(resolvePackageFile(FONT_AWESOME.package, file), 'utf8');
    const core = read(FONT_AWESOME.core);
    const style = read(FONT_AWESOME.style);

    const fontFaceRe = /@font-face\{[^}]*\}/;
    const fontSrcRe = /src:[^;}]*/;
    const fontFace = fontFaceRe.exec(style);
    if (!fontFace || !fontSrcRe.test(fontFace[0])) {
        throw new Error('Font Awesome solid.min.css did not contain expected @font-face src descriptor.');
    }

    const woff2 = readFileSync(resolvePackageFile(FONT_AWESOME.package, FONT_AWESOME.font)).toString('base64');
    const inlined = fontFace[0].replace(
        fontSrcRe,
        () => `src:url(data:font/woff2;base64,${woff2}) format("woff2")`,
    );

    return { fontFace: inlined, layered: `${core}\n${style.replace(fontFaceRe, '')}` };
}

function buildCss() {
    const sources = readSources();
    const tourBaseCss = existsSync(TOUR_BASE_CSS_FILE) ? readFileSync(TOUR_BASE_CSS_FILE, 'utf8') : '';
    const layeredScss = `@layer ${LAYER} {\n`
        + sources.map((s) => `/* ---- ${s.label} — ${s.why} ---- */\n${s.scss}`).join('\n')
        + (tourBaseCss ? `\n/* ---- tour-styles.css ---- */\n${tourBaseCss}\n` : '')
        + '\n}\n';
    const { css: compiledCss } = compileString(layeredScss, { style: 'compressed' });

    const fontAwesome = readFontAwesome();
    const css = `@layer ${LAYER};\n${fontAwesome.fontFace}\n@layer ${LAYER}{${fontAwesome.layered}}\n${compiledCss}`;

    const missing = REQUIRED_OUTPUT.filter((needle) => !css.includes(needle));
    if (missing.length > 0) {
        throw new Error(`Compiled tour global style layer is missing required output: ${missing.join(', ')}`);
    }

    const header = `/* GENERATED by scripts/build-global-styles.mjs — do not edit.\n`
        + `   Declared upfront inside @layer ${LAYER} so host --mj-* tokens win. */\n`;
    return `${header}${css}\n`;
}

const css = buildCss();
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, css, 'utf8');
console.log(`tour global style layer: ${(css.length / 1024).toFixed(1)} kB -> ${OUTPUT_FILE}`);
