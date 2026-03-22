# Research Agent HTML Artifacts - Enhancement Proposal

**Date:** 2025-10-17
**Status:** Proposed
**Impact:** High - Enables rich, interactive research reports

---

## Executive Summary

**Current State:** Research Agent outputs JSON payload → Extract rules generate `displayMarkdown` → Simple text-based reports

**Proposed Enhancement:** Add `displayHtml` extract rule → Research Agent generates rich, self-contained HTML → Interactive, printable, sophisticated reports with charts, graphs, tables, and advanced styling

**Key Benefits:**
- 📊 **Rich Visualizations**: Charts, graphs, timelines embedded directly
- 🎨 **Professional Styling**: Print-ready, branded reports with sophisticated layouts
- 📱 **Interactive Elements**: Collapsible sections, tabbed interfaces, interactive data tables
- 🖨️ **Print Optimization**: CSS @media print rules for perfect PDF generation
- 🔒 **Security**: Sandboxed in iframe, fully self-contained (no external dependencies)
- 📈 **Better UX**: Users get publication-quality reports, not just markdown

---

## Current Architecture Analysis

### How Artifacts Work Today

```typescript
// 1. Agent generates JSON payload
const payload: ResearchAgentPayload = {
  metadata: {...},
  sources: [...],
  findings: [...],
  synthesis: {
    executiveSummary: "...",
    findings: [...],
    // etc
  },
  report: {
    name: "Research Report Title",
    description: "Brief summary",
    markdown: "# Full Markdown Report\n\n..." // <-- Currently generated
  }
};

// 2. Saved as artifact with ContentType = "application/json"
await artifactVersion.Save();

// 3. Extract rules run (research-content.json)
// Creates ArtifactVersionAttribute records:
[
  { Name: "name", Value: payload.report.name },
  { Name: "description", Value: payload.report.description },
  { Name: "displayMarkdown", Value: payload.report.markdown }, // <-- Extracted for display
  { Name: "sourceCount", Value: payload.sources.length },
  // etc.
]

// 4. UI displays using JsonArtifactViewerComponent
// Priority: displayMarkdown > displayHtml > raw JSON
if (displayMarkdown) {
  // Convert markdown to HTML using marked.js
  // Display in sanitized div
} else if (displayHtml) {
  // Display HTML directly (sanitized)
} else {
  // Show raw JSON in code editor
}
```

### Extract Rule System

**Location:** `metadata/artifact-types/extract-rules/research-content.json`

```json
[
  {
    "name": "displayMarkdown",
    "description": "Extracts the full research report in markdown format",
    "type": "string",
    "standardProperty": "displayMarkdown",
    "extractor": "@file:research-content/research-content-markdown.js"
  }
]
```

**Extractor:** `research-content/research-content-markdown.js`
```javascript
// Simple extractor that reads from payload
module.exports = function(payload) {
  return payload?.report?.markdown || '';
};
```

### Current UI Display

**Component:** `JsonArtifactViewerComponent`

```typescript
// Display priority order:
async ngOnInit() {
  if (displayMarkdown) {
    // Use marked.js to convert markdown → HTML
    const html = marked.parse(this.displayMarkdown);
    this.renderedMarkdown = this.sanitizer.sanitize(1, html);
    // Display in <div [innerHTML]="renderedMarkdown">
  } else if (displayHtml) {
    // Would display HTML directly (currently unused)
    // <div [innerHTML]="displayHtml">
  } else {
    // Show raw JSON in code editor
  }
}
```

---

## Proposed Enhancement: displayHtml Support

### 1. Add displayHtml Extract Rule

**File:** `metadata/artifact-types/extract-rules/research-content.json`

```json
[
  // ... existing rules ...
  {
    "name": "displayHtml",
    "description": "Extracts rich HTML report with charts, graphs, and advanced styling",
    "type": "string",
    "standardProperty": "displayHtml",
    "extractor": "@file:research-content/research-content-html.js"
  }
]
```

**Extractor:** `research-content/research-content-html.js`
```javascript
module.exports = function(payload) {
  return payload?.report?.html || '';
};
```

