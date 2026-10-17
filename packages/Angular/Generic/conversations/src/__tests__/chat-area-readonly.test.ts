// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MessageInputComponent } from '../lib/components/message/message-input.component';

/**
 * Template-source contract for the host `ReadOnly` input, same technique as
 * chat-area-header-actions: the chat-area constructor makes a TestBed render
 * disproportionate for placement guarantees.
 */
describe('chat-area ReadOnly template contract', () => {
  const html = readFileSync(
    resolve(__dirname, '../lib/components/conversation/conversation-chat-area.component.html'),
    'utf8'
  );

  it('every composer sits in a branch the ReadOnly input excludes', () => {
    for (const tag of ['mj-message-input', 'mj-conversation-empty-state'] as const) {
      const positions = findTags(html, tag);
      expect(positions.length, tag).toBeGreaterThan(0);
      for (const position of positions) {
        expect(isExcludedWhenReadOnly(html, position), `${tag} at ${position}`).toBe(true);
      }
    }
  });

  it("the message list's pin, edit, and delete bindings include !EffectiveReadOnly", () => {
    const listStart = html.indexOf('<mj-conversation-message-list');
    const listEnd = html.indexOf('</mj-conversation-message-list>');
    expect(listStart).toBeGreaterThanOrEqual(0);
    expect(listEnd).toBeGreaterThan(listStart);
    const list = html.slice(listStart, listEnd);
    expect(list).toContain('[allowPinning]="allowPinning && !EffectiveReadOnly"');
    expect(list).toContain('[allowMessageEdit]="allowMessageEdit && !EffectiveReadOnly"');
    expect(list).toContain('[allowMessageDelete]="allowMessageDelete && !EffectiveReadOnly"');
  });

  it('a View share still renders the disabled composer (ReadOnly false keeps today)', () => {
    expect(html).toContain('[disabled]="isProcessing || isReadOnlyView"');
    expect(html).toContain('>You have view-only access to this conversation.</span>');
  });

  it('every mj-message-input the chat area renders binds ReadOnly to EffectiveReadOnly', () => {
    const positions = findTags(html, 'mj-message-input');
    expect(positions.length).toBe(2);
    for (const position of positions) {
      const end = html.indexOf('</mj-message-input>', position);
      expect(html.slice(position, end)).toContain('[ReadOnly]="EffectiveReadOnly"');
    }
  });

  it('the mode picker is hidden when EffectiveReadOnly and the agent picker is disabled', () => {
    expect(html).toContain(
      '@if (!overlayMode && showAgentModePicker && ModePickerTargetAgentId && !EffectiveReadOnly)'
    );
    expect(html).toContain('[Disabled]="EffectiveReadOnly"');
  });

  it("the pins panel's AllowUnpin binding follows EffectiveReadOnly", () => {
    expect(html).toContain('[AllowUnpin]="!EffectiveReadOnly"');
  });
});

describe('read-only template contracts outside the chat area', () => {
  const messageItem = readFileSync(
    resolve(__dirname, '../lib/components/message/message-item.component.html'),
    'utf8'
  );
  const pins = readFileSync(
    resolve(__dirname, '../lib/components/conversation/pinned-messages-panel.component.html'),
    'utf8'
  );

  it('the response form is not shown when the message is ReadOnly', () => {
    expect(messageItem).toContain(
      '@if (!ReadOnly && isLastMessageInConversation && isConversationOwner && responseForm)'
    );
  });

  it('ratings cannot be edited when the message is ReadOnly', () => {
    const bindings = messageItem.match(/\[canEdit]="[^"]*"/g) ?? [];
    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      expect(binding).toBe('[canEdit]="isConversationOwner && !ReadOnly"');
    }
  });

  it('the unpin button is inside @if (AllowUnpin)', () => {
    const gate = pins.indexOf('@if (AllowUnpin)');
    const button = pins.indexOf('class="pin-action-btn unpin-btn"');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(button).toBeGreaterThan(gate);
  });
});

describe('read-only send path', () => {
  it('OnSuggestedResponseSelected with ReadOnly = true never calls SendMessageWithText', async () => {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const sendMessageWithText = vi.fn(async () => true);
    const SendMessageWithText = vi.fn(async () => true);
    const onEmptyStateMessageSent = vi.fn(async () => undefined);
    open['ReadOnly'] = true;
    open['getActiveMessageInputComponent'] = () => ({ sendMessageWithText, SendMessageWithText });
    open['OnEmptyStateMessageSent'] = onEmptyStateMessageSent;

    await component.OnSuggestedResponseSelected({ text: 'hello' });

    expect(sendMessageWithText).not.toHaveBeenCalled();
    expect(SendMessageWithText).not.toHaveBeenCalled();
    expect(onEmptyStateMessageSent).not.toHaveBeenCalled();
  });

  it('SendMessageWithText with ReadOnly = true returns false and never creates a conversation detail', async () => {
    const createConversationDetail = vi.fn();
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const open = component as unknown as Record<string, unknown>;
    open['ReadOnly'] = true;
    open['dataCache'] = { createConversationDetail };
    open['pendingAttachments'] = [];
    open['IsSending'] = false;

    const sent = await component.SendMessageWithText('hello');

    expect(sent).toBe(false);
    expect(createConversationDetail).not.toHaveBeenCalled();
  });
});

