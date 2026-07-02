/**
 * Format a language identifier for display (e.g. "ts" -> "TypeScript").
 *
 * Pure string mapping with no DOM dependency, shared by the web copy-button
 * toolbar and the React Native code-block header. Lookup is case-insensitive and
 * collapses aliases to one canonical label (e.g. `js`/`javascript` → `JavaScript`,
 * `yml`/`yaml` → `YAML`).
 *
 * @param language The raw language id from a fenced code block (any casing).
 * @returns The display name for a known language, or — for an unknown id — the
 *          input uppercased as a reasonable fallback (an empty string maps to `''`).
 */
export function formatLanguageName(language: string): string {
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