### 2. Update Research Agent Payload Structure

**Current:**
```typescript
interface ResearchReport {
  name: string;
  description: string;
  markdown: string;  // Currently generated
}
```

**Enhanced:**
```typescript
interface ResearchReport {
  name: string;
  description: string;
  markdown?: string;  // Optional - for simple reports
  html?: string;      // NEW - for rich reports
}
```

### 3. Update Research Report Writer Prompt

**Add to prompt instructions:**

```markdown
## Output Format - Report Generation

You have TWO options for generating the final report:

### Option 1: Markdown Report (Simple)
Use when:
- Research is straightforward, text-based
- No need for visualizations or complex layouts
- Simple tables and bullet points suffice

Generate: `report.markdown` field with markdown content

### Option 2: HTML Report (Rich) - RECOMMENDED
Use when:
- Research involves data that benefits from visualization
- Multiple sources/findings need comparison
- Timeline or chronological presentation needed
- Professional, print-ready output desired

Generate: `report.html` field with FULLY SELF-CONTAINED HTML

**HTML Requirements:**
1. **Self-Contained**: All CSS, JavaScript inline (no external dependencies)
2. **Responsive**: Works on desktop, tablet, mobile
3. **Print-Optimized**: CSS @media print rules for PDF generation
4. **Sandboxed**: Will be displayed in iframe for security
5. **Accessible**: Proper semantic HTML, ARIA labels where needed

**Example HTML Structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Research Report: {title}</title>
  <style>
    /* Embedded CSS - fully self-contained */
    :root {
      --primary-color: #2c3e50;
      --accent-color: #3498db;
      --text-color: #333;
      --bg-color: #fff;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }

    h1 { color: var(--primary-color); border-bottom: 3px solid var(--accent-color); }

    .executive-summary {
      background: #f8f9fa;
      border-left: 4px solid var(--accent-color);
      padding: 20px;
      margin: 20px 0;
    }

    .source-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .source-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      background: white;
    }

    .finding-card {
      border-left: 4px solid #27ae60;
      padding: 15px;
      margin: 15px 0;
      background: #f0f9f4;
    }

    .contradiction-alert {
      border-left: 4px solid #e74c3c;
      padding: 15px;
      margin: 15px 0;
      background: #fef5f4;
    }

    /* Collapsible sections */
    details {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px;
      margin: 10px 0;
    }

    summary {
      cursor: pointer;
      font-weight: 600;
      padding: 5px;
    }

    /* Print styles */
    @media print {
      body { max-width: 100%; padding: 0; }
      .no-print { display: none; }
      details { border: none; }
      details summary { display: none; }
      details[open] { display: block; }
    }

    /* Charts container */
    .chart-container {
      margin: 30px 0;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    /* Timeline */
    .timeline {
      position: relative;
      padding: 20px 0;
    }

    .timeline-item {
      padding: 10px 0;
      border-left: 2px solid var(--accent-color);
      padding-left: 20px;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <!-- Header Section -->
  <header>
    <h1>{Research Report Title}</h1>
    <div class="metadata">
      <p><strong>Research Goal:</strong> {metadata.researchGoal}</p>
      <p><strong>Date:</strong> {metadata.completedAt}</p>
      <p><strong>Sources:</strong> {metadata.totalSourcesGathered} | <strong>Iterations:</strong> {metadata.iterationCount}</p>
    </div>
  </header>

  <!-- Executive Summary -->
  <section class="executive-summary">
    <h2>Executive Summary</h2>
    <p>{synthesis.executiveSummary}</p>

    <h3>Key Takeaways</h3>
    <ul>
      {synthesis.keyTakeaways.map(item => `<li>${item}</li>`).join('')}
    </ul>
  </section>

  <!-- Findings with Visual Indicators -->
  <section class="findings">
    <h2>Key Findings</h2>

    {synthesis.findings.map(finding => `
      <div class="finding-card">
        <h3>
          ${finding.importance === 'critical' ? '🔴' : finding.importance === 'high' ? '🟠' : '🟡'}
          ${finding.title}
        </h3>
        <p><strong>Confidence:</strong> ${(finding.confidence * 100).toFixed(0)}%</p>
        <p>${finding.description}</p>

        <details>
          <summary>Supporting Sources (${finding.supportingSources.length})</summary>
          <ul>
            ${finding.supportingSources.map(source =>
              `<li><a href="${sources.find(s => s.sourceID === source.sourceID)?.url}">${sources.find(s => s.sourceID === source.sourceID)?.title}</a></li>`
            ).join('')}
          </ul>
        </details>
      </div>
    `).join('')}
  </section>

  <!-- Contradictions (if any) -->
  {contradictions.length > 0 && `
    <section class="contradictions">
      <h2>⚠️ Contradictions Found</h2>
      ${contradictions.map(con => `
        <div class="contradiction-alert">
          <h3>${con.description}</h3>
          <p><strong>Severity:</strong> ${con.severity}</p>
          <p><strong>Possible Explanations:</strong></p>
          <ul>
            ${con.possibleExplanations.map(exp => `<li>${exp}</li>`).join('')}
          </ul>
          ${con.resolution ? `<p><strong>Resolution:</strong> ${con.resolution}</p>` : ''}
        </div>
      `).join('')}
    </section>
  `}

  <!-- Source Timeline (if relevant) -->
  <section class="timeline-section">
    <h2>Research Timeline</h2>
    <div class="timeline">
      {iterations.map(iter => `
        <div class="timeline-item">
          <h4>Iteration ${iter.iterationNumber}</h4>
          <p>${iter.summary}</p>
          <p><small>Sources gathered: ${iter.sourcesGathered.length} | Duration: ${iter.durationSeconds}s</small></p>
        </div>
      `).join('')}
    </div>
  </section>

  <!-- Sources Grid -->
  <section class="sources-section">
    <h2>Sources (${sources.length})</h2>
    <div class="source-grid">
      {sources.map(source => `
        <div class="source-card">
          <h4>${source.title || 'Untitled Source'}</h4>
          <p><strong>Type:</strong> ${source.sourceType}</p>
          ${source.url ? `<p><a href="${source.url}" target="_blank">${source.url}</a></p>` : ''}
          <p><strong>Reliability:</strong> ${source.reliability}</p>
          <p><small>${source.reliabilityReasoning}</small></p>
        </div>
      `).join('')}
    </div>
  </section>

  <!-- Footer -->
  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
    <p><small>Generated by MemberJunction Research Agent | ${new Date().toISOString()}</small></p>
  </footer>

  <!-- Optional: Embedded Charts using inline SVG or Chart.js -->
  <script>
    // Could include Chart.js inline for visualizations
    // Or generate SVG charts directly
  </script>
</body>
</html>
```

