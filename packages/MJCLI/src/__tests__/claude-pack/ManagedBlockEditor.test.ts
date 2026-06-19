import { describe, it, expect } from 'vitest';
import {
    parseManagedBlock,
    rewriteManagedBlock,
    wrapWithManagedBlock,
    ManagedBlockError,
} from '../../lib/claude-pack/ManagedBlockEditor.js';

const START = '<!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 mj-major=5 -->';
const END = '<!-- MJ-MANAGED:CLAUDE-PACK END -->';

describe('parseManagedBlock', () => {
    it('extracts before, body, after, and attrs', () => {
        const content = `Hello

${START}
managed body line 1
managed body line 2
${END}

User notes here.
`;
        const block = parseManagedBlock(content);
        expect(block).not.toBeNull();
        expect(block!.before).toBe('Hello\n\n');
        expect(block!.body).toContain('managed body line 1');
        expect(block!.body).toContain('managed body line 2');
        expect(block!.after).toContain('User notes here.');
        expect(block!.attrs).toEqual({ version: '5.1.0', 'mj-major': '5' });
    });

    it('returns null when no markers are present', () => {
        expect(parseManagedBlock('Just user content, no markers.')).toBeNull();
    });

    it('returns null on empty content', () => {
        expect(parseManagedBlock('')).toBeNull();
    });

    it('throws when only START marker is present', () => {
        expect(() => parseManagedBlock(`${START}\nfoo\n`)).toThrow(ManagedBlockError);
    });

    it('throws when only END marker is present', () => {
        expect(() => parseManagedBlock(`foo\n${END}\n`)).toThrow(ManagedBlockError);
    });

    it('throws when END precedes START', () => {
        expect(() => parseManagedBlock(`${END}\n${START}\n`)).toThrow(ManagedBlockError);
    });

    it('throws when multiple START markers exist', () => {
        const content = `${START}\nbody\n${END}\n${START}\nagain\n${END}\n`;
        expect(() => parseManagedBlock(content)).toThrow(ManagedBlockError);
    });

    it('parses attrs-less START marker', () => {
        const content = `<!-- MJ-MANAGED:CLAUDE-PACK START -->\nbody\n${END}\n`;
        const block = parseManagedBlock(content);
        expect(block!.attrs).toEqual({});
    });

    it('tolerates extra whitespace inside the marker', () => {
        const content = `<!--   MJ-MANAGED:CLAUDE-PACK   START   v=1.0  -->\nbody\n<!--  MJ-MANAGED:CLAUDE-PACK   END   -->\n`;
        const block = parseManagedBlock(content);
        expect(block).not.toBeNull();
        expect(block!.attrs).toEqual({ v: '1.0' });
    });

    it('handles markers at the very start of the file (empty before)', () => {
        const content = `${START}\nbody\n${END}\nafter\n`;
        const block = parseManagedBlock(content);
        expect(block!.before).toBe('');
        expect(block!.after).toBe('\nafter\n');
    });

    it('handles markers at the very end of the file (empty after)', () => {
        const content = `before\n${START}\nbody\n${END}`;
        const block = parseManagedBlock(content);
        expect(block!.before).toBe('before\n');
        expect(block!.after).toBe('');
    });

    it('skips malformed attribute pairs silently', () => {
        const content = `<!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 garbage =bad good=ok -->\nbody\n${END}`;
        const block = parseManagedBlock(content);
        expect(block!.attrs).toEqual({ version: '5.1.0', good: 'ok' });
    });
});

describe('rewriteManagedBlock', () => {
    it('replaces the body and updates the START marker attrs', () => {
        const original = `before
${START}
old body
${END}
after`;
        const result = rewriteManagedBlock(original, '\nnew body\n', {
            version: '5.2.0',
            'mj-major': '5',
        });
        expect(result).toContain('version=5.2.0');
        expect(result).toContain('new body');
        expect(result).not.toContain('old body');
        expect(result.startsWith('before\n')).toBe(true);
        expect(result.endsWith('\nafter')).toBe(true);
    });

    it('preserves the user content before and after exactly', () => {
        const before = '# My project\n\n## Setup\n\nblah blah\n';
        const after = '\n## Notes\n\nproject-specific notes\n';
        const original = `${before}${START}\nbody\n${END}${after}`;
        const result = rewriteManagedBlock(original, '\nfresh\n', { version: '5.2.0' });
        expect(result.startsWith(before)).toBe(true);
        expect(result.endsWith(after)).toBe(true);
    });

    it('throws when there is no managed block to rewrite', () => {
        expect(() => rewriteManagedBlock('no markers here', 'body', {})).toThrow(ManagedBlockError);
    });
});

describe('wrapWithManagedBlock', () => {
    it('wraps empty content as just the block with a trailing newline', () => {
        const result = wrapWithManagedBlock('', '\nbody\n', { version: '5.1.0' });
        expect(result).toContain('MJ-MANAGED:CLAUDE-PACK START version=5.1.0');
        expect(result).toContain('body');
        expect(result).toContain('MJ-MANAGED:CLAUDE-PACK END');
    });

    it('prepends the block above existing content with a blank line separator', () => {
        const existing = '# user content\nmore stuff\n';
        const result = wrapWithManagedBlock(existing, '\nbody\n', { version: '5.1.0' });
        // managed block first, then user content
        const startIdx = result.indexOf('CLAUDE-PACK START');
        const endIdx = result.indexOf('CLAUDE-PACK END');
        const userIdx = result.indexOf('user content');
        expect(startIdx).toBeGreaterThan(-1);
        expect(endIdx).toBeGreaterThan(startIdx);
        expect(userIdx).toBeGreaterThan(endIdx);
    });

    it('round-trips: wrap → parse extracts back the body and attrs', () => {
        const wrapped = wrapWithManagedBlock('user', '\n## block contents\n', {
            version: '5.1.0',
            'mj-major': '5',
        });
        const parsed = parseManagedBlock(wrapped);
        expect(parsed).not.toBeNull();
        expect(parsed!.body).toContain('block contents');
        expect(parsed!.attrs).toEqual({ version: '5.1.0', 'mj-major': '5' });
    });
});
