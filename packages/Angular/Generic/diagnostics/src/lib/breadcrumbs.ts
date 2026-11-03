import { DiagnosticBreadcrumb } from '@memberjunction/diagnostics';

/** Elements a click breadcrumb names in place of the element the pointer hit. */
const CONTROL_SELECTOR = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'label',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="checkbox"]',
    '[role="switch"]',
].join(', ');
const FORM_FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const MAX_LABEL_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 300;
const MAX_CLASS_NAMES = 2;

/**
 * Names a clicked element for a breadcrumb. A control is named as `tag#id[type=…][name=…] "label"`,
 * with the label from `aria-label`, `title`, a field's placeholder or the control's own text.
 * A plain element is named as `tag#id.class`. A field's value and a plain element's text are never read.
 */
export function DescribeClickTarget(clicked: Element): string {
    const control = clicked.closest(CONTROL_SELECTOR);
    if (!control) {
        return `${clicked.tagName.toLowerCase()}${idPart(clicked)}${classPart(clicked)}`;
    }
    const tag = control.tagName.toLowerCase();
    const label = controlLabel(control, tag);
    return `${tag}${idPart(control)}${fieldPart(control, tag)}${label ? ` "${label}"` : ''}`;
}

/** The breadcrumb for a click, or `null` when the click did not hit an element. */
export function ClickBreadcrumb(event: Event, route: string | undefined): DiagnosticBreadcrumb | null {
    if (!isElement(event.target)) {
        return null;
    }
    return { timestamp: new Date().toISOString(), type: 'click', target: DescribeClickTarget(event.target), route };
}

/** The breadcrumb for an uncaught error. */
export function ErrorBreadcrumb(event: ErrorEvent): DiagnosticBreadcrumb {
    return {
        timestamp: new Date().toISOString(),
        type: 'error',
        target: shorten(event.message || 'Script error', MAX_MESSAGE_LENGTH),
        detail: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    };
}

/** The breadcrumb for an unhandled promise rejection. */
export function RejectionBreadcrumb(event: PromiseRejectionEvent): DiagnosticBreadcrumb {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    return {
        timestamp: new Date().toISOString(),
        type: 'error',
        target: shorten(reason, MAX_MESSAGE_LENGTH),
        detail: 'Unhandled promise rejection',
    };
}

/** The breadcrumb for a page the user went to. The query string and fragment are left out. */
export function RouteBreadcrumb(url: string): DiagnosticBreadcrumb {
    const path = url.split(/[?#]/, 1)[0] || '/';
    return { timestamp: new Date().toISOString(), type: 'route', target: path, route: path };
}

/**
 * Passes clicks, uncaught errors and unhandled promise rejections to `record` as breadcrumbs.
 * Clicks are read in the capture phase, so a handler that stops propagation does not hide them.
 * Returns a function that removes the listeners. Does nothing outside a browser.
 */
export function RegisterBreadcrumbListeners(record: (crumb: DiagnosticBreadcrumb) => void): () => void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return () => undefined;
    }
    const clickOptions: AddEventListenerOptions = { capture: true, passive: true };
    const onClick = (event: MouseEvent): void => recordSafely(record, () => ClickBreadcrumb(event, window.location?.pathname));
    const onError = (event: ErrorEvent): void => recordSafely(record, () => ErrorBreadcrumb(event));
    const onRejection = (event: PromiseRejectionEvent): void => recordSafely(record, () => RejectionBreadcrumb(event));
    document.addEventListener('click', onClick, clickOptions);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
        document.removeEventListener('click', onClick, clickOptions);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
    };
}

/** Records a breadcrumb. A failure to build one is ignored, so capture never breaks the page. */
function recordSafely(record: (crumb: DiagnosticBreadcrumb) => void, build: () => DiagnosticBreadcrumb | null): void {
    try {
        const crumb = build();
        if (crumb) {
            record(crumb);
        }
    } catch {
        // A breadcrumb is best effort.
    }
}

function isElement(target: EventTarget | null): target is Element {
    return !!target && typeof (target as Element).closest === 'function';
}

function idPart(element: Element): string {
    return element.id ? `#${element.id}` : '';
}

/** Up to two class names, without Angular's generated `ng-` classes. */
function classPart(element: Element): string {
    const names = (element.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((name) => name.length > 0 && !name.startsWith('ng-'))
        .slice(0, MAX_CLASS_NAMES);
    return names.map((name) => `.${name}`).join('');
}

function fieldPart(control: Element, tag: string): string {
    if (!FORM_FIELD_TAGS.has(tag)) {
        return '';
    }
    return ['type', 'name']
        .map((attribute) => {
            const value = control.getAttribute(attribute);
            return value ? `[${attribute}=${value}]` : '';
        })
        .join('');
}

function controlLabel(control: Element, tag: string): string {
    const ownText = FORM_FIELD_TAGS.has(tag) ? control.getAttribute('placeholder') : control.textContent;
    const raw = control.getAttribute('aria-label') || control.getAttribute('title') || ownText || '';
    return shorten(raw, MAX_LABEL_LENGTH);
}

/** Collapses whitespace and cuts the text to `max` characters. */
function shorten(text: string, max: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
