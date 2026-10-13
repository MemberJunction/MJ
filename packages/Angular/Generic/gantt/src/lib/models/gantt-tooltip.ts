/** Selector for every left-grid cell. Hover tooltips filter to the name/tree column. */
export const GANTT_GRID_CELL_TOOLTIP_SELECTOR = '.gantt_cell[data-column-name]';

const TOOLTIP_STYLE_ID = 'mj-gantt-tooltip-style';

const TOOLTIP_STYLES = `
.gantt_tooltip {
    max-width: 320px;
    white-space: normal;
    word-break: break-word;
    background: var(--mj-text-primary);
    color: var(--mj-bg-surface);
    border: 1px solid var(--mj-border-strong);
    box-shadow: var(--mj-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.24));
    padding: 8px 12px;
    z-index: 10000;
}
.mj-gantt-tooltip {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.mj-gantt-tooltip__name {
    font-weight: 600;
}
.mj-gantt-tooltip__meta {
    opacity: 0.85;
    font-size: 0.85em;
}
`;

/**
 * DHTMLX appends `.gantt_tooltip` to `document.body`, so component-scoped
 * `:host` token remaps never reach it. Inject once against `:root` tokens.
 */
export function EnsureGanttTooltipStyles(): void {
    if (typeof document === 'undefined') {
        return;
    }
    if (document.getElementById(TOOLTIP_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = TOOLTIP_STYLE_ID;
    style.textContent = TOOLTIP_STYLES;
    document.head.appendChild(style);
}

export function EscapeGanttHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export interface GanttTooltipFields {
    Name: string;
    Start?: Date | string | null;
    End?: Date | string | null;
    Progress?: number | null;
}

/** HTML for the DHTMLX tooltip. Empty string means "do not show". */
export function BuildGanttTaskTooltipHtml(fields: GanttTooltipFields): string {
    const name = fields.Name.trim();
    if (!name) {
        return '';
    }
    const parts = [
        `<div class="mj-gantt-tooltip__name">${EscapeGanttHtml(name)}</div>`,
    ];
    const meta = formatTooltipMeta(fields);
    if (meta) {
        parts.push(`<div class="mj-gantt-tooltip__meta">${EscapeGanttHtml(meta)}</div>`);
    }
    return `<div class="mj-gantt-tooltip">${parts.join('')}</div>`;
}

function formatTooltipMeta(fields: GanttTooltipFields): string {
    const start = formatTooltipDate(fields.Start);
    const end = formatTooltipDate(fields.End);
    const progress = formatTooltipProgress(fields.Progress);
    const range = start && end ? `${start} – ${end}` : start || end || '';
    if (range && progress) {
        return `${range} · ${progress}`;
    }
    return range || progress || '';
}

function formatTooltipDate(value: Date | string | null | undefined): string {
    if (value == null || value === '') {
        return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatTooltipProgress(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
        return '';
    }
    const percent = value > 1 ? value : value * 100;
    return `${Math.round(percent)}%`;
}
