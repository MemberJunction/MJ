export class AssertionHelpers {
  static ContainsText(html: string, text: string): boolean {
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return textContent.includes(text);
  }

  /** @deprecated Use {@link ContainsText}. */
  static containsText(html: string, text: string): boolean {
    return this.ContainsText(html, text);
  }

  static HasElement(html: string, selector: string): boolean {
    // Simple selector matching for common cases
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      return html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
    }
    
    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      return html.includes(`class="${className}"`) || 
             html.includes(`class='${className}'`) ||
             html.includes(`class="${className} `) ||
             html.includes(`class='${className} `) ||
             html.includes(` ${className}"`) ||
             html.includes(` ${className}'`) ||
             html.includes(` ${className} `);
    }
    
    // Tag name selector
    return html.includes(`<${selector}`) || html.includes(`<${selector} `) || html.includes(`<${selector}>`);
  }

  /** @deprecated Use {@link HasElement}. */
  static hasElement(html: string, selector: string): boolean {
    return this.HasElement(html, selector);
  }

  static CountElements(html: string, tagName: string): number {
    const regex = new RegExp(`<${tagName}[\\s>]`, 'gi');
    const matches = html.match(regex);
    return matches ? matches.length : 0;
  }

  /** @deprecated Use {@link CountElements}. */
  static countElements(html: string, tagName: string): number {
    return this.CountElements(html, tagName);
  }

  static HasAttribute(html: string, selector: string, attribute: string, value?: string): boolean {
    if (!this.HasElement(html, selector)) {
      return false;
    }

    if (value === undefined) {
      // Just check if attribute exists
      return html.includes(` ${attribute}=`) || html.includes(` ${attribute} `) || html.includes(` ${attribute}>`);
    }

    // Check for specific attribute value
    return html.includes(`${attribute}="${value}"`) || html.includes(`${attribute}='${value}'`);
  }

  /** @deprecated Use {@link HasAttribute}. */
  static hasAttribute(html: string, selector: string, attribute: string, value?: string): boolean {
    return this.HasAttribute(html, selector, attribute, value);
  }

  static ExtractTextContent(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** @deprecated Use {@link ExtractTextContent}. */
  static extractTextContent(html: string): string {
    return this.ExtractTextContent(html);
  }

  static AssertNoErrors(result: { errors: string[] }): void {
    if (result.errors.length > 0) {
      throw new Error(`Component execution had errors: ${result.errors.join(', ')}`);
    }
  }

  /** @deprecated Use {@link AssertNoErrors}. */
  static assertNoErrors(result: { errors: string[] }): void {
    return this.AssertNoErrors(result);
  }

  static AssertSuccess(result: { success: boolean; errors: string[] }): void {
    if (!result.success) {
      throw new Error(`Component execution failed: ${result.errors.join(', ')}`);
    }
  }

  /** @deprecated Use {@link AssertSuccess}. */
  static assertSuccess(result: { success: boolean; errors: string[] }): void {
    return this.AssertSuccess(result);
  }

  static FindConsoleErrors(consoleLogs: { type: string; text: string }[]): string[] {
    return consoleLogs
      .filter(log => log.type === 'error')
      .map(log => log.text);
  }

  /** @deprecated Use {@link FindConsoleErrors}. */
  static findConsoleErrors(consoleLogs: { type: string; text: string }[]): string[] {
    return this.FindConsoleErrors(consoleLogs);
  }

  static FindConsoleWarnings(consoleLogs: { type: string; text: string }[]): string[] {
    return consoleLogs
      .filter(log => log.type === 'warning')
      .map(log => log.text);
  }

  /** @deprecated Use {@link FindConsoleWarnings}. */
  static findConsoleWarnings(consoleLogs: { type: string; text: string }[]): string[] {
    return this.FindConsoleWarnings(consoleLogs);
  }

  static AssertNoConsoleErrors(consoleLogs: { type: string; text: string }[]): void {
    const errors = this.FindConsoleErrors(consoleLogs);
    if (errors.length > 0) {
      throw new Error(`Console errors found: ${errors.join(', ')}`);
    }
  }

  /** @deprecated Use {@link AssertNoConsoleErrors}. */
  static assertNoConsoleErrors(consoleLogs: { type: string; text: string }[]): void {
    return this.AssertNoConsoleErrors(consoleLogs);
  }

  static AssertContainsText(html: string, text: string): void {
    if (!this.ContainsText(html, text)) {
      throw new Error(`Text "${text}" not found in rendered output`);
    }
  }

  /** @deprecated Use {@link AssertContainsText}. */
  static assertContainsText(html: string, text: string): void {
    return this.AssertContainsText(html, text);
  }

  static AssertNotContainsText(html: string, text: string): void {
    if (this.ContainsText(html, text)) {
      throw new Error(`Text "${text}" found in rendered output but should not be present`);
    }
  }

  /** @deprecated Use {@link AssertNotContainsText}. */
  static assertNotContainsText(html: string, text: string): void {
    return this.AssertNotContainsText(html, text);
  }

  static AssertHasElement(html: string, selector: string): void {
    if (!this.HasElement(html, selector)) {
      throw new Error(`Element "${selector}" not found in rendered output`);
    }
  }

  /** @deprecated Use {@link AssertHasElement}. */
  static assertHasElement(html: string, selector: string): void {
    return this.AssertHasElement(html, selector);
  }

  static AssertElementCount(html: string, tagName: string, expectedCount: number): void {
    const actualCount = this.CountElements(html, tagName);
    if (actualCount !== expectedCount) {
      throw new Error(`Expected ${expectedCount} "${tagName}" elements but found ${actualCount}`);
    }
  }

  /** @deprecated Use {@link AssertElementCount}. */
  static assertElementCount(html: string, tagName: string, expectedCount: number): void {
    return this.AssertElementCount(html, tagName, expectedCount);
  }

  static CreateMatcher(html: string) {
    return {
      toContainText: (text: string) => this.AssertContainsText(html, text),
      toHaveElement: (selector: string) => this.AssertHasElement(html, selector),
      toHaveElementCount: (tagName: string, count: number) => this.AssertElementCount(html, tagName, count),
      toHaveAttribute: (selector: string, attribute: string, value?: string) => {
        if (!this.HasAttribute(html, selector, attribute, value)) {
          throw new Error(`Element "${selector}" does not have attribute "${attribute}"${value ? ` with value "${value}"` : ''}`);
        }
      }
    };
  }

  /** @deprecated Use {@link CreateMatcher}. */
  static createMatcher(html: string) {
    return this.CreateMatcher(html);
  }
}