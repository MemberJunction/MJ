#!/usr/bin/env node
/**
 * Copies the built element bundles into ./bundles/ and writes bundles/manifest.json for index.html.
 *
 * Nothing here builds anything. Build each element in its own repo first (see README.md), then run this
 * from the folder: `node sync-bundles.mjs`. Bundles are git-ignored; only this script, the page and the
 * findings are committed.
 *
 * MJ_ROOT defaults to the MJ repo this folder sits in (two levels up). The Open App repos are located by the env vars
 * BIZAPPS_FORMS, BIZAPPS_ORDERS and BIZAPPS_CALIBER, each the root of a clone that has been built (README.md).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mjRoot = process.env.MJ_ROOT ?? resolve(here, '../..');
const out = join(here, 'bundles');

/**
 * One row per element. `from` is the built output folder in that element's repo; `entry` is the file the page
 * loads; `module` says whether the entry is an ES module (<script type="module">) or a classic script; `lazy`
 * lists further files the page can import on demand for the singleton check (resolved by glob on the hash).
 */
const ELEMENTS = [
    {
        tag: 'mj-realtime-widget',
        repo: 'MJ',
        package: '@memberjunction/ng-realtime-widget',
        from: join(mjRoot, 'packages/Angular/Generic/realtime-widget/dist/element'),
        entry: 'mj-realtime-widget.js',
        module: false,
        metafile: 'meta.json',
        lazy: { session: 'mj-realtime-widget-session.js' },
    },
    {
        tag: 'mj-support-widget',
        repo: 'MJ',
        package: '@memberjunction/realtime-widget',
        // The package's own `bundle:min` recipe plus `--metafile`; see README.md. No keep-names, as published.
        from: join(mjRoot, 'packages/Web/RealtimeWidget/dist/embed-min'),
        entry: 'mj-widget.js',
        module: true,
        metafile: 'meta.json',
        lazy: { transport: /^chunks\/runtime-widget-transport-[A-Z0-9]+\.js$/ },
    },
    {
        tag: 'mj-support-widget',
        variant: 'keepnames',
        repo: 'MJ',
        package: '@memberjunction/realtime-widget',
        // Same recipe with `--keep-names`, so the singleton keys match the realtime bundle's. See README.md.
        from: join(mjRoot, 'packages/Web/RealtimeWidget/dist/embed-min-keepnames'),
        entry: 'mj-widget.js',
        module: true,
        metafile: 'meta.json',
        lazy: { transport: /^chunks\/runtime-widget-transport-[A-Z0-9]+\.js$/ },
    },
    {
        tag: 'mj-form',
        repo: 'bizapps-forms',
        package: '@mj-biz-apps/forms-ng',
        // bizapps-forms packages/Angular/scripts/build-widget.mjs: an IIFE at dist/widget/mj-form.js. The script keeps esbuild's
        // metafile in memory for its own guard and does not write it; README.md says how to produce mj-form.js.meta.json.
        from: process.env.BIZAPPS_FORMS ? join(process.env.BIZAPPS_FORMS, 'packages/Angular/dist/widget') : '',
        entry: 'mj-form.js',
        module: false,
        metafile: 'mj-form.js.meta.json',
        lazy: {},
    },
    {
        tag: 'mj-orders-checkout',
        repo: 'bizapps-orders',
        package: '@mj-biz-apps/orders-ng',
        // bizapps-orders packages/Angular/scripts/build-checkout-element.mjs: an ES module at dist/checkout-element/main.js. The script
        // requests no metafile; README.md says how to produce main.js.meta.json.
        from: process.env.BIZAPPS_ORDERS ? join(process.env.BIZAPPS_ORDERS, 'packages/Angular/dist/checkout-element') : '',
        entry: 'main.js',
        module: true,
        metafile: 'main.js.meta.json',
        lazy: {},
    },
    {
        tag: 'caliber-widget',
        repo: 'bizapps-caliber',
        package: '@mj-biz-apps/caliber-ng',
        // bizapps-caliber packages/Angular/scripts/build-widget.mjs: an IIFE at dist/widget/caliber-widget.js with dist/widget/meta.json.
        from: process.env.BIZAPPS_CALIBER ? join(process.env.BIZAPPS_CALIBER, 'packages/Angular/dist/widget') : '',
        entry: 'caliber-widget.js',
        module: false,
        metafile: 'meta.json',
        lazy: {},
    },
];

mkdirSync(out, { recursive: true });
const manifest = [];
for (const element of ELEMENTS) {
    const folder = element.variant ? `${element.tag}--${element.variant}` : element.tag;
    const dest = join(out, folder);
    const present = element.from !== '' && existsSync(join(element.from, element.entry));
    rmSync(dest, { recursive: true, force: true });
    const row = { tag: element.tag, variant: element.variant ?? null, repo: element.repo, package: element.package, folder, entry: present ? `bundles/${folder}/${element.entry}` : null, module: element.module, metafile: null, lazy: {}, source: element.from || null };
    if (present) {
        // Source maps are left behind on purpose: they are not part of what a host page downloads.
        cpSync(element.from, dest, { recursive: true, filter: (src) => !src.endsWith('.map') });
        if (existsSync(join(dest, element.metafile))) {
            row.metafile = `bundles/${folder}/${element.metafile}`;
        }
        for (const [name, pattern] of Object.entries(element.lazy)) {
            const files = listFiles(dest).map((f) => f.slice(dest.length + 1));
            const hit = typeof pattern === 'string' ? files.find((f) => f === pattern) : files.find((f) => pattern.test(f));
            row.lazy[name] = hit ? `bundles/${folder}/${hit}` : null;
        }
        console.log(`copied ${folder} from ${element.from}`);
    } else {
        console.log(`missing ${folder}: build it in ${element.repo} first (see README.md)${element.from ? ` [looked in ${element.from}]` : ''}`);
    }
    manifest.push(row);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), elements: manifest }, null, 2));

// The page's own chrome is styled with MJ's semantic tokens (--mj-bg-page, --mj-text-primary, ...). They are compiled
// here from the one source every MJ surface uses, ng-shared-generic's _tokens.scss, not copied by hand, so the page
// cannot drift from the catalog. sass comes from the realtime widget package, which already depends on it for the
// same reason (scripts/build-global-styles.mjs). Light values on :root, dark on [data-theme="dark"].
const tokensScss = join(mjRoot, 'packages/Angular/Generic/shared/dist/lib/_tokens.scss');
const sassBin = join(mjRoot, 'packages/Angular/Generic/realtime-widget/node_modules/.bin/sass');
if (existsSync(tokensScss) && existsSync(sassBin)) {
    execFileSync(sassBin, ['--no-source-map', tokensScss, join(out, 'tokens.css')], { stdio: 'inherit' });
    console.log('compiled bundles/tokens.css from ng-shared-generic');
} else {
    console.log(`tokens.css not compiled: needs ${tokensScss} (build ng-shared-generic) and ${sassBin}; the page falls back to its own fallback values`);
}
console.log(`wrote bundles/manifest.json`);

function listFiles(dir) {
    const result = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            result.push(...listFiles(full));
        } else {
            result.push(full);
        }
    }
    return result;
}
