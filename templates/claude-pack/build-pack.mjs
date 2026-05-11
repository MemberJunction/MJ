// build-pack.mjs — generates templates/claude-pack/dist/v{MAJOR}/ from sources.
//
// Algorithm (see plans/claude-install-pack.md §5.2):
//   1. Discover versions/v{N}/ folders (or use --major <N>)
//   2. For each major:
//      - read PACK_VERSION
//      - concat core/*.md → .claude/mj/core.md
//      - copy versions/v{N}/overlay.md → .claude/mj/v{N}.md
//      - render CLAUDE.md.template and settings.template.json
//      - emit VERSION, REMOTE.md, README.md, MANIFEST.json
//      - copy commands/ and skills/ verbatim
//      - atomic swap: write to dist/v{N}.tmp/, then rename
//   3. Print a summary table per major version
//
// All file output is LF-normalized and contains no time-of-build markers, so
// committed dist/ is byte-identical across runs and platforms — that's what
// makes the `git diff --exit-code` CI gate work. The pack version itself is
// the content fingerprint.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_ROOT = __dirname;
const REPO_ROOT = path.resolve(PACK_ROOT, '..', '..');
const SEPARATOR = '\n\n---\n\n';
const REMOTE_URL_PREFIX_BASE =
    'https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist';

// -----------------------------------------------------------------------------
// CLI entry
// -----------------------------------------------------------------------------

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const majors = await resolveMajors(args.major);
    for (const major of majors) {
        await buildOne(major);
    }
}

function parseArgs(argv) {
    const out = { major: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--major') {
            out.major = String(argv[++i] ?? '').replace(/^v/, '');
        }
    }
    return out;
}

async function resolveMajors(explicit) {
    if (explicit) return [explicit];
    const versionsDir = path.join(PACK_ROOT, 'versions');
    const entries = await fs.readdir(versionsDir, { withFileTypes: true });
    const majors = entries
        .filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))
        .map((e) => e.name.slice(1));
    if (majors.length === 0) {
        throw new Error(`no versions/v{N}/ folders found under ${versionsDir}`);
    }
    return majors;
}

// -----------------------------------------------------------------------------
// Per-major build
// -----------------------------------------------------------------------------

async function buildOne(major) {
    const ctx = await makeBuildContext(major);
    console.log(`\n=== claude-pack build: v${major} (${ctx.packVersion}) ===`);

    const tmpDir = path.join(PACK_ROOT, 'dist', `v${major}.tmp`);
    const finalDir = path.join(PACK_ROOT, 'dist', `v${major}`);

    await rmrf(tmpDir);
    await fs.mkdir(tmpDir, { recursive: true });

    const manifest = await writePackContents(tmpDir, ctx);
    await atomicSwap(tmpDir, finalDir);

    printSummary(ctx, manifest);
}

async function makeBuildContext(major) {
    const versionDir = path.join(PACK_ROOT, 'versions', `v${major}`);
    const packVersionRaw = await fs.readFile(path.join(versionDir, 'PACK_VERSION'), 'utf8');
    const packVersion = packVersionRaw.trim();
    const versionMajor = packVersion.split('.')[0];
    if (versionMajor !== major) {
        throw new Error(
            `versions/v${major}/PACK_VERSION says "${packVersion}" — major component must match folder name`
        );
    }
    return {
        major,
        packVersion,
        remoteUrlPrefix: `${REMOTE_URL_PREFIX_BASE}/v${major}/`,
    };
}

// -----------------------------------------------------------------------------
// Content assembly
// -----------------------------------------------------------------------------

async function writePackContents(distDir, ctx) {
    const coreMd = await concatCoreFiles();
    const overlayMd = await fs.readFile(
        path.join(PACK_ROOT, 'versions', `v${ctx.major}`, 'overlay.md'),
        'utf8'
    );
    const claudeMd = await renderTemplate(path.join(PACK_ROOT, 'CLAUDE.md.template'), ctx);
    const settingsJson = await renderTemplate(
        path.join(PACK_ROOT, 'settings.template.json'),
        ctx
    );

    await writeMjBundle(distDir, ctx, coreMd, overlayMd);
    await writeRootAndSettings(distDir, claudeMd, settingsJson);
    await copyOptionalDirs(distDir);

    const manifest = await buildManifest(distDir, ctx);
    await writeLfFile(
        path.join(distDir, '.claude', 'mj', 'MANIFEST.json'),
        JSON.stringify(manifest, null, 2) + '\n'
    );
    return manifest;
}

