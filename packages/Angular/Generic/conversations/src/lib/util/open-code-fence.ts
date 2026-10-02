/**
 * @fileoverview A streamed reply is rendered while it is still arriving. When the text so far
 * opens a fenced code block that has not closed yet, markdown turns everything after the fence
 * into one code block until the closing fence lands, and the layout flips wholesale on every
 * delta in between. Closing the fence for display keeps the partial render stable; the saved
 * message is never changed.
 *
 * Fences follow CommonMark: three or more backticks or tildes, indented at most three spaces
 * (four is an indented code block, not a fence). An opening fence may carry an info string, but
 * a backtick fence's info string may not contain a backtick, so a prose line quoting ```js ...
 * ``` inline opens nothing. A closing fence is the same character, at least as long as the
 * opener, and nothing else on the line: a `~~~` block is not closed by backticks, and a
 * four-backtick block is not closed by three, which is how a reply that explains markdown is
 * written.
 */

/** A fence line: up to three spaces, the fence, then whatever follows it. */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Returns `text` with a closing fence appended when it ends inside an open fenced block.
 * Text with balanced fences, or none, comes back unchanged.
 */
export function CloseOpenCodeFence(text: string): string {
  const openFence = findOpenFence(text);
  return openFence === null ? text : `${text}\n${openFence}`;
}

/** The fence string still open at the end of `text`, or null when every block has closed. */
function findOpenFence(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split('\n')) {
    const match = FENCE_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, fence, rest] = match;
    if (open === null) {
      if (fence[0] === '~' || !rest.includes('`')) {
        open = fence;
      }
    } else if (rest.trim() === '' && fence[0] === open[0] && fence.length >= open.length) {
      open = null;
    }
  }
  return open;
}
