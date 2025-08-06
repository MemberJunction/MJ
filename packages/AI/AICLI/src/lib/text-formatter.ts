import chalk from 'chalk';

export interface TextFormattingOptions {
  maxWidth?: number;
  indent?: number;
  preserveParagraphs?: boolean;
  highlightCode?: boolean;
  trimEmptyLines?: boolean;
}

export class TextFormatter {
  private static readonly DEFAULT_MAX_WIDTH = 80;
  private static readonly DEFAULT_INDENT = 0;

  /**
   * Wraps text to fit within console width, preserving formatting
   */
  static formatText(text: string, options: TextFormattingOptions = {}): string {
    const {
      maxWidth = this.getConsoleWidth(),
      indent = this.DEFAULT_INDENT,
      preserveParagraphs = true,
      highlightCode = true,
      trimEmptyLines = true
    } = options;

    if (!text || typeof text !== 'string') {
      return '';
    }

    // Split into paragraphs
    const paragraphs = preserveParagraphs 
      ? text.split(/\n\s*\n/)
      : [text];

    const formattedParagraphs = paragraphs.map(paragraph => {
      // Handle code blocks
      if (highlightCode && this.isCodeBlock(paragraph)) {
        return this.formatCodeBlock(paragraph, indent, maxWidth);
      }

      // Handle bullet points and numbered lists
      if (this.isList(paragraph)) {
        return this.formatList(paragraph, indent, maxWidth);
      }

      // Regular paragraph
      return this.wrapText(paragraph, maxWidth - indent, indent);
    });

    let result = formattedParagraphs.join('\n\n');

    // Trim excessive empty lines
    if (trimEmptyLines) {
      result = result.replace(/\n{3,}/g, '\n\n');
    }

    return result;
  }

  /**
   * Formats JSON output with syntax highlighting
   */
  static formatJSON(obj: any, indent: number = 2): string {
    try {
      const json = JSON.stringify(obj, null, indent);
      return this.highlightJSON(json);
    } catch {
      return JSON.stringify(obj, null, indent);
    }
  }

  /**
   * Simple word wrap implementation
   */
  private static wrapText(text: string, maxWidth: number, indent: number = 0): string {
    if (!text) return '';

    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const indentStr = ' '.repeat(indent);

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.map((line, i) => i === 0 ? line : indentStr + line).join('\n');
  }

  /**
   * Get console width with fallback
   */
  private static getConsoleWidth(): number {
    return process.stdout.columns || this.DEFAULT_MAX_WIDTH;
  }

  /**
   * Check if text looks like a code block
   */
  private static isCodeBlock(text: string): boolean {
    return text.includes('```') || 
           text.includes('    ') || 
           /^[\s]*{/.test(text) ||
           /^[\s]*\[/.test(text);
  }

  /**
   * Check if text is a list
   */
  private static isList(text: string): boolean {
    const lines = text.split('\n');
    return lines.some(line => 
      /^[\s]*[-*•]/.test(line) || // Bullet points
      /^[\s]*\d+[.)]/.test(line)   // Numbered lists
    );
  }

  /**
   * Format code blocks with highlighting
   */
  private static formatCodeBlock(code: string, indent: number, maxWidth: number): string {
    const indentStr = ' '.repeat(indent);
    const codeLines = code.split('\n');
    
    return codeLines.map(line => {
      // Preserve code indentation but wrap if too long
      if (line.length > maxWidth - indent) {
        return indentStr + chalk.gray(line.substring(0, maxWidth - indent - 3) + '...');
      }
      return indentStr + chalk.gray(line);
    }).join('\n');
  }

  /**
   * Format lists with proper indentation
   */
  private static formatList(text: string, indent: number, maxWidth: number): string {
    const lines = text.split('\n');
    const indentStr = ' '.repeat(indent);
    const listIndent = 4; // Additional indent for wrapped list items

    return lines.map(line => {
      const match = line.match(/^([\s]*)([-*•]|\d+[.)])(.*)/);
      if (match) {
        const [, leadingSpace, marker, content] = match;
        const firstLineIndent = leadingSpace.length + marker.length + 1;
        
        // Wrap the list item content
        const wrapped = this.wrapText(
          content.trim(), 
          maxWidth - indent - firstLineIndent, 
          firstLineIndent
        );
        
        return indentStr + leadingSpace + marker + ' ' + wrapped.trim();
      }
      return indentStr + line;
    }).join('\n');
  }

  /**
   * Basic JSON syntax highlighting
   */
  private static highlightJSON(json: string): string {
    return json
      .replace(/"([^"]+)":/g, chalk.cyan('"$1":')) // Keys
      .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"')) // String values
      .replace(/: (\d+)/g, ': ' + chalk.yellow('$1')) // Numbers
      .replace(/: (true|false)/g, ': ' + chalk.blue('$1')) // Booleans
      .replace(/: null/g, ': ' + chalk.gray('null')); // Null
  }

  /**
   * Format a divider line
   */
  static divider(char: string = '─', width?: number): string {
    const w = width || this.getConsoleWidth();
    return chalk.dim(char.repeat(w));
  }

  /**
   * Format with a box border
   */
  static box(text: string, options: { padding?: number; width?: number } = {}): string {
    const { padding = 1, width = this.getConsoleWidth() - 4 } = options;
    const lines = text.split('\n');
    const paddingStr = ' '.repeat(padding);
    
    const top = '┌' + '─'.repeat(width + padding * 2) + '┐';
    const bottom = '└' + '─'.repeat(width + padding * 2) + '┘';
    
    const content = lines.map(line => {
      const wrapped = this.wrapText(line, width, 0);
      return wrapped.split('\n').map(l => 
        '│' + paddingStr + l.padEnd(width) + paddingStr + '│'
      ).join('\n');
    }).join('\n');
    
    return chalk.dim(top) + '\n' + content + '\n' + chalk.dim(bottom);
  }
}