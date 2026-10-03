#!/usr/bin/env node
/**
 * Compiles the widget bundle's GLOBAL style layer.
 *
 * An `<mj-realtime-widget>` embed is one script tag on a page that knows nothing about MJ. It therefore
 * arrives without the three things every MJ Angular surface silently assumes a host application already
 * loaded:
 *
 *   1. the `--mj-*` design tokens — so every `var(--mj-*)` in the widget tree resolved to nothing;
 *   2. the GLOBAL component stylesheets. `mjButton` is an attribute DIRECTIVE: it only applies `.mj-btn*`
 *      classes, and their CSS ships as `button.scss` for a host app to `@use`. `mj-switch` is a component
 *      with no `styles` of its own, styled the same way. Neither is in the JS bundle;
 *   3. Font Awesome — MJ renders icons as bare class names (`<i class="fa-solid fa-microphone">`) and ships
 *      no font, so every icon in the hosted realtime overlay rendered as an empty circle.
 *
 * So the bundle ships them itself, COMPILED FROM MJ'S OWN SOURCES at build time rather than copied into this
 * repo: a hand-vendored palette would drift silently on every `@memberjunction/*` bump, and drift in a
 * default palette looks like a design decision rather than a stale file.
 *
 * Everything lands inside `@layer mj-realtime-widget-defaults`. That single word is what makes shipping
 * document-level defaults safe: an UNLAYERED declaration always beats a layered one regardless of order, so
 * an embedding MJ app's own `:root` tokens (and its `[data-theme="dark"]`) keep winning, and the widget only
 * fills in what the page left undefined. Per-page `theme-tokens` are applied inline on the host element and
 * outrank both. The precise claim is "unlayered beats layered", not "the page always wins": a host that
 * declared its OWN `--mj-*` inside a named layer would fall back to layer-declaration order. Nothing in MJ
 * does that today. A browser without cascade-layer support ignores the block entirely; layers are Baseline
 * since 2022.
 *
 * Adapted from the Caliber widget's `build-widget-global-styles.mjs` (same sources, same drift assertions).
 *
 * Runs as `prebuild` — `ngc` inlines `styleUrls` at compile time and cannot wait for it — and as `pretest`,
 * so the DOM specs (which AOT-compile the same `styleUrls`) never meet a missing file. The output is
 * git-ignored: it is derived, and committing a ~170 kB generated stylesheet would only rot.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `sass` is a devDependency, and this script also runs as `prepare` — which npm runs even for
 * `npm ci --omit=dev`, where sass is absent. A static import would abort the whole monorepo install
 * before any guard could explain why. So it is loaded dynamically (CLAUDE.md rule #7's optional-dep
 * case): an ABSENT sass means there is nothing to do here, because a dependency-less install has no
 * `ngc` either and is never going to compile this package.
 *
 * The absence is decided by `import.meta.resolve`, NOT by catching the import: a half-extracted sass
 * (its `package.json` present, the ESM entry or anything that entry imports missing) throws the very
 * same `ERR_MODULE_NOT_FOUND`, and sniffing the code would swallow it as "not installed" — the one
 * path that yields a "successful" install followed by a baffling NG2008 at compile time. Resolution
 * succeeds for a broken-but-present sass, so the `await import` below is left to throw for real.
 *
 * The message is best-effort: npm buffers lifecycle-script output, so during an install it is only
 * visible with `--foreground-scripts`. Not failing the install is the point; being read is a bonus.
 */
try {
    import.meta.resolve('sass');
} catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') {
        throw e;
    }
    console.log('widget global style layer: skipped — `sass` is not installed (a --omit=dev install '
        + 'cannot compile this package and does not need the stylesheet).');
    process.exit(0);
}
const { compileString } = await import('sass');

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(HERE, '..', 'src', 'lib', 'theme', 'widget-global-styles.generated.css');

/** The cascade layer everything is emitted into. */
const LAYER = 'mj-realtime-widget-defaults';

