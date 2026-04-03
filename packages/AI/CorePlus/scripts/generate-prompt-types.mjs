#!/usr/bin/env node
/**
 * generate-prompt-types.mjs
 *
 * Post-build script that generates LLM-optimized type reference files from TypeScript sources.
 * These generated markdown files are designed to be {@include}'d in agent prompt templates
 * instead of raw TS source files, reducing token usage by ~60%.
 *
 * Strips: JSDoc blocks, @example sections, file headers, developer-oriented documentation
 * Keeps:  Interface shapes, property types, brief inline comments, union member annotations
 *
 * Output: packages/AI/CorePlus/generated-for-prompt/<file>.generated-for-prompt.md
 * Run:    automatically via postbuild hook, or manually: node scripts/generate-prompt-types.mjs
 */

import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(PACKAGE_ROOT, 'src');
const OUTPUT_DIR = resolve(PACKAGE_ROOT, 'generated-for-prompt');

/**
 * Configuration for each source file to process.
 * `supplementary` adds extra context below the type block — used for non-obvious patterns
 * that aren't expressible in the type signature alone.
 */
const FILE_CONFIGS = [
    {
        src: 'response-forms.ts',
        supplementary: null,
    },
    {
        src: 'ui-commands.ts',
        supplementary: null,
    },
    {
        src: 'agent-payload-change-request.ts',
        supplementary: [
            'Key patterns for `updateElements`:',
            '- Use `{}` as placeholder for unchanged array items — only include properties being changed',
            '- Use `"__DELETE__"` to remove properties or array elements at any nesting depth',
            '- Nest objects to target deep properties surgically (e.g., `{ user: { email: "new@x.com" } }`)',
            '- **Arrays merge positionally** — a shorter update array does NOT remove trailing elements. To shrink an array, use `replaceElements` instead.',
            '',
            '`replaceElements` replaces the entire target object/array. Use when providing a complete replacement rather than surgical updates. **Use for primitive arrays** (e.g., `string[]`) when you want to set the exact final value.',
            '`removeElements` marks top-level items for removal by setting their value to `"__DELETE__"`.',
        ].join('\n'),
    },
    {
        src: 'foreach-operation.ts',
        supplementary: null,
    },
    {
        src: 'while-operation.ts',
        supplementary: null,
    },
    {
        src: 'agent-scratchpad.ts',
        supplementary: [
            'The scratchpad is private working memory for loop agents — never shared with parent or sub-agents.',
            'Use simple sequential IDs for tasks (t1, t2, t3). The full task list is injected every turn.',
            'Notes have no hard character limit but the agent should keep them concise (injected every turn = token cost).',
            'Task list is capped at a configurable max (default 50). Completed tasks are auto-pruned when over limit.',
        ].join('\n'),
    },
];

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Extract a one-line description from the JSDoc comment attached to `node`.
 * Returns null if no useful brief description is found.
 */
function getBriefDoc(node, sourceFile) {
    const fullText = sourceFile.getFullText();
    const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (!ranges) return null;

    for (const range of ranges) {
        const raw = fullText.slice(range.pos, range.end);
        if (!raw.startsWith('/**')) continue;

        const lines = raw
            .replace(/^\/\*\*\s*/, '')
            .replace(/\s*\*\/$/, '')
            .split('\n')
            .map(l => l.replace(/^\s*\*\s?/, '').trim())
            .filter(l => l && !l.startsWith('@'));

        if (lines.length === 0) continue;

        let brief = lines[0];
        if (brief.length > 100) {
            // Truncate at word boundary
            const cutoff = brief.lastIndexOf(' ', 97);
            brief = brief.slice(0, cutoff >= 50 ? cutoff : 97) + '...';
        }
        return brief;
    }
    return null;
}

/**
 * Extract a trailing `// comment` that appears on the same line after `node`.
 * Falls back to scanning the rest of the line when the TS scanner stops at
 * intervening punctuation like `;` on the last union member.
 */
function getTrailingComment(node, sourceFile) {
    const fullText = sourceFile.getFullText();

    // Try the standard TS trailing-comment API first
    const ranges = ts.getTrailingCommentRanges(fullText, node.getEnd());
    if (ranges && ranges.length > 0) {
        const raw = fullText.slice(ranges[0].pos, ranges[0].end);
        if (raw.startsWith('//')) {
            return raw.replace(/^\/\/\s*/, '').trim();
        }
    }

    // Fallback: scan rest of line for a // comment (handles `;  // comment` case)
    const nodeEnd = node.getEnd();
    const lineEnd = fullText.indexOf('\n', nodeEnd);
    const restOfLine = fullText.slice(nodeEnd, lineEnd >= 0 ? lineEnd : fullText.length);
    const match = restOfLine.match(/\/\/\s*(.*)/);
    if (match) {
        return match[1].trim();
    }

    return null;
}

// ---------------------------------------------------------------------------
// Emitters — produce clean TypeScript text for each declaration kind
// ---------------------------------------------------------------------------