type Tri = 'true' | 'false' | 'unknown';

function findTags(html: string, tag: string): number[] {
  const positions: number[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<' + tag, i)) {
      const next = html[i + tag.length + 1];
      if (next === undefined || /[\s>/]/.test(next)) {
        positions.push(i);
      }
    }
    i++;
  }
  return positions;
}

/**
 * True when the template position is inside a control-flow branch that is not
 * entered when the ReadOnly input is true. `@if (ReadOnly)`'s `@else`, and any
 * `@if (!ReadOnly)` / `@if (… && !ReadOnly)`, count. `@if (!EffectiveReadOnly)`
 * does not — a View share must keep its composer.
 */
function isExcludedWhenReadOnly(html: string, index: number): boolean {
  type Frame = { kind: 'cf' | 'obj'; excludesReadOnly: boolean; chain: { covered: Tri } | null };
  const stack: Frame[] = [];
  let resumeChain: { covered: Tri } | null = null;
  let i = 0;

  const openIf = (cond: string, chain: { covered: Tri } | null): void => {
    const value = evalReadOnly(cond);
    const active = chain ?? { covered: 'false' as Tri };
    const excludesReadOnly = active.covered === 'true' || value === 'false';
    active.covered = orTri(active.covered, value);
    stack.push({ kind: 'cf', excludesReadOnly, chain: active });
    resumeChain = null;
  };

  while (i < html.length && i < index) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const quote = html[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      i++;
      while (i < html.length && html[i] !== quote) {
        if (html[i] === '\\') {
          i += 2;
        } else {
          i++;
        }
      }
      i++;
      resumeChain = null;
      continue;
    }
    if (html.startsWith('{{', i)) {
      const end = html.indexOf('}}', i + 2);
      i = end === -1 ? html.length : end + 2;
      continue;
    }
    if (/\s/.test(html[i])) {
      i++;
      continue;
    }

    const flow = readControlFlow(html, i);
    if (flow) {
      if (flow.kind === 'if') {
        openIf(flow.cond, null);
      } else if (flow.kind === 'else-if') {
        openIf(flow.cond, resumeChain);
      } else if (flow.kind === 'else') {
        const covered = resumeChain?.covered ?? 'unknown';
        stack.push({
          kind: 'cf',
          excludesReadOnly: covered === 'true',
          chain: resumeChain,
        });
        resumeChain = null;
      } else {
        stack.push({ kind: 'cf', excludesReadOnly: false, chain: null });
        resumeChain = null;
      }
      i = flow.next;
      continue;
    }

    if (html[i] === '{') {
      stack.push({ kind: 'obj', excludesReadOnly: false, chain: null });
      resumeChain = null;
      i++;
      continue;
    }
    if (html[i] === '}') {
      const frame = stack.pop();
      resumeChain = frame?.kind === 'cf' ? frame.chain : null;
      i++;
      continue;
    }

    resumeChain = null;
    i++;
  }

  return stack.some((frame) => frame.excludesReadOnly);
}

function readControlFlow(
  html: string,
  i: number
): { kind: 'if' | 'else-if' | 'else' | 'other'; cond: string; next: number } | null {
  if (!html.startsWith('@', i)) {
    return null;
  }
  const rest = html.slice(i);
  let header: 'if' | 'else-if' | 'else' | 'other' | null = null;
  let afterHeader = i;
  if (rest.startsWith('@else if')) {
    header = 'else-if';
    afterHeader = i + '@else if'.length;
  } else if (rest.startsWith('@else')) {
    header = 'else';
    afterHeader = i + '@else'.length;
  } else if (rest.startsWith('@if')) {
    header = 'if';
    afterHeader = i + '@if'.length;
  } else if (/^@(for|switch|case|default|empty)\b/.test(rest)) {
    header = 'other';
    afterHeader = i + /^@(for|switch|case|default|empty)/.exec(rest)![0].length;
  } else {
    return null;
  }

  let cursor = skipSpace(html, afterHeader);
  let cond = '';
  if (header === 'if' || header === 'else-if' || header === 'other') {
    if (html[cursor] !== '(') {
      return null;
    }
    const end = skipParens(html, cursor);
    cond = html.slice(cursor + 1, end - 1);
    const semi = cond.indexOf(';');
    if (semi !== -1) {
      cond = cond.slice(0, semi);
    }
    cursor = skipSpace(html, end);
  }
  if (html[cursor] !== '{') {
    return null;
  }
  return { kind: header, cond: cond.trim(), next: cursor + 1 };
}

