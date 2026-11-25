import { Directive, EventEmitter, Input, Output } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { TourSessionView, TourStepView } from '@memberjunction/tours-runtime';

export interface TourStepIntentEventArgs {
  StepKey: string;
  Data?: Record<string, unknown>;
}

export interface TourChoiceEventArgs {
  StepKey: string;
  ChoiceKey: string;
  IsCorrect?: boolean;
}

export interface TourStepSignalEventArgs {
  StepKey: string;
  SignalKey: string;
  Payload?: Record<string, unknown>;
}

/**
 * Base Angular UX component for all Guided Tour step renderers (`@memberjunction/ng-tours`).
 * Subclasses register with `@RegisterClass(BaseTourStepRenderer, '<StepType>')`.
 */
@Directive()
export abstract class BaseTourStepRenderer<TConfig extends object = object> extends BaseAngularComponent {
  @Input() public Step!: TourStepView<TConfig>;
  @Input() public Session!: TourSessionView;
  @Input() public VoiceGuideAvailable = false;
  @Input() public VoiceGuideActive = false;
  @Input() public EstimatedMinutes?: number;
  @Input() public AvailableTourKeys: ReadonlySet<string> | null = null;

  @Output() public NextRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public BackRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public DismissRequested = new EventEmitter<TourStepIntentEventArgs>();
  @Output() public ChoiceMade = new EventEmitter<TourChoiceEventArgs>();
  @Output() public SignalEmitted = new EventEmitter<TourStepSignalEventArgs>();
  @Output() public NextTourRequested = new EventEmitter<string>();
  @Output() public StepSelected = new EventEmitter<string>();
  @Output() public VoiceGuideToggled = new EventEmitter<boolean>();
  @Output() public DemonstrateRequested = new EventEmitter<{ ConfirmedMutation?: boolean }>();

  public get StepHeadingId(): string {
    return `mjt-heading-${sanitizeIdSegment(this.Step?.StepKey ?? 'step')}`;
  }

  public get StepBodyId(): string {
    return `mjt-body-${sanitizeIdSegment(this.Step?.StepKey ?? 'step')}`;
  }

  public get ProgressLabel(): string {
    if (!this.Step) {
      return '';
    }
    return `${this.Step.StepIndex + 1} of ${Math.max(1, this.Step.TotalSteps)}`;
  }

  public FormatBodyHtml(body: string | undefined): string {
    return FormatSafeTourMarkdown(body ?? '');
  }
}

/**
 * Escapes raw HTML and renders lightweight safe inline markdown (`**bold**`, `*italic*`,
 * `` `code` ``, `[label](https://...)`, and paragraph breaks) in strictly linear O(n) time
 * with zero backtracking regexes (immune to ReDoS on pathological inputs).
 */
export function FormatSafeTourMarkdown(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const escaped = escapeHtmlLinear(trimmed);
  const paragraphs = splitParagraphsLinear(escaped);
  return paragraphs.map((para) => `<p>${renderInlineMarkdownLinear(para)}</p>`).join('');
}

function escapeHtmlLinear(text: string): string {
  let out = '';
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    let rep: string | null = null;
    if (ch === 38) rep = '&amp;'; // &
    else if (ch === 60) rep = '&lt;'; // <
    else if (ch === 62) rep = '&gt;'; // >
    else if (ch === 34) rep = '&quot;'; // "
    else if (ch === 39) rep = '&#39;'; // '
    if (rep !== null) {
      if (i > last) {
        out += text.slice(last, i);
      }
      out += rep;
      last = i + 1;
    }
  }
  return last === 0 ? text : out + text.slice(last);
}

function splitParagraphsLinear(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let pos = 0;
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const rawLine = nl === -1 ? text.slice(pos) : text.slice(pos, nl);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) {
      if (current.length > 0) {
        paragraphs.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
    if (nl === -1) {
      break;
    }
    pos = nl + 1;
  }
  if (current.length > 0) {
    paragraphs.push(current.join('\n'));
  }
  return paragraphs;
}

function renderInlineMarkdownLinear(s: string): string {
  let out = '';
  let i = 0;
  const len = s.length;

  while (i < len) {
    const ch = s[i];

    if (ch === '\n') {
      out += '<br>';
      i += 1;
      continue;
    }

    if (ch === '*' && s[i + 1] === '*') {
      const close = s.indexOf('**', i + 2);
      if (close > i + 2) {
        out += `<strong>${s.slice(i + 2, close)}</strong>`;
        i = close + 2;
        continue;
      }
      out += '**';
      i += 2;
      continue;
    }

    if (ch === '*') {
      const close = s.indexOf('*', i + 1);
      if (close > i + 1) {
        out += `<em>${s.slice(i + 1, close)}</em>`;
        i = close + 1;
        continue;
      }
      out += '*';
      i += 1;
      continue;
    }

    if (ch === '`') {
      const close = s.indexOf('`', i + 1);
      if (close > i + 1) {
        out += `<code>${s.slice(i + 1, close)}</code>`;
        i = close + 1;
        continue;
      }
      out += '`';
      i += 1;
      continue;
    }

    if (ch === '[') {
      const parsed = tryParseSafeLink(s, i);
      if (parsed) {
        out += `<a href="${parsed.Url}" target="_blank" rel="noopener noreferrer">${parsed.Label}</a>`;
        i = parsed.NextIndex;
        continue;
      }
      out += '[';
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function tryParseSafeLink(
  s: string,
  start: number,
): { Label: string; Url: string; NextIndex: number } | null {
  // Scan label bounded strictly to non-nested, single-line characters (`[`, `]`, `\n` abort immediately -> O(1) on repeats)
  let j = start + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '[' || c === '\n' || c === '\r') {
      return null;
    }
    if (c === ']') {
      break;
    }
    j += 1;
  }

  if (j <= start + 1 || j >= s.length || s[j + 1] !== '(') {
    return null;
  }

  const urlStart = j + 2;
  if (!s.startsWith('https://', urlStart) && !s.startsWith('http://', urlStart)) {
    return null;
  }

  // Scan URL up to closing `)`, aborting on whitespace or `[` so unclosed patterns stay strictly O(n) total
  let k = urlStart;
  while (k < s.length) {
    const c = s[k];
    if (c === ')') {
      if (k === urlStart) {
        return null;
      }
      return {
        Label: s.slice(start + 1, j),
        Url: s.slice(urlStart, k),
        NextIndex: k + 1,
      };
    }
    if (c === '[' || c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      return null;
    }
    k += 1;
  }

  return null;
}

function sanitizeIdSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
}
