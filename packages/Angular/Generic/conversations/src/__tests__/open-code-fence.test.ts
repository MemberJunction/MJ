/**
 * @fileoverview CloseOpenCodeFence — display-only closing of a fenced code block that a
 * streaming reply has opened but not yet closed, following CommonMark's fence rules.
 */
import { describe, it, expect } from 'vitest';
import { CloseOpenCodeFence } from '../lib/util/open-code-fence';

describe('CloseOpenCodeFence', () => {
    it('returns text without fences unchanged', () => {
        expect(CloseOpenCodeFence('plain **markdown** text')).toBe('plain **markdown** text');
    });

    it('returns empty text unchanged', () => {
        expect(CloseOpenCodeFence('')).toBe('');
    });

    it('leaves balanced fences alone', () => {
        const text = 'intro\n```ts\nconst a = 1;\n```\nafter';
        expect(CloseOpenCodeFence(text)).toBe(text);
    });

    it('closes a fence that is still open', () => {
        expect(CloseOpenCodeFence('intro\n```ts\nconst a = 1;')).toBe('intro\n```ts\nconst a = 1;\n```');
    });

    it('closes the open fence of a later block when the first is balanced', () => {
        const text = '```\none\n```\ntext\n```sql\nSELECT 1';
        expect(CloseOpenCodeFence(text)).toBe(`${text}\n\`\`\``);
    });

    it('does not treat inline backticks as a fence', () => {
        expect(CloseOpenCodeFence('use ``` inline, not a fence')).toBe('use ``` inline, not a fence');
    });

    it('accepts up to three spaces of indentation before a fence', () => {
        expect(CloseOpenCodeFence('- item\n   ```\n   code')).toBe('- item\n   ```\n   code\n```');
    });

    it('treats a four-space-indented line as indented code, not a fence', () => {
        const text = 'literal:\n\n    ```\n    still indented code';
        expect(CloseOpenCodeFence(text)).toBe(text);
    });

    it('closes a tilde fence with tildes', () => {
        expect(CloseOpenCodeFence('~~~\nx = 1')).toBe('~~~\nx = 1\n~~~');
    });

    it('does not let backticks close a tilde block', () => {
        const text = '~~~\n```\ninside the tilde block';
        expect(CloseOpenCodeFence(text)).toBe(`${text}\n~~~`);
    });

    it('does not let a shorter fence close a longer one (a reply explaining markdown)', () => {
        const partial = '````markdown\n```js\nx\n```';
        expect(CloseOpenCodeFence(partial)).toBe(`${partial}\n\`\`\`\``);
        const complete = `${partial}\n\`\`\`\``;
        expect(CloseOpenCodeFence(complete)).toBe(complete);
    });

    it('does not open a backtick fence whose info string contains backticks (prose quoting ```js ... ```)', () => {
        const text = 'Wrap it in ```js ... ``` to run it.\nmore prose';
        expect(CloseOpenCodeFence(text)).toBe(text);
    });

    it('still opens a tilde fence whatever follows it on the line', () => {
        expect(CloseOpenCodeFence('~~~ anything `here`\nbody')).toBe('~~~ anything `here`\nbody\n~~~');
    });

    it('does not let a fence line with an info string close a block', () => {
        const text = '```\nnot closed by this:\n```ts';
        expect(CloseOpenCodeFence(text)).toBe(`${text}\n\`\`\``);
    });
});
