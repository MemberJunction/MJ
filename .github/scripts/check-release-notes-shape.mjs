#!/usr/bin/env node
/**
 * check-release-notes-shape.mjs
 *
 * Verifies the SHAPE of generated release notes — the canonical `releases/v<version>.md`
 * file, and the release PR body, which are produced by two different agents from the same
 * material and must come out the same shape. It says nothing about whether the content is
 * accurate; only a human can judge that.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * The PR body is pasted into Teams verbatim as the release announcement, and most readers
 * there stop after the TL;DR. A run that silently drops or misplaces that section ships an
 * announcement missing the part most people read, and nobody finds out until it is in the
 * channel. The agent's own report that it followed the format is not evidence.
 *
 * ── THE CHECK THAT IS EASY TO GET WRONG ─────────────────────────────────────────
 * "The first `## ` heading is `## TL;DR`" is NOT sufficient. The failure this format is
 * most prone to is the agent writing its OLD unlabelled intro paragraph *and* a TL;DR:
 *
 *     # Field-Level Security, AI Personas, and OpenAI Live realtime
 *     The seventh Edge build of the 6.1 line. Its centrepiece is...   <- stray summary
 *     ## TL;DR
 *
 * The first `## ` there is still the TL;DR, so a heading-order check passes it while the
 * page carries three stacked summaries. The preamble must therefore be checked directly:
 * between the H1 and the first `## `, only blank lines are allowed.
 *
 * A paragraph AFTER the TL;DR bullets is the standing-context line ("Edge builds are
 * prereleases…") and is part of the template — it must not be flagged.
 *
 * Format definition: releases/README.md (the single source; the prompts read it too).
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────
 *   node .github/scripts/check-release-notes-shape.mjs <file> [--min-bytes N]
 */
import { readFileSync } from 'node:fs';

export const DEFAULT_MIN_BYTES = 400;
const TLDR_HEADING = /^##[ \t]+TL;?DR[ \t]*$/i;
const H2 = /^##[ \t]+\S/;

/**
 * @returns {{code: string, message: string}[]} every problem found, empty when well-formed.
 */
export function checkReleaseNotesShape(content, { minBytes = DEFAULT_MIN_BYTES } = {}) {
    const problems = [];
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes < minBytes) {
        problems.push({ code: 'too-thin', message: `only ${bytes} bytes — too thin to publish (minimum ${minBytes}).` });
    }

    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const firstContentIndex = lines.findIndex((l) => l.trim() !== '');
    if (firstContentIndex === -1) {
        problems.push({ code: 'empty', message: 'the file is empty.' });
        return problems;
    }
    if (!/^#[ \t]+\S/.test(lines[firstContentIndex])) {
        problems.push({ code: 'h1', message: `does not open with an H1 summary (found "${lines[firstContentIndex].slice(0, 60)}").` });
    }

    const firstH2Index = lines.findIndex((l) => H2.test(l));
    if (firstH2Index === -1) {
        problems.push({ code: 'sections', message: 'has no `## ` section headings at all.' });
        return problems;
    }

    // Everything between the H1 and the first section must be blank. See the header note:
    // this is the check a heading-order comparison misses.
    const preamble = lines.slice(firstContentIndex + 1, firstH2Index).filter((l) => l.trim() !== '');
    if (preamble.length > 0) {
        problems.push({
            code: 'preamble',
            message:
                'has prose between the H1 and the first section. The TL;DR replaces the old unlabelled ' +
                `intro paragraph — do not write both. Offending line(s): ${preamble.map((l) => JSON.stringify(l.trim().slice(0, 80))).join(', ')}`,
        });
    }

    if (!TLDR_HEADING.test(lines[firstH2Index])) {
        problems.push({
            code: 'tldr-first',
            message: `the first section is "${lines[firstH2Index].trim()}" — it must be "## TL;DR" (see releases/README.md).`,
        });
    }

    return problems;
}

/** [name, shouldFlag, content] — exercised directly by the unit tests. */
export const SELF_TEST_FIXTURES = [
    ['canonical shape', false, '# A release summary here\n\n## TL;DR\n- One.\n- Two.\n\nEdge builds are prereleases.\n\n## Bug Fixes\n- A fix.\n'],
    ['TLDR without the semicolon', false, '# A release summary here\n\n## TLDR\n- One.\n\n## Bug Fixes\n- A fix.\n'],
    ['lowercase tl;dr', false, '# A release summary here\n\n## tl;dr\n- One.\n\n## Bug Fixes\n- A fix.\n'],
    ['standing-context paragraph after the TL;DR is legitimate', false, '# A release summary here\n\n## TL;DR\n- One.\n\nEdge builds are prereleases and never move latest.\n\n## Bug Fixes\n- A fix.\n'],
    ['stray intro paragraph ABOVE the TL;DR', true, '# A release summary here\n\nThe seventh Edge build of the 6.1 line.\n\n## TL;DR\n- One.\n\n## Bug Fixes\n- A fix.\n'],
    ['no TL;DR at all', true, '# A release summary here\n\n## New Features\n- One.\n\n## Bug Fixes\n- A fix.\n'],
    ['TL;DR present but not first', true, '# A release summary here\n\n## New Features\n- One.\n\n## TL;DR\n- Two.\n'],
    ['no H1', true, '## TL;DR\n- One.\n\n## Bug Fixes\n- A fix.\n'],
    ['no sections at all', true, '# A release summary here\n\nJust a paragraph and nothing else.\n'],
    ['H3 TL;DR does not count as the section', true, '# A release summary here\n\n### TL;DR\n- One.\n\n## Bug Fixes\n- A fix.\n'],
];

// ── CLI ─────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
    const args = process.argv.slice(2);
    const file = args.find((a) => !a.startsWith('--'));
    const minIndex = args.indexOf('--min-bytes');
    const minBytes = minIndex === -1 ? DEFAULT_MIN_BYTES : Number(args[minIndex + 1]);

    if (!file) {
        console.error('usage: check-release-notes-shape.mjs <file> [--min-bytes N]');
        process.exit(2);
    }
    let content;
    try {
        content = readFileSync(file, 'utf8');
    } catch (err) {
        console.error(`::error::cannot read ${file}: ${err.message}`);
        process.exit(1);
    }

    const problems = checkReleaseNotesShape(content, { minBytes });
    if (problems.length === 0) {
        console.log(`::notice::${file} is well-formed (${Buffer.byteLength(content, 'utf8')} bytes).`);
        process.exit(0);
    }
    for (const p of problems) console.error(`::error::${file} ${p.message}`);
    console.error(`\n--- ${file} (first 40 lines) ---`);
    console.error(content.split('\n').slice(0, 40).join('\n'));
    process.exit(1);
}
