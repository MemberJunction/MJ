import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PurifyRichTextHtml } from './rich-text-sanitize';

/**
 * Renders untrusted HTML safely — keeping SVG and richer markup — for use with
 * `[innerHTML]`. Sanitizes with DOMPurify (HTML + SVG profiles) and then wraps
 * the cleaned string with `bypassSecurityTrustHtml`, so Angular doesn't strip
 * the now-safe SVG/styles a second time.
 *
 * Pure pipe → Angular memoizes by input value, so it only re-sanitizes when the
 * string actually changes (cheap under OnPush).
 *
 * @example
 * ```html
 * <div [innerHTML]="someHtmlString | mjSafeRichHtml"></div>
 * ```
 */
@Pipe({
    name: 'mjSafeRichHtml',
    standalone: true,
    pure: true,
})
export class MJSafeRichHtmlPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);

    transform(value: string | null | undefined): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(PurifyRichTextHtml(value));
    }
}
