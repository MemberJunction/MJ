/**
 * Code copy extension utilities
 *
 * This module provides utilities for adding copy-to-clipboard functionality
 * to code blocks. Unlike other marked extensions, this operates on the DOM
 * after rendering since it requires adding interactive elements.
 */

/**
 * Options for the code copy functionality
 */
export interface CodeCopyOptions {
  /**
   * CSS class for the copy button
   * @default 'code-copy-btn'
   */
  buttonClass?: string;

  /**
   * CSS class for the toolbar container
   * @default 'code-toolbar'
   */
  toolbarClass?: string;

  /**
   * Icon HTML for the copy button
   * @default '<i class="fas fa-copy"></i>'
   */
  copyIcon?: string;

  /**
   * Icon HTML for successful copy
   * @default '<i class="fas fa-check"></i>'
   */
  successIcon?: string;

  /**
   * Icon HTML for failed copy
   * @default '<i class="fas fa-times"></i>'
   */
  errorIcon?: string;

  /**
   * Tooltip text for the copy button
   * @default 'Copy code'
   */
  tooltipText?: string;

  /**
   * Duration in ms to show success/error state
   * @default 2000
   */
  feedbackDuration?: number;

  /**
   * Callback when code is successfully copied
   */
  onCopy?: (code: string) => void;

  /**
   * Callback when copy fails
   */
  onError?: (error: Error) => void;

  /**
   * Whether to show the language label in the toolbar
   * @default true
   */
  showLanguageLabel?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<CodeCopyOptions, 'onCopy' | 'onError'>> & Pick<CodeCopyOptions, 'onCopy' | 'onError'> = {
  buttonClass: 'code-copy-btn',
  toolbarClass: 'code-toolbar',
  copyIcon: '<i class="fas fa-copy"></i>',
  successIcon: '<i class="fas fa-check"></i>',
  errorIcon: '<i class="fas fa-times"></i>',
  tooltipText: 'Copy code',
  feedbackDuration: 2000,
  showLanguageLabel: true,
  onCopy: undefined,
  onError: undefined
};

/**
 * Add copy buttons to all code blocks within a container
 * @param container The DOM element containing code blocks
 * @param options Configuration options
 */
export function addCopyButtonsToCodeBlocks(
  container: HTMLElement,
  options?: CodeCopyOptions
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const codeBlocks = container.querySelectorAll('pre > code');

  codeBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;
    if (!pre) return;

    // Skip if already has toolbar
    if (pre.querySelector(`.${opts.toolbarClass}`)) return;

    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = opts.toolbarClass;

    // Add language label if enabled
    if (opts.showLanguageLabel) {
      const language = extractLanguageFromCode(codeBlock);
      if (language) {
        const label = document.createElement('span');
        label.className = 'code-language-label';
        label.textContent = formatLanguageName(language);
        toolbar.appendChild(label);
      }
    }

    // Create copy button
    const button = document.createElement('button');
    button.className = opts.buttonClass;
    button.innerHTML = opts.copyIcon;
    button.title = opts.tooltipText;
    button.type = 'button';
    button.setAttribute('aria-label', opts.tooltipText);

    // Add click handler
    button.addEventListener('click', async () => {
      const code = codeBlock.textContent || '';

      try {
        await navigator.clipboard.writeText(code);

        // Show success state
        button.innerHTML = opts.successIcon;
        button.classList.add('copied');

        // Call success callback
        opts.onCopy?.(code);

        // Reset after delay
        setTimeout(() => {
          button.innerHTML = opts.copyIcon;
          button.classList.remove('copied');
        }, opts.feedbackDuration);
      } catch (err) {
        console.error('Failed to copy code:', err);

        // Show error state
        button.innerHTML = opts.errorIcon;
        button.classList.add('error');

        // Call error callback
        opts.onError?.(err as Error);

        // Reset after delay
        setTimeout(() => {
          button.innerHTML = opts.copyIcon;
          button.classList.remove('error');
        }, opts.feedbackDuration);
      }
    });

    toolbar.appendChild(button);

    // Position the pre element for absolute positioning of toolbar
    pre.style.position = 'relative';
    pre.insertBefore(toolbar, pre.firstChild);
  });
}

/**
 * Extract the language class from a code element
 */
function extractLanguageFromCode(codeElement: Element): string | null {
  const classes = codeElement.className.split(' ');

  for (const cls of classes) {
    if (cls.startsWith('language-')) {
      return cls.replace('language-', '');
    }
  }

  return null;
}

/**
 * Format a language identifier for display
 */
function formatLanguageName(language: string): string {
  const languageMap: Record<string, string> = {
    js: 'JavaScript',
    ts: 'TypeScript',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    py: 'Python',
    python: 'Python',
    rb: 'Ruby',
    ruby: 'Ruby',
    cs: 'C#',
    csharp: 'C#',
    cpp: 'C++',
    'c++': 'C++',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    less: 'Less',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    xml: 'XML',
    sql: 'SQL',
    bash: 'Bash',
    shell: 'Shell',
    sh: 'Shell',
    zsh: 'Zsh',
    powershell: 'PowerShell',
    ps1: 'PowerShell',
    md: 'Markdown',
    markdown: 'Markdown',
    graphql: 'GraphQL',
    gql: 'GraphQL',
    java: 'Java',
    kotlin: 'Kotlin',
    swift: 'Swift',
    go: 'Go',
    rust: 'Rust',
    php: 'PHP',
    r: 'R',
    dockerfile: 'Dockerfile',
    docker: 'Docker',
    nginx: 'Nginx',
    apache: 'Apache',
    ini: 'INI',
    toml: 'TOML',
    makefile: 'Makefile',
    diff: 'Diff',
    plaintext: 'Plain Text',
    text: 'Plain Text',
    mermaid: 'Mermaid'
  };

  return languageMap[language.toLowerCase()] || language.toUpperCase();
}

/**
 * Remove all copy buttons from code blocks in a container
 * Useful for cleanup when component is destroyed
 */
export function removeCopyButtonsFromCodeBlocks(
  container: HTMLElement,
  toolbarClass: string = 'code-toolbar'
): void {
  const toolbars = container.querySelectorAll(`.${toolbarClass}`);
  toolbars.forEach((toolbar) => toolbar.remove());
}
