Styled panel for displaying AI-generated insights with markdown rendering (via marked.js 11.1.1). Accepts insights text (markdown), loading state, error state, and onGenerate callback. Built-in actions: collapse/expand, copy to clipboard, export as markdown file (.md), refresh insights. Renders markdown with proper heading hierarchy, lists, bold/italic, code blocks, blockquotes, tables. Scrollable content area (default 400px max-height). Customizable title, icon (Font Awesome), icon color, position (top/bottom). Optional custom buttons and onClose callback. Loading state shows spinner, error state shows red alert banner.

#### AIInsightsPanel - ONLY use when:
✅ Displaying AI-generated text/analysis (markdown format)
✅ Need built-in copy/export/refresh actions
✅ Content is read-only (not editable)
✅ Want collapsible panel to save screen space
✅ Insights are context-specific to the current view (e.g., 'AI Analysis of Selected Data')
✅ Need loading/error state handling

❌ DO NOT USE AIInsightsPanel when:
- Content is not from AI generation → Use regular markdown display or text component
- Need rich text editing → Use a markdown editor component
- Displaying static help text or documentation → Use regular div with markdown
- Content requires user interaction beyond copy/export → Build custom panel
- Need complex layout with multiple sections → Use custom component with markdown rendering

**Use Cases**: Dashboard AI insights, data analysis summaries, trend explanations, anomaly detection reports, conversational AI responses, report narration, chart interpretation, data quality assessments.
