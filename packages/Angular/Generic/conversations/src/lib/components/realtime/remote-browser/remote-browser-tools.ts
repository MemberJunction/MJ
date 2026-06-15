import { RealtimeToolDefinition } from '@memberjunction/ai';

/**
 * The shared name prefix of every Remote Browser tool — the key the session registers so all
 * `browser_*` tool calls route locally to the channel's {@link RemoteBrowserChannel.ApplyAgentTool}
 * (executed in the browser, which in turn drives the SERVER-hosted browser via the
 * `ExecuteRemoteBrowserAction` GraphQL mutation) instead of the generic server tool relay.
 */
export const REMOTE_BROWSER_TOOL_PREFIX = 'browser_';

/** The canonical Remote Browser tool names (one per `browser_*` capability). */
export const REMOTE_BROWSER_TOOL_NAMES = {
  OpenUrl: 'browser_OpenUrl',
  Click: 'browser_Click',
  Type: 'browser_Type',
  Key: 'browser_Key',
  Scroll: 'browser_Scroll',
  Back: 'browser_Back',
  Forward: 'browser_Forward',
  Wait: 'browser_Wait',
  GetPageText: 'browser_GetPageText',
  DescribePage: 'browser_DescribePage',
  LocateElement: 'browser_LocateElement',
} as const;

/**
 * The discriminated `kind` the server's `ExecuteRemoteBrowserAction` mutation switches on.
 * Each Remote Browser tool maps to exactly one of these (see {@link MapToolToAction}).
 */
export type RemoteBrowserActionKind = 'navigate' | 'click' | 'type' | 'key' | 'scroll' | 'back' | 'forward' | 'wait' | 'getPageText';

/**
 * A normalized Remote Browser action — the flat field set the `ExecuteRemoteBrowserAction`
 * mutation accepts, derived from a `browser_*` tool call by {@link MapToolToAction}. Only the
 * fields meaningful for the action's {@link Kind} are populated; the rest stay `undefined`
 * (the mutation's optional args).
 */
export interface RemoteBrowserAction {
  /** The action discriminator the server switches on. */
  Kind: RemoteBrowserActionKind;
  /** Target URL (openUrl). */
  Url?: string;
  /** CSS selector to target (click / type / scroll / wait). */
  Selector?: string;
  /** Viewport X coordinate for a positional click (click). */
  X?: number;
  /** Viewport Y coordinate for a positional click (click). */
  Y?: number;
  /** Text to type (type). */
  Text?: string;
  /** Key name to press, e.g. `'Enter'` / `'Tab'` (key). */
  Key?: string;
  /** Horizontal scroll delta in px (scroll). */
  DeltaX?: number;
  /** Vertical scroll delta in px (scroll). */
  DeltaY?: number;
  /** Wait duration in ms (wait). */
  Ms?: number;
}

/** A JSON-serializable value (the building block of a parsed tool-args object). */
type ToolArgValue = string | number | boolean | null | ToolArgValue[] | { [key: string]: ToolArgValue };