/**
 * The MJ sources vendored into the layer, each a path RELATIVE TO ITS PACKAGE ROOT. Only what the
 * widget's reachable surfaces actually need: `mj-alert`, `mj-loading` and the realtime overlay carry
 * their own encapsulated styles and so need nothing but the tokens.
 *
 * Both packages are ALSO listed in this package's `devDependencies`, not just its `peerDependencies`,
 * because reading their `.scss` here makes them build inputs — and pinned exactly (like the apps'
 * dependencies, per CLAUDE.md) so that an MJ bump changes the lockfile hash for this package. With
 * peer-only declarations it did not: `turbo build` replayed a cached `dist` compiled against the
 * PREVIOUS MJ's tokens, and none of the drift assertions below ran (measured 2026-07-30). That cache
 * replay is what would have made "compiled from MJ's own sources, so it cannot go stale" untrue.
 */
const SOURCES = [
    {
        package: '@memberjunction/ng-shared-generic',
        file: 'dist/lib/_tokens.scss',
        why: 'the --mj-* tokens themselves',
        // Declared per-source rather than sniffed from the filename: keying the strip off
        // `endsWith('_tokens.scss')` meant an upstream RENAME would silently skip both the strip and
        // the count assertion that exists to catch exactly that — the one path where that guard
        // cannot fire. See {@link stripColorScheme}.
        stripColorScheme: true,
    },
    { package: '@memberjunction/ng-ui-components', file: 'dist/lib/button/button.scss', why: 'mjButton (.mj-btn*)' },
    { package: '@memberjunction/ng-ui-components', file: 'dist/lib/input/input-switch-progress.scss', why: 'mj-switch' },
];

/**
 * Font Awesome — the THIRD thing an MJ surface silently assumes its host application already loaded.
 *
 * MJ renders icons as bare class names (`<i class="fa-solid fa-microphone">`) and ships no font: its
 * own application pulls one from a CDN in `apps/MJExplorer/src/index.html`. A bare embed has no such
 * tag, so every icon in the hosted realtime overlay rendered as an empty circle — the call controls
 * (mute, captions, end call) were unlabelled buttons (measured 2026-07-30 on a live session).
 *
 * Vendored rather than CDN-linked for the same reason the tokens are: a customer's careers site
 * should not have to add a stylesheet for our widget to be usable, and an embed that reaches out to
 * a third-party origin is one a strict CSP blocks. The font travels as a `data:` URI so the bundle
 * stays a single self-contained file.
 *
 * Only the SOLID family is vendored — it is the only one MJ's reachable surfaces render (see
 * {@link MJ_ICON_SURFACE}). Regular and brands would add ~250 kB for glyphs nothing asks for.
 *
 * Licence: Font Awesome Free — icons CC BY 4.0, fonts SIL OFL 1.1, code MIT. Both vendored files
 * carry their own `/*!` attribution banner, and concatenating them raw preserves it in the output.
 */
const FONT_AWESOME = {
    package: '@fortawesome/fontawesome-free',
    /** Every glyph mapping: `.fa-microphone{--fa:"\\f130"}` plus `.fa-solid:before{content:var(--fa)}`. */
    core: 'css/fontawesome.min.css',
    /** The `@font-face` itself, the family name, and `font-weight:900`. */
    style: 'css/solid.min.css',
    font: 'webfonts/fa-solid-900.woff2',
};

/**
 * The surfaces the widget renders that draw icons: `<mj-realtime-session-overlay>` (the entire live-call UI)
 * and the Identity Verification surface, both from ng-conversations' compiled output (templates are inlined
 * by ngc), plus this package's own templates. Scanned at build time so that an MJ upgrade introducing an icon
 * Font Awesome FREE does not carry fails this build loudly, instead of shipping another blank control. That
 * is the failure this vendoring exists to end, so it gets a guard rather than a comment.
 */
