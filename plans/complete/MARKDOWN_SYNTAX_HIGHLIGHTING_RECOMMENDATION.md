# Markdown Syntax Highlighting Recommendation

## Current Situation

The Component Artifact Viewer currently renders markdown using `marked.js` but **does not** apply syntax highlighting to code blocks within the markdown. This means code snippets in functional requirements and technical design documents appear as plain text.

---

## The Problem

When viewing markdown like this:
```markdown
## Technical Design

The component uses this pattern:

```typescript
interface ComponentSpec {
  name: string;
  dependencies: string[];
}
```
```

The TypeScript code block renders without syntax highlighting - just monospace text with no color coding.

---

## Solution Options

### Option 1: **Highlight.js** (Recommended)
**Best for: MemberJunction's current use case**

#### Pros:
- ✅ Lightweight (~50 KB with common languages)
- ✅ Automatic language detection
- ✅ 190+ languages supported
- ✅ Works great with `marked.js` via `marked-highlight` extension
- ✅ Zero config needed for most cases
- ✅ Angular-friendly (no special integration needed)
- ✅ Widely used and well-maintained

#### Cons:
- ⚠️ Highlighting quality slightly lower than Shiki
- ⚠️ Less customization than Prism.js

#### Bundle Impact:
- Core: ~35 KB
- Common languages (TS, JS, JSON, SQL, Python): ~15 KB
- **Total: ~50 KB** (acceptable for MJ's use case)

---

### Option 2: **Prism.js**
**Best for: Maximum performance and customization**

#### Pros:
- ✅ Fastest performance (benchmark winner)
- ✅ Highly customizable themes
- ✅ Modular architecture (load only needed languages)
- ✅ Smaller bundle than Highlight.js
- ✅ Many plugins available

#### Cons:
- ❌ Weak TypeScript support
- ❌ No automatic language detection
- ⚠️ Requires manual language specification in markdown
- ⚠️ More setup required

#### Bundle Impact:
- Core: ~2 KB
- Languages (manual selection): ~5-10 KB per language
- **Total: ~20-30 KB** (smallest option)

---

### Option 3: **Shiki**
**Best for: VS Code-level highlighting quality**

#### Pros:
- ✅ Highest quality highlighting (uses VS Code engine)
- ✅ Uses TextMate grammars
- ✅ Perfect TypeScript support
- ✅ VS Code themes available
- ✅ Excellent for complex codebases

#### Cons:
- ❌ Heavy bundle size (~280 KB + WASM)
- ❌ 7x slower than Prism.js
- ❌ Not ideal for client-side rendering
- ❌ Overkill for simple markdown rendering

#### Bundle Impact:
- Core + WASM: ~280 KB
- Languages included
- **Total: ~280 KB** (too heavy for MJ)

---

## Recommendation: **Highlight.js with marked-highlight**

### Why Highlight.js?

1. **Sweet Spot**: Balance of performance, bundle size, and quality
2. **Easy Integration**: Works seamlessly with `marked.js` via `marked-highlight`
3. **Automatic Detection**: No need to specify languages in markdown
4. **TypeScript Support**: Good enough for MJ's technical documentation
5. **Maintenance**: Well-maintained, widely used, good community support

### Why NOT Prism.js?
- Weak TypeScript highlighting is a dealbreaker for MJ's technical docs
- Manual language specification adds friction for content authors

### Why NOT Shiki?
- 280 KB bundle is too heavy for client-side rendering
- Slower performance is unnecessary for MJ's use case
- Overkill for rendering markdown in metadata panels

---

## Implementation Plan

### Step 1: Install Dependencies

```bash
cd packages/Angular/Generic/artifacts
npm install marked-highlight highlight.js
```

### Step 2: Update Component Artifact Viewer

**File**: `component-artifact-viewer.component.ts`

```typescript
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

// Configure marked with highlight.js
private marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

// Update preprocessing method
private preprocessMetadata(): void {
  if (this.componentSpec.functionalRequirements) {
    const html = this.marked.parse(this.componentSpec.functionalRequirements);
    this.functionalRequirementsHTML = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
  }

  if (this.componentSpec.technicalDesign) {
    const html = this.marked.parse(this.componentSpec.technicalDesign);
    this.technicalDesignHTML = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
  }

  // ... rest of preprocessing
}
```

### Step 3: Import Highlight.js CSS Theme

**Option A: In global styles** (`packages/Angular/Generic/artifacts/src/lib/artifacts.module.ts` or `styles.scss`)
```typescript
// Import in TypeScript (if Angular supports this)
import 'highlight.js/styles/github-dark.css'; // or any theme

// OR add to angular.json styles array
"styles": [
  "node_modules/highlight.js/styles/github-dark.css",
  "src/styles.scss"
]
```

**Option B: In component styles** (`component-artifact-viewer.component.scss`)
```scss
@import 'highlight.js/styles/github-dark.css';
```

### Step 4: Available Themes

Highlight.js includes many themes. Choose one that matches MJ's design system:

**Light Themes:**
- `github.css` - GitHub-like light theme
- `stackoverflow-light.css` - Stack Overflow style
- `atom-one-light.css` - Atom editor light

**Dark Themes:**
- `github-dark.css` - GitHub dark mode
- `atom-one-dark.css` - Atom editor dark
- `vs2015.css` - Visual Studio 2015 dark

**Neutral:**
- `default.css` - Highlight.js default
- `monokai.css` - Popular Monokai theme

### Step 5: Verify Language Support

Common languages MJ users will use in technical docs:

- ✅ TypeScript (`typescript`, `ts`)
- ✅ JavaScript (`javascript`, `js`)
- ✅ JSON (`json`)
- ✅ SQL (`sql`)
- ✅ Python (`python`, `py`)
- ✅ HTML (`html`)
- ✅ CSS (`css`, `scss`)
- ✅ Bash (`bash`, `sh`)
- ✅ C# (`csharp`, `cs`)
- ✅ Java (`java`)

All included by default in `highlight.js` core.

---

## Example Markdown Rendering

### Before (Current Implementation):
```
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```
*(Plain monospace text, no colors)*

### After (With Highlight.js):
```typescript
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```
*(Syntax highlighted with colors for keywords, variables, operators)*

---

## Performance Impact

### Bundle Size Analysis:
- **Highlight.js core**: ~35 KB gzipped
- **Common languages**: ~15 KB gzipped
- **CSS theme**: ~5 KB gzipped
- **Total addition**: ~55 KB gzipped

### Runtime Performance:
- Highlighting happens during `preprocessMetadata()` (runs once on component init)
- No performance impact on component rendering
- Sanitization still required (no change to security model)

### User Experience:
- Code blocks render with proper syntax highlighting
- Easier to read technical documentation
- Professional appearance matching VS Code/GitHub

---

## Alternative: Tree-Shaking with Highlight.js

If bundle size is a concern, you can import only specific languages:

```typescript
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';

// Register only needed languages
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
```

This reduces bundle size to ~25 KB instead of ~50 KB.

---

## Testing Plan

1. **Create Test Artifact** with markdown containing code blocks in various languages
2. **Verify Rendering**: Check that code blocks are syntax highlighted
3. **Test Themes**: Ensure chosen theme matches MJ design system
4. **Check Performance**: Verify no slowdown in panel rendering
5. **Test Sanitization**: Ensure DomSanitizer still works correctly

---

## Migration Checklist

- [ ] Install `marked-highlight` and `highlight.js` packages
- [ ] Update `component-artifact-viewer.component.ts` to use `marked-highlight`
- [ ] Choose and import a Highlight.js theme
- [ ] Update preprocessing methods to use new `marked` instance
- [ ] Test with sample markdown containing code blocks
- [ ] Verify bundle size impact is acceptable
- [ ] Update documentation if needed
- [ ] Compile and test in MJ Explorer

---

## Conclusion

**Recommendation**: Implement Highlight.js with marked-highlight for syntax highlighting in markdown code blocks.

**Rationale**:
- ✅ Best balance of performance, size, and quality
- ✅ Easy integration with existing `marked.js` usage
- ✅ Automatic language detection (no friction for content authors)
- ✅ Good TypeScript support (critical for MJ technical docs)
- ✅ Industry-standard solution (used by GitHub, Stack Overflow, etc.)

**Bundle Impact**: ~55 KB (acceptable for the UX improvement)

**Implementation Time**: ~1-2 hours (including testing)

---

**Status**: ⏳ Awaiting Approval
**Last Updated**: 2025-01-21
