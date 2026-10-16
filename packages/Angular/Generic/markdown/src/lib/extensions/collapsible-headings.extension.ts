/**
 * Web-only DOM helpers for collapsible heading sections.
 *
 * The framework-agnostic marked extension that produces the nested
 * `<div class="collapsible-section">` HTML (`createCollapsibleHeadingsExtension`)
 * now lives in `@memberjunction/markdown-core`. This file keeps the browser-only
 * helpers that toggle the rendered sections in a live DOM.
 */

/**
 * Helper function to toggle a collapsible section programmatically
 */
export function ToggleCollapsibleSection(sectionElement: HTMLElement): void {
  const isCollapsed = sectionElement.classList.contains('collapsed');
  const toggle = sectionElement.querySelector('.collapsible-toggle');

  sectionElement.classList.toggle('collapsed');

  if (toggle) {
    toggle.setAttribute('aria-expanded', String(isCollapsed));
  }
}

/** @deprecated Use {@link ToggleCollapsibleSection}. */
export function toggleCollapsibleSection(sectionElement: HTMLElement): void {
  return ToggleCollapsibleSection(sectionElement);
}

/**
 * Expand all collapsible sections in a container
 */
export function ExpandAllSections(container: HTMLElement): void {
  const sections = container.querySelectorAll('.collapsible-section.collapsed');
  sections.forEach((section) => {
    section.classList.remove('collapsed');
    const toggle = section.querySelector('.collapsible-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
    }
  });
}

/** @deprecated Use {@link ExpandAllSections}. */
export function expandAllSections(container: HTMLElement): void {
  return ExpandAllSections(container);
}

/**
 * Collapse all collapsible sections in a container
 */
export function CollapseAllSections(container: HTMLElement): void {
  const sections = container.querySelectorAll('.collapsible-section:not(.collapsed)');
  sections.forEach((section) => {
    section.classList.add('collapsed');
    const toggle = section.querySelector('.collapsible-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

/** @deprecated Use {@link CollapseAllSections}. */
export function collapseAllSections(container: HTMLElement): void {
  return CollapseAllSections(container);
}

/**
 * Expand sections to reveal a specific heading by ID
 */
export function ExpandToHeading(container: HTMLElement, headingId: string): void {
  const heading = container.querySelector(`#${headingId}`);
  if (!heading) return;

  // Find all ancestor collapsible sections and expand them
  let current: HTMLElement | null = heading.closest('.collapsible-section');
  while (current) {
    if (current.classList.contains('collapsed')) {
      current.classList.remove('collapsed');
      const toggle = current.querySelector(':scope > .collapsible-heading-wrapper .collapsible-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
      }
    }
    current = current.parentElement?.closest('.collapsible-section') || null;
  }
}

/** @deprecated Use {@link ExpandToHeading}. */
export function expandToHeading(container: HTMLElement, headingId: string): void {
  return ExpandToHeading(container, headingId);
}
