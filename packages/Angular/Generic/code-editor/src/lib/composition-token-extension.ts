/**
 * CodeMirror 6 extension that highlights {{query:"..."}} composition tokens
 * in SQL as interactive, styled inline elements. Tokens are rendered as
 * clickable links with hover tooltips showing query metadata.
 *
 * This extension is automatically included when the code editor's language is SQL.
 */
import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewPlugin,
    ViewUpdate,
    hoverTooltip,
    Tooltip
} from '@codemirror/view';
import { Extension, Range } from '@codemirror/state';

/**
 * Event payload emitted when a user clicks a composition token in the editor.
 */
export interface CompositionTokenClickEvent {
    /** The full {{query:"..."}} token text */
    FullToken: string;
    /** The query name (last path segment) */
    QueryName: string;
    /** Category path segments (everything before the query name) */
    CategorySegments: string[];
    /** Full path as written in the token (e.g., "Demos/Active Users") */
    FullPath: string;
    /** Original mouse event for positioning */
    MouseEvent: MouseEvent;
}

/**
 * Query metadata returned by the hover resolver for tooltip display.
 */
export interface CompositionTokenInfo {
    /** Display name of the referenced query */
    Name: string;
    /** Optional description */
    Description?: string;
    /** Query status (Approved, Pending, etc.) */
    Status?: string;
    /** Category path */
    Category?: string;
    /** Whether the query accepts parameters */
    HasParameters?: boolean;
    /** Whether the query is reusable */
    Reusable?: boolean;
}

/**
 * Resolver function type that looks up query info from a composition path.
 * Return null if the query is not found.
 */
export type CompositionTokenResolver = (fullPath: string) => CompositionTokenInfo | null;

/**
 * Configuration options for the composition token extension.
 */
export interface CompositionTokenConfig {
    /** Callback invoked when a composition token is clicked */
    OnTokenClick?: (event: CompositionTokenClickEvent) => void;
    /** Resolver that provides query metadata for hover tooltips */
    OnTokenHover?: CompositionTokenResolver;
}

/**
 * Regex matching {{query:"..."}} tokens — same as QueryCompositionEngine.
 */
const TOKEN_REGEX = /\{\{query:"([^"]+)"\}\}/g;

interface CommentRange {
    from: number;
    to: number;
}

/**
 * Finds all SQL comment ranges in the document text.
 */
function findCommentRanges(text: string): CommentRange[] {
    const ranges: CommentRange[] = [];
    let i = 0;

    while (i < text.length) {
        // Skip string literals
        if (text[i] === "'") {
            i++;
            while (i < text.length) {
                if (text[i] === "'" && i + 1 < text.length && text[i + 1] === "'") {
                    i += 2; // escaped quote
                } else if (text[i] === "'") {
                    i++;
                    break;
                } else {
                    i++;
                }
            }
        }
        // Single-line comment
        else if (text[i] === '-' && i + 1 < text.length && text[i + 1] === '-') {
            const start = i;
            while (i < text.length && text[i] !== '\n') i++;
            ranges.push({ from: start, to: i });
        }
        // Block comment
        else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '*') {
            const start = i;
            i += 2;
            while (i < text.length) {
                if (text[i] === '*' && i + 1 < text.length && text[i + 1] === '/') {
                    i += 2;
                    break;
                }
                i++;
            }
            ranges.push({ from: start, to: i });
        }
        else {
            i++;
        }
    }

    return ranges;
}

/**
 * Checks if a position falls within any comment range.
 */
function isInComment(pos: number, commentRanges: CommentRange[]): boolean {
    return commentRanges.some(r => pos >= r.from && pos < r.to);
}

/**
 * CSS class applied to composition token decorations.
 */
const compositionTokenMark = Decoration.mark({
    class: 'cm-composition-token',
    attributes: {
        'data-composition-token': 'true'
    }
});

/**
 * Builds the decoration set by scanning the document for composition tokens.
 */
function buildDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const doc = view.state.doc;
    const text = doc.toString();
    const commentRanges = findCommentRanges(text);

    const regex = new RegExp(TOKEN_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const from = match.index;
        const to = from + match[0].length;

        // Skip tokens inside comments
        if (isInComment(from, commentRanges)) continue;

        decorations.push(compositionTokenMark.range(from, to));
    }

    return Decoration.set(decorations, true);
}

/**
 * Parses the inner content of a composition token to extract path and query name.
 */
function parseTokenContent(fullToken: string): { queryName: string; categorySegments: string[]; fullPath: string } | null {
    const innerMatch = /\{\{query:"([^"]+)"\}\}/.exec(fullToken);
    if (!innerMatch) return null;

    const content = innerMatch[1];
    // Strip params: everything before '(' is the path
    const pathPart = content.includes('(') ? content.substring(0, content.indexOf('(')) : content;
    const segments = pathPart.split('/').map(s => s.trim()).filter(s => s.length > 0);
    if (segments.length === 0) return null;

    return {
        queryName: segments[segments.length - 1],
        categorySegments: segments.slice(0, -1),
        fullPath: pathPart.trim()
    };
}