/** Coerces a parsed arg to a non-empty string, or `undefined` when absent / wrong-typed. */
function asString(value: ToolArgValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Coerces a parsed arg to a finite number, or `undefined` when absent / wrong-typed. */
function asNumber(value: ToolArgValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Thrown by {@link MapToolToAction} when a tool's REQUIRED argument is missing or invalid
 * (e.g. `browser_OpenUrl` without a `url`, `browser_Type` without `text`). The channel
 * catches it and returns the message to the model as a failed-tool result string — it is
 * never allowed to propagate out of `ApplyAgentTool`.
 */
export class RemoteBrowserToolArgError extends Error {}

/**
 * Maps ONE parsed `browser_*` tool-call args object to its normalized
 * {@link RemoteBrowserAction}. Pure + synchronous so it can be unit-tested in isolation from
 * the GraphQL round-trip. Validates required args and throws {@link RemoteBrowserToolArgError}
 * with a model-readable message when they're missing/invalid; unknown tool names also throw.
 *
 * @param toolName One of the `browser_*` names (see {@link REMOTE_BROWSER_TOOL_NAMES}).
 * @param args The parsed tool-call arguments object.
 * @returns The normalized action ready to feed the `ExecuteRemoteBrowserAction` mutation.
 */
export function MapToolToAction(toolName: string, args: Record<string, ToolArgValue>): RemoteBrowserAction {
  switch (toolName) {
    case REMOTE_BROWSER_TOOL_NAMES.OpenUrl: {
      const url = asString(args['url']);
      if (!url) {
        throw new RemoteBrowserToolArgError('browser_OpenUrl requires a non-empty "url".');
      }
      return { Kind: 'navigate', Url: url };
    }
    case REMOTE_BROWSER_TOOL_NAMES.Click: {
      const selector = asString(args['selector']);
      const x = asNumber(args['x']);
      const y = asNumber(args['y']);
      if (!selector && (x === undefined || y === undefined)) {
        throw new RemoteBrowserToolArgError('browser_Click requires either a "selector" or both "x" and "y" coordinates.');
      }
      return { Kind: 'click', Selector: selector, X: x, Y: y };
    }
    case REMOTE_BROWSER_TOOL_NAMES.Type: {
      // Empty string is a VALID value to type — only a missing / non-string `text` is an error,
      // so check the raw type here rather than via asString (which treats '' as absent).
      const text = args['text'];
      if (typeof text !== 'string') {
        throw new RemoteBrowserToolArgError('browser_Type requires "text" to type.');
      }
      return { Kind: 'type', Text: text, Selector: asString(args['selector']) };
    }
    case REMOTE_BROWSER_TOOL_NAMES.Key: {
      const key = asString(args['key']);
      if (!key) {
        throw new RemoteBrowserToolArgError('browser_Key requires a "key" name (e.g. "Enter", "Tab").');
      }
      return { Kind: 'key', Key: key };
    }
    case REMOTE_BROWSER_TOOL_NAMES.Scroll: {
      return {
        Kind: 'scroll',
        DeltaX: asNumber(args['deltaX']),
        DeltaY: asNumber(args['deltaY']),
        Selector: asString(args['selector']),
      };
    }
    case REMOTE_BROWSER_TOOL_NAMES.Back:
      return { Kind: 'back' };
    case REMOTE_BROWSER_TOOL_NAMES.Forward:
      return { Kind: 'forward' };
    case REMOTE_BROWSER_TOOL_NAMES.Wait: {
      return { Kind: 'wait', Ms: asNumber(args['ms']), Selector: asString(args['selector']) };
    }
    case REMOTE_BROWSER_TOOL_NAMES.GetPageText:
      return { Kind: 'getPageText' };
    default:
      throw new RemoteBrowserToolArgError(`Unknown Remote Browser tool "${toolName}".`);
  }
}

/**
 * The Remote Browser channel's CLIENT-EXECUTED tool declarations — registered with the
 * realtime model at session mint and routed back to {@link RemoteBrowserChannel.ApplyAgentTool}
 * by the `browser_` prefix. Each maps 1:1 to a {@link RemoteBrowserActionKind}.
 */
export const REMOTE_BROWSER_TOOL_DEFINITIONS: RealtimeToolDefinition[] = [
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.OpenUrl,
    Description: 'Navigate the shared browser to a URL. The user watches the live page in the Browser tab.',
    ParametersSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to open (include the scheme, e.g. https://…).' },
      },
      required: ['url'],
    },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Click,
    Description:
      'Click an element in the shared browser, by CSS selector or by viewport x/y coordinates. Provide a selector when you know it; otherwise provide both x and y.',
    ParametersSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click (preferred).' },
        x: { type: 'number', description: 'Viewport X in CSS px (used when no selector is given).' },
        y: { type: 'number', description: 'Viewport Y in CSS px (used when no selector is given).' },
      },
    },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Type,
    Description: 'Type text into the shared browser. Provide a selector to focus a specific field first; omit it to type into the currently focused element.',
    ParametersSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type.' },
        selector: { type: 'string', description: 'Optional CSS selector to focus before typing.' },
      },
      required: ['text'],
    },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Key,
    Description: 'Press a single key in the shared browser (e.g. "Enter" to submit, "Tab" to move focus, "Escape" to dismiss).',
    ParametersSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name, e.g. "Enter", "Tab", "Escape", "ArrowDown".' },
      },
      required: ['key'],
    },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Scroll,
    Description: 'Scroll the shared browser page (or a scrollable element) by a pixel delta. Positive deltaY scrolls down.',
    ParametersSchema: {
      type: 'object',
      properties: {
        deltaX: { type: 'number', description: 'Horizontal scroll delta in px (positive = right).' },
        deltaY: { type: 'number', description: 'Vertical scroll delta in px (positive = down).' },
        selector: { type: 'string', description: 'Optional CSS selector of a scrollable element; omit to scroll the page.' },
      },
    },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Back,
    Description: 'Navigate the shared browser back to the previous page in its history.',
    ParametersSchema: { type: 'object', properties: {} },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Forward,
    Description: 'Navigate the shared browser forward to the next page in its history.',
    ParametersSchema: { type: 'object', properties: {} },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.Wait,
    Description: 'Wait for the shared browser to settle — for a fixed number of milliseconds, or until an element matching a selector appears.',
    ParametersSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milliseconds to wait. Omit when waiting on a selector.' },
        selector: { type: 'string', description: 'Optional CSS selector to wait for.' },
      },
    },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.GetPageText,
    Description: 'Read the visible text content of the current page in the shared browser, so you can understand what is on screen.',
    ParametersSchema: { type: 'object', properties: {} },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.DescribePage,
    Description:
      "Look at the current page and get a concise text description of what is visible — use this to 'see' the page since you cannot view images directly.",
    ParametersSchema: { type: 'object', properties: {} },
  },
  {
    Name: REMOTE_BROWSER_TOOL_NAMES.LocateElement,
    Description:
      "Find a UI element by visual description (e.g. 'the blue Sign In button', 'the search box') and get its approximate pixel center (x,y) so you can browser_Click it. Returns whether it was found, its label, and coordinates.",
    ParametersSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: "Visual description of the element to find (e.g. 'the blue Sign In button')." },
      },
      required: ['description'],
    },
  },
];