const MJ_ICON_SURFACES = [
    {
        package: '@memberjunction/ng-conversations',
        file: 'dist/lib/components/realtime/realtime-session-overlay.component.js',
    },
    {
        package: '@memberjunction/ng-conversations',
        file: 'dist/lib/components/realtime/identity-verification/identity-verification-surface.component.js',
    },
];

/** This package's own templates — read straight from source, since they are what this build is part of. */
const LOCAL_ICON_SURFACES = [
    '../src/lib/components/realtime-widget.component.html',
    '../src/lib/components/widget-consent-gate.component.html',
    '../src/lib/components/widget-status.component.html',
];

/** Any `fa-*` class in MJ's markup — glyph names, style names (`fa-solid`) and utilities (`fa-fw`) alike. */
const FA_CLASS_RE = /\bfa-[a-z0-9]+(?:-[a-z0-9]+)*/g;

/** Matches `@font-face{…}`. Font Awesome's block nests no braces, so this is exact rather than lucky. */
const FONT_FACE_RE = /@font-face\{[^}]*\}/;

/** The `src:` descriptor inside that block — replaced wholesale by the inlined woff2. */
const FONT_SRC_RE = /src:[^;}]*/;

/**
 * Text every compiled output must contain — so a silently-emptied or relocated upstream file fails
 * the build instead of shipping an unstyled widget again. The needles reach past a bare family prefix
 * (`.mj-btn` alone was satisfied by `.mj-btn--primary`, proving only that *something* in the family
 * survived) and cover the switch's inner parts, which is what a bare embed was actually missing.
 *
 * They are substring checks, not selector parsing, so several remain satisfiable by a descendant or
 * pseudo-class form — `.mj-btn{` by `.mj-btn-group .mj-btn{`, `.mj-switch-track` by
 * `.mj-switch--on .mj-switch-track`. That is fine for the failure this guards: an emptied or moved
 * stylesheet takes every occurrence with it. It is NOT a check that each individual rule survived.
 */
const REQUIRED_OUTPUT = [
    '--mj-bg-page', '--mj-brand-primary', '--mj-status-success',
    '.mj-btn{', '.mj-btn--primary', '.mj-btn--success',
    '.mj-switch-track', '.mj-switch-thumb',
    // Font Awesome's three moving parts: the inlined face, the family that references it, and the
    // custom-property indirection FA 6 uses to turn a class into a glyph. Losing any one of them
    // renders every icon blank again, which is exactly the bug that is invisible until someone looks.
    'data:font/woff2;base64,', 'font-family:"Font Awesome 6 Free"', 'content:var(--fa)',
];

/** `color-scheme` declarations in MJ's token file — see {@link stripColorScheme}. */
const EXPECTED_COLOR_SCHEME_DECLARATIONS = 2;
const COLOR_SCHEME_DECLARATION_RE = /^[ \t]*color-scheme:[^;]+;[ \t]*\r?\n/gm;

/**
 * Resolves a package's root through its entry point, so this works whether the package was hoisted
 * to the repo root, nested here, or symlinked from a pnpm workspace. The `.scss` files are not in the
 * package's `exports`, so they cannot be resolved directly.
 */
function resolvePackageFile(packageName, file) {
    const entry = require.resolve(packageName);
    const marker = join('node_modules', ...packageName.split('/'));
    const rootEnd = entry.lastIndexOf(marker);
    if (rootEnd !== -1) {
        return join(entry.slice(0, rootEnd + marker.length), file);
    }
    // No `node_modules` segment at all. In a pnpm WORKSPACE the dependency is linked straight to its
    // source package, so the entry point reads `<repo>/packages/Angular/Generic/shared/dist/public-api.js`
    // and the marker search can never match — which is why linking this app into an MJ checkout broke
    // a script that was fine against an installed copy. Walk up to the nearest package.json that
    // actually claims this name; correct under both layouts.
    let dir = dirname(entry);
    for (;;) {
        // An unreadable/malformed manifest on the way up simply is not the package we want, so keep
        // climbing. If nothing ever matches, the throw below is the error path — nothing is swallowed.
        try {
            if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === packageName) {
                return join(dir, file);
            }
        } catch {
            // not this directory — continue
        }
        const parent = dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    throw new Error(`cannot locate the package root of ${packageName} from its entry point ${entry}`);
}

