import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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

  transform(value: string | null | undefined, searchTerm: string | null | undefined): SafeHtml {
    if (!value) {
      return '';
    }

    if (!searchTerm || searchTerm.trim() === '') {
      return value;
    }

    // Escape special regex characters in the search term
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a case-insensitive regex
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');

    // Replace matches with highlighted version
    const highlighted = value.replace(regex, '<mark class="search-highlight">$1</mark>');

    // Return as SafeHtml to allow innerHTML binding
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
}
