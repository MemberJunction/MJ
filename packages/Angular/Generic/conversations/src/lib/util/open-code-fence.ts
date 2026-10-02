/**
 * @fileoverview A streamed reply is rendered while it is still arriving. When the text so far
 * opens a fenced code block that has not closed yet, markdown turns everything after the fence
 * into one code block until the closing fence lands, and the layout flips wholesale on every
 * delta in between. Closing the fence for display keeps the partial render stable; the saved
 * message is never changed.
 *
 * Fences follow CommonMark: three or more backticks or tildes, indented at most three spaces
 * (four is an indented code block, not a fence). An opening fence may carry an info string; a
 * closing fence is the same character, at least as long as the opener, and nothing else on the
 * line. A `~~~` block is not closed by backticks, and a four-backtick block is not closed by
 * three — which is exactly how a reply that explains markdown is written.
 */

/** A line that opens a fenced block: the fence, then an optional info string. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
/** A line that can close a fenced block: the fence alone, trailing whitespace allowed. */
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

/**
 * Returns `text` with a closing fence appended when it ends inside an open fenced block.
 * Text with balanced fences, or none, comes back unchanged.
 */
export function CloseOpenCodeFence(text: string): string {
  if (!text) {
    return text;
  }
  const openFence = findOpenFence(text);
  return openFence === null ? text : `${text}\n${openFence}`;
}

/** The fence string still open at the end of `text`, or null when every block has closed. */
function findOpenFence(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split('\n')) {
    if (open === null) {
      open = FENCE_OPEN.exec(line)?.[1] ?? null;
      continue;
    }
    const closer = FENCE_CLOSE.exec(line)?.[1];
    if (closer && closer[0] === open[0] && closer.length >= open.length) {
      open = null;
    }
  }
  return open;
}