async function concatCoreFiles() {
    const coreDir = path.join(PACK_ROOT, 'core');
    const entries = await fs.readdir(coreDir);
    const mdFiles = entries.filter((n) => n.endsWith('.md')).sort();
    if (mdFiles.length === 0) {
        throw new Error(`no core/*.md files found under ${coreDir}`);
    }
    const parts = [];
    for (const name of mdFiles) {
        const raw = await fs.readFile(path.join(coreDir, name), 'utf8');
        parts.push(normalizeMarkdown(raw));
    }
    return parts.join(SEPARATOR) + '\n';
}

function normalizeMarkdown(text) {
    // LF line endings, strip trailing whitespace per line, drop trailing blank lines.
    return text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n+$/, '');
}

async function renderTemplate(file, ctx) {
    const raw = await fs.readFile(file, 'utf8');
    return raw
        .replace(/\r\n/g, '\n')
        .replaceAll('{{PACK_VERSION}}', ctx.packVersion)
        .replaceAll('{{MJ_MAJOR}}', ctx.major)
        .replaceAll('{{REMOTE_URL_PREFIX}}', ctx.remoteUrlPrefix);
}

// -----------------------------------------------------------------------------
// Output writers
// -----------------------------------------------------------------------------

async function writeMjBundle(distDir, ctx, coreMd, overlayMd) {
    const mjDir = path.join(distDir, '.claude', 'mj');
    await fs.mkdir(mjDir, { recursive: true });
    await writeLfFile(path.join(mjDir, 'core.md'), coreMd);
    await writeLfFile(path.join(mjDir, `v${ctx.major}.md`), overlayMd);
    await writeLfFile(path.join(mjDir, 'VERSION'), `${ctx.packVersion}\n`);
    await writeLfFile(path.join(mjDir, 'REMOTE.md'), makeRemoteMd(ctx));
    await writeLfFile(path.join(mjDir, 'README.md'), makeMjReadme(ctx));
}

async function writeRootAndSettings(distDir, claudeMd, settingsJson) {
    await writeLfFile(path.join(distDir, 'CLAUDE.md'), claudeMd);
    const claudeDir = path.join(distDir, '.claude');
    await fs.mkdir(claudeDir, { recursive: true });
    await writeLfFile(path.join(claudeDir, 'settings.json'), settingsJson);
}

async function copyOptionalDirs(distDir) {
    const claudeDir = path.join(distDir, '.claude');
    await copyDirVerbatim(path.join(PACK_ROOT, 'commands'), path.join(claudeDir, 'commands'));
    await copyDirVerbatim(path.join(PACK_ROOT, 'skills'), path.join(claudeDir, 'skills'));
}

async function copyDirVerbatim(src, dest) {
    if (!(await pathExists(src))) return;
    const entries = await fs.readdir(src, { withFileTypes: true });
    const realFiles = entries.filter((e) => e.name !== '.gitkeep');
    if (realFiles.length === 0) return;
    await fs.mkdir(dest, { recursive: true });
    for (const entry of realFiles) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDirVerbatim(srcPath, destPath);
        } else if (entry.isFile()) {
            const content = await fs.readFile(srcPath);
            await fs.writeFile(destPath, content);
        }
    }
}

// -----------------------------------------------------------------------------
// Generated content
// -----------------------------------------------------------------------------