**Critical Instructions for Agent:**
- ALL styles must be inline or in `<style>` tags
- NO external CSS files (no `<link rel="stylesheet">`)
- NO external JavaScript (no `<script src="">`)
- If using charts, embed Chart.js or use inline SVG
- Use semantic HTML5 elements
- Include print styles for PDF generation
- Make sections collapsible with `<details>/<summary>`
- Use progressive disclosure for large data sets
```

### 4. Enhanced UI Display with Iframe Sandboxing

**Component:** `JsonArtifactViewerComponent`

**Current:**
```typescript
// displayHtml is sanitized and displayed inline
<div [innerHTML]="displayHtml"></div>
```

**Enhanced (with iframe for better isolation):**
```typescript
@Component({
  template: `
    <div class="display-content">
      @if (displayHtml && useIframeSandbox) {
        <!-- Sandboxed iframe for rich HTML -->
        <iframe
          #htmlFrame
          [srcdoc]="displayHtml"
          sandbox="allow-same-origin allow-scripts"
          class="html-iframe"
          (load)="onIframeLoad()">
        </iframe>
      } @else if (displayHtml) {
        <!-- Fallback: sanitized inline HTML -->
        <div class="html-content" [innerHTML]="safeDisplayHtml"></div>
      } @else if (displayMarkdown) {
        <!-- Existing markdown rendering -->
        <div class="markdown-content" [innerHTML]="renderedMarkdown"></div>
      }
    </div>
  `,
  styles: [`
    .html-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      min-height: 600px;
    }

    /* Allow iframe to grow with content */
    .html-iframe.auto-height {
      height: auto;
    }
  `]
})
export class JsonArtifactViewerComponent {
  public useIframeSandbox = true; // Configurable
  public safeDisplayHtml: SafeHtml | null = null;

