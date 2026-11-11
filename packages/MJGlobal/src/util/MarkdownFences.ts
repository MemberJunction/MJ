/**
 * Linear-time finders for Markdown code fences. Internal to MJGlobal (not exported from the package
 * index); `CleanJavaScript` and `ParseJSONRecursive` use them in place of fence regexes whose lazy
 * bodies made crafted text cost quadratic time.
 */

/** A fenced block found in a string: the whole block, fences included, and the text between them. */
export interface FencedBlock {
    Whole: string;
    Body: string;
}

const JSON_FENCE_OPEN = '```json';
const FENCE_CLOSE = '\n```';

/**
 * The first ```json block in `str`, matched exactly as `/```json\s*\n([\s\S]*?)\n```/` matched it,
 * but found by index: that regex retries its lazy body from every `json` fence, which is quadratic
 * on text holding many fences and no closing one.
 */
export function FindJsonFence(str: string): FencedBlock | null {
    const lastClose = str.lastIndexOf(FENCE_CLOSE);
    let open = str.indexOf(JSON_FENCE_OPEN);
    while (open !== -1) {
        const block = matchJsonFenceAt(str, open, lastClose);
        if (block) return block;
        open = str.indexOf(JSON_FENCE_OPEN, open + 1);
    }
    return null;
}

/**
 * Matches one ```json fence at `open`. The regex's `\s*\n` lets the body start after any newline in
 * the whitespace that follows the tag and prefers the last one; the run's last newline can itself
 * open the closing fence, in which case the body ends there and starts after the newline before it.
 */
function matchJsonFenceAt(str: string, open: number, lastClose: number): FencedBlock | null {
    let pos = open + JSON_FENCE_OPEN.length;
    let lastNewline = -1;
    let prevNewline = -1;
    while (pos < str.length && /\s/.test(str[pos])) {
        if (str[pos] === '\n') {
            prevNewline = lastNewline;
            lastNewline = pos;
        }
        pos++;
    }
    if (lastNewline === -1) return null;
    if (lastClose > lastNewline) {
        const close = str.indexOf(FENCE_CLOSE, lastNewline + 1);
        return { Whole: str.substring(open, close + FENCE_CLOSE.length), Body: str.substring(lastNewline + 1, close) };
    }
    if (prevNewline !== -1 && lastClose === lastNewline) {
        return { Whole: str.substring(open, lastNewline + FENCE_CLOSE.length), Body: str.substring(prevNewline + 1, lastNewline) };
    }
    return null;
}

/**
 * The trimmed body of every ``` fenced block, each optionally tagged `js` or `javascript` (any case).
 * Matches what `/```(?:js|javascript)?\s*([\s\S]*?)```/gi` matched, found by index: that regex
 * retries its lazy body from every fence, which is quadratic on text with many unclosed fences.
 */
export function ExtractJavaScriptFences(code: string): string[] {
    const fence = '```';
    const blocks: string[] = [];
    let open = code.indexOf(fence);
    while (open !== -1) {
        const bodyStart = open + fence.length + javaScriptFenceTagLength(code, open + fence.length);
        const close = code.indexOf(fence, bodyStart);
        if (close === -1) break;
        blocks.push(code.substring(bodyStart, close).trim());
        open = code.indexOf(fence, close + fence.length);
    }
    return blocks;
}

/** Length of a `javascript` or `js` tag (any case) at `pos`, or 0 when there is none. */
function javaScriptFenceTagLength(code: string, pos: number): number {
    const tag = code.substring(pos, pos + 10).toLowerCase();
    if (tag.startsWith('javascript')) return 10;
    if (tag.startsWith('js')) return 2;
    return 0;
}
