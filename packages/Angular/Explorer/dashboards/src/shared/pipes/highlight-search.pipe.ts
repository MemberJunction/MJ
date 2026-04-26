import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EscapeHTML } from '@memberjunction/global';

/**
 * Pipe to highlight search terms within text.
 * Usage: {{ text | highlightSearch:searchTerm }}
 *
 * The matching portions will be wrapped in a <mark class="search-highlight"> tag.
 */
@Pipe({
  standalone: false,
  name: 'highlightSearch'
})
export class HighlightSearchPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined, searchTerm: string | null | undefined): SafeHtml | string {
    if (!value) {
      return '';
    }

    if (!searchTerm || searchTerm.trim() === '') {
      return EscapeHTML(value);
    }

    // Escape special regex characters in the search term
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a case-insensitive regex
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');

    // Split text by the search term and escape each part,
    // wrapping matching terms in the <mark> tags.
    const parts = value.split(regex);
    const highlighted = parts.map((part, index) => {
      // The split regex includes the capturing group, so matching parts
      // will be at odd indices (1, 3, 5, etc.).
      if (index % 2 === 1) {
        return `<mark class="search-highlight">${EscapeHTML(part)}</mark>`;
      }
      return EscapeHTML(part);
    }).join('');

    // Return as SafeHtml to allow innerHTML binding securely
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
}
