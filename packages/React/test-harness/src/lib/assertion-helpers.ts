export class AssertionHelpers {
  static containsText(html: string, text: string): boolean {
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return textContent.includes(text);
  }

  static hasElement(html: string, selector: string): boolean {
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

  static countElements(html: string, tagName: string): number {
    const regex = new RegExp(`<${tagName}[\\s>]`, 'gi');
    const matches = html.match(regex);
    return matches ? matches.length : 0;
  }

  static hasAttribute(html: string, selector: string, attribute: string, value?: string): boolean {
    if (!this.hasElement(html, selector)) {
      return false;
    }

    if (value === undefined) {
      // Just check if attribute exists
      return html.includes(` ${attribute}=`) || html.includes(` ${attribute} `) || html.includes(` ${attribute}>`);
    }

    // Check for specific attribute value
    return html.includes(`${attribute}="${value}"`) || html.includes(`${attribute}='${value}'`);
  }

  static extractTextContent(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  static assertNoErrors(result: { errors: string[] }): void {
    if (result.errors.length > 0) {
      throw new Error(`Component execution had errors: ${result.errors.join(', ')}`);
    }
  }

  static assertSuccess(result: { success: boolean; errors: string[] }): void {
    if (!result.success) {
      throw new Error(`Component execution failed: ${result.errors.join(', ')}`);
    }
  }

  static findConsoleErrors(consoleLogs: { type: string; text: string }[]): string[] {
    return consoleLogs
      .filter(log => log.type === 'error')
      .map(log => log.text);
  }

  static findConsoleWarnings(consoleLogs: { type: string; text: string }[]): string[] {
    return consoleLogs
      .filter(log => log.type === 'warning')
      .map(log => log.text);
  }

  static assertNoConsoleErrors(consoleLogs: { type: string; text: string }[]): void {
    const errors = this.findConsoleErrors(consoleLogs);
    if (errors.length > 0) {
      throw new Error(`Console errors found: ${errors.join(', ')}`);
    }
  }

  static assertContainsText(html: string, text: string): void {
    if (!this.containsText(html, text)) {
      throw new Error(`Text "${text}" not found in rendered output`);
    }
  }

  static assertNotContainsText(html: string, text: string): void {
    if (this.containsText(html, text)) {
      throw new Error(`Text "${text}" found in rendered output but should not be present`);
    }
  }

  static assertHasElement(html: string, selector: string): void {
    if (!this.hasElement(html, selector)) {
      throw new Error(`Element "${selector}" not found in rendered output`);
    }
  }

  static assertElementCount(html: string, tagName: string, expectedCount: number): void {
    const actualCount = this.countElements(html, tagName);
    if (actualCount !== expectedCount) {
      throw new Error(`Expected ${expectedCount} "${tagName}" elements but found ${actualCount}`);
    }
  }

  static createMatcher(html: string) {
    return {
      toContainText: (text: string) => this.assertContainsText(html, text),
      toHaveElement: (selector: string) => this.assertHasElement(html, selector),
      toHaveElementCount: (tagName: string, count: number) => this.assertElementCount(html, tagName, count),
      toHaveAttribute: (selector: string, attribute: string, value?: string) => {
        if (!this.hasAttribute(html, selector, attribute, value)) {
          throw new Error(`Element "${selector}" does not have attribute "${attribute}"${value ? ` with value "${value}"` : ''}`);
        }
      }
    };
  }
}