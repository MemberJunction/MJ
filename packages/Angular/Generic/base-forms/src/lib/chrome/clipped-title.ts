/** True when the element's text is ellipsized (horizontal or vertical). */
export function IsTextClipped(el: HTMLElement | null | undefined): boolean {
    if (!el) return false;
    return el.scrollWidth - el.clientWidth > 1
        || el.scrollHeight - el.clientHeight > 1;
}

/**
 * Native tooltip only when the visible text is clipped. Clears `title`
 * when the full string already fits so hover is not noisy.
 */
export function ApplyClippedTitle(el: HTMLElement | null | undefined, text: string): void {
    if (!el) return;
    const title = (text ?? '').trim();
    el.title = title && IsTextClipped(el) ? title : '';
}