function makeRemoteMd(ctx) {
    const meta = {
        packVersion: ctx.packVersion,
        mjMajor: ctx.major,
        remoteUrlPrefix: ctx.remoteUrlPrefix,
        packVersionUrl: `${ctx.remoteUrlPrefix}.claude/mj/VERSION`,
        manifestUrl: `${ctx.remoteUrlPrefix}.claude/mj/MANIFEST.json`,
    };
    return [
        '<!--',
        JSON.stringify(meta, null, 2),
        '-->',
        '',
        `# MJ Claude Pack — Remote Metadata (v${ctx.major})`,
        '',
        `- **Pack version:** \`${ctx.packVersion}\``,
        `- **MJ major:** v${ctx.major}`,
        `- **Remote URL prefix:** ${ctx.remoteUrlPrefix}`,
        `- **VERSION file:** ${ctx.remoteUrlPrefix}.claude/mj/VERSION`,
        `- **MANIFEST file:** ${ctx.remoteUrlPrefix}.claude/mj/MANIFEST.json`,
        '',
        '`mj update:claude` reads this file to learn where to fetch updates from',
        'and to verify checksums against the manifest.',
        '',
    ].join('\n');
}

function makeMjReadme(ctx) {
    return [
        `# .claude/mj/ — MemberJunction-managed bundle`,
        '',
        `This folder is **fully managed** by the MJ Claude Pack. Every file in here`,
        `is regenerated when you run \`mj update:claude\`, so any hand-edits will be`,
        `lost.`,
        '',
        `If you need to add your own guidance for Claude, edit the section below the`,
        `\`<!-- MJ-MANAGED:CLAUDE-PACK END -->\` marker in your repo-root \`CLAUDE.md\``,
        `instead. That area is yours.`,
        '',
        `## What's in here`,
        '',
        `| File | Purpose |`,
        `|---|---|`,
        `| \`core.md\`        | Cross-version MJ guidance, concatenated from \`core/*.md\` in the pack source |`,
        `| \`v${ctx.major}.md\`           | MJ v${ctx.major}-specific overlay |`,
        `| \`VERSION\`        | Pack semver (currently \`${ctx.packVersion}\`) |`,
        `| \`REMOTE.md\`      | Pointers to the upstream pack source for self-update |`,
        `| \`MANIFEST.json\`  | sha256 checksum of every managed file in this pack |`,
        '',
        `Pack source: https://github.com/MemberJunction/MJ/tree/main/templates/claude-pack`,
        '',
    ].join('\n');
}

// -----------------------------------------------------------------------------
// Manifest + checksums
// -----------------------------------------------------------------------------

async function buildManifest(distDir, ctx) {
    const files = [];
    await collectFiles(distDir, distDir, files);
    files.sort();
    const fileEntries = [];
    for (const relPath of files) {
        if (relPath.endsWith('MANIFEST.json')) continue; // self-reference, skipped
        const abs = path.join(distDir, relPath);
        const buf = await fs.readFile(abs);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        fileEntries.push({
            path: relPath.split(path.sep).join('/'),
            bytes: buf.length,
            sha256,
        });
    }
    return {
        packVersion: ctx.packVersion,
        mjMajor: ctx.major,
        remoteUrlPrefix: ctx.remoteUrlPrefix,
        files: fileEntries,
    };
}

async function collectFiles(root, dir, out) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await collectFiles(root, abs, out);
        } else if (entry.isFile()) {
            out.push(path.relative(root, abs));
        }
    }
}

// -----------------------------------------------------------------------------
// Filesystem helpers
// -----------------------------------------------------------------------------

async function writeLfFile(filePath, content) {
    const normalized = String(content).replace(/\r\n/g, '\n');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, normalized, 'utf8');
}

async function atomicSwap(tmpDir, finalDir) {
    await rmrf(finalDir);
    await fs.mkdir(path.dirname(finalDir), { recursive: true });
    await fs.rename(tmpDir, finalDir);
}

async function rmrf(p) {
    await fs.rm(p, { recursive: true, force: true });
}

async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

function printSummary(ctx, manifest) {
    const totalBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
    console.log(`  pack version : ${ctx.packVersion}`);
    console.log(`  MJ major     : v${ctx.major}`);
    console.log(`  files        : ${manifest.files.length}`);
    console.log(`  total bytes  : ${totalBytes.toLocaleString('en-US')}`);
    console.log(`  output       : templates/claude-pack/dist/v${ctx.major}/`);
}

main().catch((err) => {
    console.error('\nclaude-pack build failed:', err.stack ?? err.message ?? err);
    process.exit(1);
});