  async ngOnInit() {
    // ... load attributes ...

    if (this.displayHtml) {
      // Sanitize for inline display (fallback)
      this.safeDisplayHtml = this.sanitizer.sanitize(1, this.displayHtml);
    }
  }

  onIframeLoad() {
    // Optional: Auto-resize iframe to content height
    const iframe = this.htmlFrame.nativeElement;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      const height = iframeDoc.body.scrollHeight;
      iframe.style.height = `${height}px`;
    }
  }
}
```

---

## Advanced Features Enabled by HTML

### 1. **Interactive Data Visualizations**

```html
<!-- Inline Chart.js for visualizations -->
<div class="chart-container">
  <canvas id="sourcesChart"></canvas>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
  // Generate bar chart of sources by type
  new Chart(document.getElementById('sourcesChart'), {
    type: 'bar',
    data: {
      labels: ['Web', 'Database', 'Files', 'Other'],
      datasets: [{
        label: 'Sources by Type',
        data: [5, 4, 3, 0],
        backgroundColor: ['#3498db', '#2ecc71', '#f39c12', '#95a5a6']
      }]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });
</script>
```

**OR use inline SVG (no external dependencies):**

```html
<svg viewBox="0 0 400 200" class="chart">
  <rect x="50" y="50" width="60" height="100" fill="#3498db" />
  <rect x="120" y="70" width="60" height="80" fill="#2ecc71" />
  <rect x="190" y="90" width="60" height="60" fill="#f39c12" />
  <text x="80" y="160" text-anchor="middle">Web (5)</text>
  <text x="150" y="160" text-anchor="middle">DB (4)</text>
  <text x="220" y="160" text-anchor="middle">Files (3)</text>
</svg>
```

### 2. **Collapsible Sections for Large Reports**

```html
<details open>
  <summary>📊 Detailed Findings (12 items)</summary>
  <div class="findings-content">
    <!-- Large content hidden by default -->
  </div>
</details>

<details>
  <summary>📚 Full Source Details (47 sources)</summary>
  <div class="sources-content">
    <!-- Collapsed by default to reduce initial page length -->
  </div>
</details>
```

### 3. **Tabbed Interface for Multi-Faceted Research**

```html
<div class="tabs">
  <input type="radio" name="tabs" id="tab1" checked>
  <label for="tab1">Overview</label>

  <input type="radio" name="tabs" id="tab2">
  <label for="tab2">Findings</label>

  <input type="radio" name="tabs" id="tab3">
  <label for="tab3">Sources</label>

  <div class="tab-content" id="content1">Overview content...</div>
  <div class="tab-content" id="content2">Findings content...</div>
  <div class="tab-content" id="content3">Sources content...</div>
</div>

<style>
  /* CSS-only tabs (no JavaScript needed) */
  .tab-content { display: none; }
  #tab1:checked ~ #content1,
  #tab2:checked ~ #content2,
  #tab3:checked ~ #content3 { display: block; }
</style>
```

### 4. **Interactive Tables with Sorting**

```html
<table class="data-table">
  <thead>
    <tr>
      <th onclick="sortTable(0)">Source ↕</th>
      <th onclick="sortTable(1)">Type ↕</th>
      <th onclick="sortTable(2)">Reliability ↕</th>
      <th onclick="sortTable(3)">Date ↕</th>
    </tr>
  </thead>
  <tbody>
    <!-- Data rows -->
  </tbody>
</table>

<script>
  function sortTable(col) {
    // Simple inline sorting logic
  }
</script>
```

### 5. **Timeline Visualizations**

```html
<div class="timeline">
  <div class="timeline-item" style="--date: 'Jan 2024'">
    <h4>IBM Achieves 1000+ Qubit Milestone</h4>
    <p>Source: Nature Journal</p>
  </div>
  <div class="timeline-item" style="--date: 'Mar 2024'">
    <h4>Google Demonstrates Quantum Advantage</h4>
    <p>Source: Science Magazine</p>
  </div>
</div>

<style>
  .timeline-item::before {
    content: attr(--date);
    /* Visual timeline styling */
  }
</style>
```

### 6. **Print-Optimized Layouts**

```css
@media print {
  /* Remove interactive elements */
  button, .no-print { display: none; }

  /* Optimize for paper */
  body { font-size: 11pt; }
  h1 { page-break-after: avoid; }
  .finding-card { page-break-inside: avoid; }

  /* Expand all collapsible sections */
  details { display: block; }
  summary { display: none; }

  /* Add page numbers */
  @page {
    margin: 1in;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
    }
  }

  /* Ensure charts/images fit */
  img, svg, canvas {
    max-width: 100%;
    page-break-inside: avoid;
  }
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Add `displayHtml` extract rule to `research-content.json`
- [ ] Create extractor: `research-content-html.js`
- [ ] Update `ResearchReport` TypeScript interface
- [ ] Test HTML rendering in existing `JsonArtifactViewerComponent`

### Phase 2: Prompt Engineering (Week 2)
- [ ] Update Research Report Writer prompt with HTML generation instructions
- [ ] Create HTML template library for agent to reference
- [ ] Add example HTML reports to prompt
- [ ] Test with simple research queries

### Phase 3: Enhanced UI (Week 3)
- [ ] Implement iframe sandboxing in `JsonArtifactViewerComponent`
- [ ] Add auto-height calculation for iframe
- [ ] Create print preview feature
- [ ] Add "Open in New Window" option for full-screen view

### Phase 4: Advanced Features (Week 4)
- [ ] Create reusable HTML component library for agents
  - Chart templates (bar, line, pie, timeline)
  - Card layouts
  - Grid systems
  - Color schemes
- [ ] Add HTML validation to artifact system
- [ ] Implement HTML minification (optional)
- [ ] Add HTML → PDF export option

### Phase 5: Agent Training (Week 5)
- [ ] Test with various research types:
  - Market research (charts, comparisons)
  - Historical research (timelines)
  - Technical research (code samples, diagrams)
  - Competitor analysis (comparison tables)
- [ ] Refine prompt based on output quality
- [ ] Create best practices guide for HTML generation

---

## Security Considerations

### ✅ Safe Practices
1. **Iframe Sandbox**: Use `sandbox="allow-same-origin allow-scripts"` attribute
2. **Content Security Policy**: Restrict external resources
3. **DomSanitizer**: Angular's built-in sanitization for fallback inline display
4. **No External Dependencies**: All CSS/JS must be inline
5. **No User Input**: HTML generated by AI, not user-provided

### ⚠️ Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| XSS via malicious HTML | Iframe sandbox + CSP headers + DomSanitizer |
| Resource exhaustion (large HTML) | Size limits on `displayHtml` field (e.g., 5MB max) |
| Broken layouts in older browsers | Graceful degradation to displayMarkdown |
| JavaScript errors in iframe | Iframe isolation prevents parent page impact |
| External resource loading | CSP blocks external requests |

### Recommended CSP Headers

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'unsafe-inline' 'self';
  style-src 'unsafe-inline' 'self';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'none';
  frame-ancestors 'none';
```

---

## Benefits vs Markdown

| Feature | Markdown | HTML |
|---------|----------|------|
| **Simplicity** | ✅ Very simple | ⚠️ More complex |
| **Charts/Graphs** | ❌ Not possible | ✅ Inline SVG or Chart.js |
| **Interactive Elements** | ❌ Limited | ✅ Tabs, collapsible, tooltips |
| **Print Quality** | ⚠️ Basic | ✅ Professional with @media print |
| **Styling Control** | ⚠️ Limited | ✅ Full CSS control |
| **Tables** | ⚠️ Basic only | ✅ Sortable, filterable, styled |
| **Layouts** | ❌ No grid/flex | ✅ CSS Grid, Flexbox |
| **File Size** | ✅ Small | ⚠️ Larger (mitigated by minification) |
| **Portability** | ✅ Very portable | ⚠️ Needs browser/viewer |
| **Security** | ✅ No XSS risk | ⚠️ Requires sandboxing |

---

## Example Use Cases

### 1. **Competitive Analysis Report**
- **Comparison tables** with sortable columns
- **Bar charts** comparing features/pricing
- **Color-coded cards** for each competitor
- **Collapsible sections** for detailed analysis

### 2. **Market Research Report**
- **Pie charts** for market share
- **Line graphs** for trend analysis
- **Geographic maps** (inline SVG)
- **Interactive timeline** of market events

### 3. **Technical Research Report**
- **Code syntax highlighting** with Prism.js (inline)
- **Tabbed architecture diagrams**
- **Collapsible API documentation**
- **Interactive decision trees**

### 4. **Scientific Literature Review**
- **Citation graph** showing relationships
- **Timeline** of research developments
- **Comparison matrix** of study methodologies
- **Collapsible source annotations**

---

## Backward Compatibility

- ✅ **Existing reports**: Continue working with `displayMarkdown`
- ✅ **Agent choice**: Report Writer decides markdown vs HTML based on content
- ✅ **Fallback**: If `displayHtml` fails, falls back to `displayMarkdown`
- ✅ **UI priority**: `displayMarkdown` > `displayHtml` > raw JSON (configurable)

---

## Metrics for Success

### Quality Metrics
- [ ] 90%+ of HTML reports render correctly across browsers
- [ ] 95%+ pass automated accessibility checks (WCAG 2.1)
- [ ] Zero XSS vulnerabilities in security audit
- [ ] <2s render time for typical research report

### User Experience Metrics
- [ ] 80%+ user preference for HTML over markdown (survey)
- [ ] 50%+ increase in report sharing/export actions
- [ ] 30%+ increase in time spent viewing reports (engagement)
- [ ] 90%+ satisfaction with print/PDF quality

### Technical Metrics
- [ ] <5MB average HTML size (compression)
- [ ] 100% of reports pass CSP validation
- [ ] <1% error rate in iframe rendering
- [ ] 100% backward compatibility with existing artifacts

---

## Open Questions

1. **HTML Size Limits**: What's the maximum acceptable size for `displayHtml`?
   - Recommendation: 5MB soft limit, 10MB hard limit

2. **Chart Library**: Inline Chart.js (~250KB) vs pure SVG?
   - Recommendation: Start with SVG, add Chart.js if needed

3. **Versioning**: Track HTML format version for future schema changes?
   - Recommendation: Add `<meta name="mj-html-version" content="1.0">`

4. **Theming**: Should HTML respect user's dark mode preference?
   - Recommendation: Yes, using CSS `prefers-color-scheme` media query

5. **Export Formats**: PDF, DOCX, or just print-to-PDF?
   - Recommendation: Start with print-to-PDF, evaluate others later

---

## Conclusion

Adding `displayHtml` support to the artifact system would dramatically enhance the Research Agent's output quality, enabling:

- 📊 **Rich visualizations** that convey insights better than text
- 🎨 **Professional presentation** suitable for stakeholder reports
- 📱 **Interactive exploration** of complex research findings
- 🖨️ **Print-ready documents** for offline distribution
- 🔒 **Secure rendering** through iframe sandboxing

The implementation is **low-risk** (backward compatible, sandboxed) and **high-reward** (significantly better UX). The existing infrastructure already supports this (extract rules, JsonArtifactViewerComponent), requiring only:

1. New extract rule definition
2. Prompt engineering for HTML generation
3. Optional UI enhancements (iframe, print preview)

**Recommendation:** Proceed with phased implementation, starting with basic HTML support and iterating based on user feedback.