/** Condition value when the ReadOnly input is true. Unknown identifiers stay unknown. */
function evalReadOnly(cond: string): Tri {
  return parseOr(cond, 0).tri;
}

function parseOr(s: string, i: number): { tri: Tri; next: number } {
  let left = parseAnd(s, i);
  let cursor = left.next;
  while (s.startsWith('||', skipSpace(s, cursor))) {
    cursor = skipSpace(s, cursor) + 2;
    const right = parseAnd(s, skipSpace(s, cursor));
    left = { tri: orTri(left.tri, right.tri), next: right.next };
    cursor = right.next;
  }
  return left;
}

function parseAnd(s: string, i: number): { tri: Tri; next: number } {
  let left = parseUnary(s, i);
  let cursor = left.next;
  while (s.startsWith('&&', skipSpace(s, cursor))) {
    cursor = skipSpace(s, cursor) + 2;
    const right = parseUnary(s, skipSpace(s, cursor));
    left = { tri: andTri(left.tri, right.tri), next: right.next };
    cursor = right.next;
  }
  return left;
}

function parseUnary(s: string, i: number): { tri: Tri; next: number } {
  const cursor = skipSpace(s, i);
  if (s[cursor] === '!') {
    const inner = parseUnary(s, cursor + 1);
    return { tri: notTri(inner.tri), next: inner.next };
  }
  const atom = parseAtom(s, cursor);
  const after = skipSpace(s, atom.next);
  if (s.startsWith('===', after) || s.startsWith('!==', after) || s.startsWith('==', after) || s.startsWith('!=', after)) {
    const op = s.startsWith('===', after) || s.startsWith('!==', after) ? 3 : 2;
    const right = parseUnary(s, after + op);
    return { tri: 'unknown', next: right.next };
  }
  return atom;
}

function parseAtom(s: string, i: number): { tri: Tri; next: number } {
  const cursor = skipSpace(s, i);
  if (s[cursor] === '(') {
    const inner = parseOr(s, cursor + 1);
    const after = skipSpace(s, inner.next);
    return { tri: inner.tri, next: s[after] === ')' ? after + 1 : inner.next };
  }
  const ident = /^[A-Za-z_$][\w$]*/.exec(s.slice(cursor));
  if (!ident) {
    if (s[cursor] === "'" || s[cursor] === '"') {
      let j = cursor + 1;
      while (j < s.length && s[j] !== s[cursor]) {
        j += s[j] === '\\' ? 2 : 1;
      }
      return { tri: 'unknown', next: j + 1 };
    }
    return { tri: 'unknown', next: cursor + 1 };
  }
  let next = cursor + ident[0].length;
  let tri: Tri = ident[0] === 'ReadOnly' ? 'true' : 'unknown';
  while (next < s.length) {
    if (s[next] === '(') {
      next = skipParens(s, next);
      tri = 'unknown';
      continue;
    }
    if (s.startsWith('?.', next) || s[next] === '.') {
      tri = 'unknown';
      next += s[next] === '.' ? 1 : 2;
      const member = /^[A-Za-z_$][\w$]*/.exec(s.slice(next));
      if (member) {
        next += member[0].length;
      }
      continue;
    }
    break;
  }
  return { tri, next };
}

function orTri(a: Tri, b: Tri): Tri {
  if (a === 'true' || b === 'true') return 'true';
  if (a === 'false' && b === 'false') return 'false';
  return 'unknown';
}

function andTri(a: Tri, b: Tri): Tri {
  if (a === 'false' || b === 'false') return 'false';
  if (a === 'true' && b === 'true') return 'true';
  return 'unknown';
}

function notTri(a: Tri): Tri {
  if (a === 'true') return 'false';
  if (a === 'false') return 'true';
  return 'unknown';
}

function skipSpace(s: string, i: number): number {
  let cursor = i;
  while (cursor < s.length && /\s/.test(s[cursor])) {
    cursor++;
  }
  return cursor;
}

function skipParens(s: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i++;
      while (i < s.length && s[i] !== ch) {
        i += s[i] === '\\' ? 2 : 1;
      }
      i++;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return s.length;
}