/**
 * Emit a property's type, recursing into nested type literals to strip their JSDoc.
 */
function emitPropertyType(typeNode, sourceFile, indent) {
    if (ts.isTypeLiteralNode(typeNode)) {
        return emitTypeLiteral(typeNode, sourceFile, indent);
    }
    return typeNode.getText(sourceFile);
}

/**
 * Emit a TypeLiteral (anonymous object type) with brief inline comments.
 */
function emitTypeLiteral(node, sourceFile, indent) {
    let result = '{\n';
    for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
            const name = member.name.getText(sourceFile);
            const opt = member.questionToken ? '?' : '';
            const innerIndent = indent + '    ';
            const typeText = member.type
                ? emitPropertyType(member.type, sourceFile, innerIndent)
                : 'unknown';
            const brief = getBriefDoc(member, sourceFile);
            const comment = brief ? `  // ${brief}` : '';
            result += `${innerIndent}${name}${opt}: ${typeText};${comment}\n`;
        }
    }
    result += `${indent}}`;
    return result;
}

/**
 * Emit a union type, preserving trailing inline comments on members.
 */
function emitUnionType(unionNode, sourceFile) {
    const members = unionNode.types;

    const memberData = members.map(m => ({
        text: m.getText(sourceFile),
        comment: getTrailingComment(m, sourceFile),
    }));

    const hasComments = memberData.some(m => m.comment);

    // Compact single line for small unions without comments
    if (memberData.length <= 2 && !hasComments) {
        return ' ' + memberData.map(m => m.text).join(' | ') + ';';
    }

    // Multiline format
    return (
        '\n' +
        memberData
            .map((m, i) => {
                const semi = i === memberData.length - 1 ? ';' : '';
                const comment = m.comment ? `  // ${m.comment}` : '';
                return `    | ${m.text}${semi}${comment}`;
            })
            .join('\n')
    );
}

/**
 * Emit a clean interface declaration.
 */
function emitInterface(node, sourceFile) {
    const name = node.name.text;
    let result = `interface ${name}`;

    if (node.typeParameters && node.typeParameters.length > 0) {
        result += '<' + node.typeParameters.map(tp => tp.getText(sourceFile)).join(', ') + '>';
    }

    result += ' {\n';

    for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
            const propName = member.name.getText(sourceFile);
            const opt = member.questionToken ? '?' : '';
            const typeText = member.type
                ? emitPropertyType(member.type, sourceFile, '    ')
                : 'unknown';
            const brief = getBriefDoc(member, sourceFile);
            const comment = brief ? `  // ${brief}` : '';
            result += `    ${propName}${opt}: ${typeText};${comment}\n`;
        }
    }

    result += '}';
    return result;
}

/**
 * Emit a clean type alias declaration.
 */
function emitTypeAlias(node, sourceFile) {
    const name = node.name.text;
    let result = `type ${name}`;

    if (node.typeParameters && node.typeParameters.length > 0) {
        result += '<' + node.typeParameters.map(tp => tp.getText(sourceFile)).join(', ') + '>';
    }

    if (ts.isUnionTypeNode(node.type)) {
        result += ' =' + emitUnionType(node.type, sourceFile);
    } else if (ts.isTypeLiteralNode(node.type)) {
        result += ' = ' + emitTypeLiteral(node.type, sourceFile, '') + ';';
    } else {
        result += ' = ' + node.type.getText(sourceFile) + ';';
    }

    return result;
}

// ---------------------------------------------------------------------------
// File processing
// ---------------------------------------------------------------------------

function processFile(config) {
    const filePath = resolve(SRC_DIR, config.src);
    const sourceText = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        config.src,
        sourceText,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
    );

    const declarations = [];

    for (const stmt of sourceFile.statements) {
        if (ts.isInterfaceDeclaration(stmt)) {
            declarations.push(emitInterface(stmt, sourceFile));
        } else if (ts.isTypeAliasDeclaration(stmt)) {
            declarations.push(emitTypeAlias(stmt, sourceFile));
        }
    }

    let md = '```ts\n';
    md += declarations.join('\n\n');
    md += '\n```\n';

    if (config.supplementary) {
        md += '\n' + config.supplementary + '\n';
    }

    return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('Generating prompt-optimized type references...');

    for (const config of FILE_CONFIGS) {
        const outputFile = `${config.src}.generated-for-prompt.md`;
        const outputPath = resolve(OUTPUT_DIR, outputFile);
        const content = processFile(config);
        writeFileSync(outputPath, content, 'utf-8');

        const lineCount = content.split('\n').length;
        const srcPath = resolve(SRC_DIR, config.src);
        const srcLineCount = readFileSync(srcPath, 'utf-8').split('\n').length;
        console.log(`  ${config.src} (${srcLineCount} lines) → ${outputFile} (${lineCount} lines)`);
    }

    console.log('Done. Files written to generated-for-prompt/');
}

main();