/**
 * Drops MJ's `color-scheme: light` / `color-scheme: dark`. They are correct for an APPLICATION that
 * owns its `:root`, but here `:root` belongs to someone else's careers site: forcing a UA color
 * scheme on the embedding page would restyle ITS form controls and scrollbars. The widget declares
 * its own `color-scheme` on `:host` instead (`realtime-widget.component.css`), which is the only
 * subtree it is entitled to. Asserts the expected count so an upstream change is caught rather than
 * quietly no-op'd.
 */
function stripColorScheme(css, sourceLabel) {
    const found = css.match(COLOR_SCHEME_DECLARATION_RE) ?? [];
    if (found.length !== EXPECTED_COLOR_SCHEME_DECLARATIONS) {
        throw new Error(
            `${sourceLabel}: expected ${EXPECTED_COLOR_SCHEME_DECLARATIONS} \`color-scheme\` declarations to strip, ` +
            `found ${found.length}. MJ changed the token file — re-check whether the widget should still ` +
            `own its color-scheme on :host before updating this count.`,
        );
    }
    return css.replace(COLOR_SCHEME_DECLARATION_RE, '');
}

function readSources() {
    return SOURCES.map(source => {
        const path = resolvePackageFile(source.package, source.file);
        const raw = readFileSync(path, 'utf8');
        const label = `${source.package}/${source.file}`;
        return {
            label,
            why: source.why,
            scss: source.stripColorScheme === true ? stripColorScheme(raw, label) : raw,
        };
    });
}

/**
 * Reads Font Awesome and returns its two halves, because they belong in different places.
 *
 * The `@font-face` is hoisted OUT of the cascade layer. It is a font registration, not a style
 * declaration — it matches no element and so cannot outrank anything a host page declares, while
 * inside a layer its behaviour is a spec corner nothing else here depends on. The rules that DO
 * match elements stay layered, so an embedding app's own icon CSS still wins.
 *
 * The `src:` is rewritten to a single inlined woff2. Font Awesome ships `url(../webfonts/…)`, which
 * on a customer's page resolves against THEIR document and 404s; the ttf fallback is dropped rather
 * than inlined, since woff2 has been baseline for years and carrying a second copy of every glyph
 * would double the cost of the only asset here big enough to notice.
 */
function readFontAwesome() {
    const read = (file) => readFileSync(resolvePackageFile(FONT_AWESOME.package, file), 'utf8');
    const core = read(FONT_AWESOME.core);
    const style = read(FONT_AWESOME.style);

    const fontFace = FONT_FACE_RE.exec(style);
    if (fontFace === null) {
        throw new Error(
            `${FONT_AWESOME.package}/${FONT_AWESOME.style} no longer contains an @font-face block. Font `
            + `Awesome restructured its CSS — re-check which file carries the face before updating this.`,
        );
    }
    if (!FONT_SRC_RE.test(fontFace[0])) {
        throw new Error(
            `${FONT_AWESOME.package}/${FONT_AWESOME.style}: the @font-face carries no \`src:\` to inline. `
            + `Without the rewrite the widget would request ../webfonts/ from the EMBEDDING page and 404.`,
        );
    }

    const woff2 = readFileSync(resolvePackageFile(FONT_AWESOME.package, FONT_AWESOME.font)).toString('base64');
    const inlined = fontFace[0].replace(
        FONT_SRC_RE,
        () => `src:url(data:font/woff2;base64,${woff2}) format("woff2")`,
    );

    assertRenderedIconsAreCovered(core);
    // The face is removed from the layered half so it is emitted exactly once, unlayered.
    return { fontFace: inlined, layered: `${core}\n${style.replace(FONT_FACE_RE, '')}` };
}

