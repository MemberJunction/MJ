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
const MAX_MESSAGE_LENGTH = 300;
const MAX_ATTRIBUTE_LENGTH = 60;
/** A plain identifier: a letter, then letters, digits, `_`, `:`, `.` or `-`. */
const PLAIN_IDENTIFIER = /^[A-Za-z][\w:.-]*$/;
/** Attributes a click breadcrumb may name, after `#id`. None of them holds visible text. */
const DESCRIBED_ATTRIBUTES = ['role', 'type', 'name', 'data-testid', 'data-test-id'];

/**
 * Names a clicked element for a breadcrumb as `tag#id[role=…][type=…][name=…][data-testid=…]`.
 * A click inside a control names the control. Visible text, labels, titles, placeholders, classes
 * and field values are never recorded; an identifier that is not a plain identifier, or contains
 * the element's text, is left out.
 */
export function DescribeClickTarget(clicked: Element): string {
    const target = clicked.closest(CONTROL_SELECTOR) ?? clicked;
    const text = (target.textContent ?? '').replace(/\s+/g, ' ').trim();
    const usable = (value: string | null): value is string => isSafeIdentifier(value, text);
    const id = usable(target.id) ? `#${target.id}` : '';
    const attributes = DESCRIBED_ATTRIBUTES.map((name) => {
        const value = target.getAttribute(name);
        return usable(value) ? `[${name}=${value}]` : '';
    }).join('');
    return `${target.tagName.toLowerCase()}${id}${attributes}`;
}

/**
 * True for a plain identifier of 60 characters or fewer that does not contain the element's text.
 * A value with `@`, whitespace or other punctuation can hold record data, so it is left out.
 */
function isSafeIdentifier(value: string | null, elementText: string): value is string {
    if (!value || value.length > MAX_ATTRIBUTE_LENGTH || !PLAIN_IDENTIFIER.test(value)) {
        return false;
    }
    return !elementText || !value.toLowerCase().includes(elementText.toLowerCase());
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

/** Collapses whitespace and cuts the text to `max` characters. */
function shorten(text: string, max: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