/**
 * Finds the composition token at a given document position.
 * Returns the match and parsed content if the position is within a non-comment token.
 */
function findTokenAtPosition(text: string, pos: number, commentRanges: CommentRange[]): {
    fullToken: string;
    from: number;
    to: number;
    parsed: { queryName: string; categorySegments: string[]; fullPath: string };
} | null {
    const regex = new RegExp(TOKEN_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        if (pos >= from && pos < to && !isInComment(from, commentRanges)) {
            const parsed = parseTokenContent(match[0]);
            if (parsed) {
                return { fullToken: match[0], from, to, parsed };
            }
        }
    }
    return null;
}

/**
 * ViewPlugin that maintains the decoration set and updates on document changes.
 */
const compositionTokenPlugin = ViewPlugin.fromClass(
    class {
        Decorations: DecorationSet;

        constructor(view: EditorView) {
            this.Decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.Decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.Decorations
    }
);

/**
 * Base theme providing default styles for composition tokens and hover cards.
 */
const compositionTokenTheme = EditorView.baseTheme({
    '.cm-composition-token': {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderBottom: '1px dashed rgba(59, 130, 246, 0.6)',
        borderRadius: '2px',
        cursor: 'pointer',
        padding: '0 2px',
        transition: 'background-color 0.15s ease'
    },
    '.cm-composition-token:hover': {
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        borderBottomStyle: 'solid'
    },
    '.cm-tooltip.cm-composition-tooltip': {
        backgroundColor: '#1e293b',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '0',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        maxWidth: '360px',
        fontSize: '12px',
        lineHeight: '1.4',
        overflow: 'hidden'
    },
    '.cm-composition-tooltip-header': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        borderBottom: '1px solid #334155',
        backgroundColor: '#0f172a'
    },
    '.cm-composition-tooltip-icon': {
        color: '#3b82f6',
        fontSize: '14px',
        flexShrink: '0'
    },
    '.cm-composition-tooltip-name': {
        fontWeight: '600',
        fontSize: '13px',
        color: '#f1f5f9',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    '.cm-composition-tooltip-body': {
        padding: '10px 12px'
    },
    '.cm-composition-tooltip-description': {
        color: '#94a3b8',
        marginBottom: '8px',
        display: '-webkit-box',
        '-webkit-line-clamp': '3',
        '-webkit-box-orient': 'vertical',
        overflow: 'hidden'
    },
    '.cm-composition-tooltip-meta': {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px'
    },
    '.cm-composition-tooltip-badge': {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '500',
        backgroundColor: '#334155',
        color: '#cbd5e1'
    },
    '.cm-composition-tooltip-badge.approved': {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        color: '#4ade80'
    },
    '.cm-composition-tooltip-badge.pending': {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        color: '#fbbf24'
    },
    '.cm-composition-tooltip-badge.rejected': {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171'
    },
    '.cm-composition-tooltip-badge.reusable': {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        color: '#60a5fa'
    },
    '.cm-composition-tooltip-badge.params': {
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        color: '#c084fc'
    },
    '.cm-composition-tooltip-footer': {
        padding: '6px 12px',
        borderTop: '1px solid #334155',
        textAlign: 'center' as 'center'
    },
    '.cm-composition-tooltip-navigate-btn': {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        border: '1px solid #475569',
        borderRadius: '4px',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        color: '#93c5fd',
        fontSize: '11px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        lineHeight: '1.4'
    },
    '.cm-composition-tooltip-navigate-btn:hover': {
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        borderColor: '#60a5fa',
        color: '#bfdbfe'
    },
    '.cm-composition-tooltip-not-found': {
        padding: '10px 12px',
        color: '#94a3b8',
        fontStyle: 'italic'
    }
});

/**
 * Builds the hover tooltip DOM for a resolved query.
 */
function buildTooltipDOM(
    info: CompositionTokenInfo | null,
    fullPath: string,
    onNavigate?: () => void
): HTMLElement {
    const container = document.createElement('div');

    if (!info) {
        const notFound = document.createElement('div');
        notFound.className = 'cm-composition-tooltip-not-found';
        notFound.textContent = `Query "${fullPath}" not found`;
        container.appendChild(notFound);
        return container;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'cm-composition-tooltip-header';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-file-code cm-composition-tooltip-icon';
    header.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'cm-composition-tooltip-name';
    name.textContent = info.Name;
    header.appendChild(name);

    container.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'cm-composition-tooltip-body';

    if (info.Description) {
        const desc = document.createElement('div');
        desc.className = 'cm-composition-tooltip-description';
        desc.textContent = info.Description;
        body.appendChild(desc);
    }

    // Meta badges
    const meta = document.createElement('div');
    meta.className = 'cm-composition-tooltip-meta';

    if (info.Status) {
        const badge = document.createElement('span');
        badge.className = 'cm-composition-tooltip-badge ' + info.Status.toLowerCase();
        badge.textContent = info.Status;
        meta.appendChild(badge);
    }

    if (info.Category) {
        const badge = document.createElement('span');
        badge.className = 'cm-composition-tooltip-badge';
        badge.innerHTML = '<i class="fa-solid fa-folder" style="font-size:10px"></i> ' + info.Category;
        meta.appendChild(badge);
    }

    if (info.Reusable) {
        const badge = document.createElement('span');
        badge.className = 'cm-composition-tooltip-badge reusable';
        badge.textContent = 'Reusable';
        meta.appendChild(badge);
    }

    if (info.HasParameters) {
        const badge = document.createElement('span');
        badge.className = 'cm-composition-tooltip-badge params';
        badge.innerHTML = '<i class="fa-solid fa-sliders" style="font-size:10px"></i> Parameterized';
        meta.appendChild(badge);
    }

    if (meta.children.length > 0) {
        body.appendChild(meta);
    }

    container.appendChild(body);

    // Footer with navigate button
    if (onNavigate) {
        const footer = document.createElement('div');
        footer.className = 'cm-composition-tooltip-footer';

        const btn = document.createElement('button');
        btn.className = 'cm-composition-tooltip-navigate-btn';
        btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open Query';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigate();
        });
        footer.appendChild(btn);

        container.appendChild(footer);
    }

    return container;
}