/**
 * Fails the build when MJ renders an icon this vendored font does not carry.
 *
 * Font Awesome FREE is a subset of Pro, so an MJ upgrade can introduce a perfectly valid class name
 * that resolves to nothing here — and a missing glyph is invisible in every automated check short of
 * rendering it. Coverage is "the core stylesheet defines a rule for this class", which admits both
 * glyph mappings (`.fa-microphone{--fa:…}`) and utilities (`.fa-fw`, `.fa-2x`), so a new utility does
 * not fail the build while a genuinely absent glyph does.
 */
function assertRenderedIconsAreCovered(coreCss) {
    const surfaces = [
        ...MJ_ICON_SURFACES.map(surface => ({
            label: `${surface.package}/${surface.file}`,
            text: readFileSync(resolvePackageFile(surface.package, surface.file), 'utf8'),
        })),
        ...LOCAL_ICON_SURFACES.map(file => ({ label: file, text: readFileSync(join(HERE, file), 'utf8') })),
    ];
    for (const surface of surfaces) {
        const rendered = [...new Set(surface.text.match(FA_CLASS_RE) ?? [])];
        if (rendered.length === 0) {
            throw new Error(
                `${surface.label} renders no \`fa-*\` classes at all. Either the surface moved or it stopped using `
                + `Font Awesome — either way this guard is now blind and the vendored font may be dead weight. `
                + `Re-check the surface before updating this.`,
            );
        }
        const missing = rendered.filter(name => !new RegExp(`\\.${name}[{,:]`).test(coreCss));
        if (missing.length > 0) {
            throw new Error(
                `Font Awesome Free ${FONT_AWESOME.package} carries no rule for ${missing.join(', ')}, which `
                + `${surface.label} renders. These are most likely Pro-only icons: the control would ship `
                + `blank, exactly the defect this vendoring fixes. Check the icon choice or the FA edition.`,
            );
        }
    }
}

function buildCss() {
    const sources = readSources();
    const layered = `@layer ${LAYER} {\n`
        + sources.map(source => `/* ---- ${source.label} — ${source.why} ---- */\n${source.scss}`).join('\n')
        + '\n}\n';
    const { css: mjCss } = compileString(layered, { style: 'compressed' });

    // Font Awesome is concatenated RAW rather than joined to the SCSS above, because `compileString`
    // re-encodes the `\fXXX` escapes that FA 6's `--fa: "\f130"` values are made of — and a mangled
    // codepoint renders a blank box, the very symptom being fixed. It is already minified.
    const fontAwesome = readFontAwesome();
    const css = `${fontAwesome.fontFace}\n@layer ${LAYER}{${fontAwesome.layered}}\n${mjCss}`;

    const missing = REQUIRED_OUTPUT.filter(needle => !css.includes(needle));
    if (missing.length > 0) {
        throw new Error(
            `the compiled widget style layer is missing ${missing.join(', ')} — an upstream MJ stylesheet ` +
            `moved or emptied out. Fix the source list rather than shipping an unstyled widget.`,
        );
    }
    const header = `/* GENERATED by scripts/build-widget-global-styles.mjs — do not edit.\n`
        + `   Compiled from:\n`
        + sources.map(source => `     • ${source.label}\n`).join('')
        + `     • ${FONT_AWESOME.package}/${FONT_AWESOME.core} + ${FONT_AWESOME.style} — MJ's fa-* icons\n`
        + `     • ${FONT_AWESOME.package}/${FONT_AWESOME.font} — inlined as a data: URI\n`
        + `   Layered into @layer ${LAYER} so an embedding page's own styles win; the @font-face is\n`
        + `   deliberately unlayered (it registers a family, it does not style anything). */\n`;
    return header + css + '\n';
}

const css = buildCss();
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, css, 'utf8');
console.log(`widget global style layer: ${(css.length / 1024).toFixed(1)} kB → ${OUTPUT_FILE}`);