/**
 * Creates the composition token highlighting extension for CodeMirror 6.
 *
 * @param config - Configuration with click and hover callbacks.
 *   - OnTokenClick: Callback invoked when a user clicks a composition token.
 *   - OnTokenHover: Resolver that returns query info for hover tooltip display.
 * @returns A CodeMirror Extension array
 */
export function compositionTokenExtension(config: CompositionTokenConfig | ((event: CompositionTokenClickEvent) => void)): Extension[] {
    // Support legacy signature: single click callback function
    const resolvedConfig: CompositionTokenConfig = typeof config === 'function'
        ? { OnTokenClick: config }
        : config;

    const extensions: Extension[] = [
        compositionTokenPlugin,
        compositionTokenTheme
    ];

    // Click handler
    if (resolvedConfig.OnTokenClick) {
        const onTokenClick = resolvedConfig.OnTokenClick;
        extensions.push(EditorView.domEventHandlers({
            click(event: MouseEvent, view: EditorView) {
                const target = event.target as HTMLElement;

                // Walk up to find the composition token wrapper
                let tokenEl: HTMLElement | null = target;
                while (tokenEl && !tokenEl.hasAttribute('data-composition-token')) {
                    if (tokenEl === view.dom) {
                        tokenEl = null;
                        break;
                    }
                    tokenEl = tokenEl.parentElement;
                }

                if (!tokenEl) return false;

                const pos = view.posAtDOM(tokenEl);
                const text = view.state.doc.toString();
                const commentRanges = findCommentRanges(text);
                const token = findTokenAtPosition(text, pos, commentRanges);

                if (token) {
                    onTokenClick({
                        FullToken: token.fullToken,
                        QueryName: token.parsed.queryName,
                        CategorySegments: token.parsed.categorySegments,
                        FullPath: token.parsed.fullPath,
                        MouseEvent: event
                    });
                    event.preventDefault();
                    return true;
                }

                return false;
            }
        }));
    }

    // Hover tooltip
    if (resolvedConfig.OnTokenHover) {
        const resolver = resolvedConfig.OnTokenHover;
        const clickHandler = resolvedConfig.OnTokenClick;
        extensions.push(hoverTooltip((view: EditorView, pos: number): Tooltip | null => {
            const text = view.state.doc.toString();
            const commentRanges = findCommentRanges(text);
            const token = findTokenAtPosition(text, pos, commentRanges);

            if (!token) return null;

            const info = resolver(token.parsed.fullPath);

            // Build navigate callback if click handler is configured
            const onNavigate = clickHandler && info ? () => {
                clickHandler({
                    FullToken: token.fullToken,
                    QueryName: token.parsed.queryName,
                    CategorySegments: token.parsed.categorySegments,
                    FullPath: token.parsed.fullPath,
                    MouseEvent: new MouseEvent('click')
                });
            } : undefined;

            return {
                pos: token.from,
                end: token.to,
                above: true,
                create(): { dom: HTMLElement } {
                    const dom = document.createElement('div');
                    dom.className = 'cm-tooltip cm-composition-tooltip';
                    dom.appendChild(buildTooltipDOM(info, token.parsed.fullPath, onNavigate));
                    return { dom };
                }
            };
        }, { hoverTime: 300 }));
    }

    return extensions;
}
