/**
 * Generates interactive HTML documentation with Mermaid ERD
 */

import { DatabaseDocumentation } from '../types/state.js';

export interface HTMLGeneratorOptions {
  approvedOnly?: boolean;
  confidenceThreshold?: number;
  includeMermaid?: boolean;
}

export class HTMLGenerator {
  /**
   * Generate interactive HTML documentation
   */
  public generate(
    state: DatabaseDocumentation,
    options: HTMLGeneratorOptions = {}
  ): string {
    const htmlLines: string[] = [];

    // HTML header
    this.appendHtmlHeader(htmlLines, state);

    // Body content
    htmlLines.push('<body>');
    htmlLines.push('<div class="container">');

    // Header section
    this.appendHeaderSection(htmlLines, state);

    // Sidebar with navigation
    htmlLines.push('<div class="main-wrapper">');
    this.appendSidebar(htmlLines, state);

    // Main content
    htmlLines.push('<div class="main-content">');

    // Analysis summary
    this.appendAnalysisSummary(htmlLines, state);

    // Database context
    this.appendDatabaseContext(htmlLines, state);

    // Searchable table/column list
    this.appendSearchableList(htmlLines, state, options);

    // Schemas with ERD and tables
    this.appendSchemas(htmlLines, state, options);

    htmlLines.push('</div>'); // main-content
    htmlLines.push('</div>'); // main-wrapper
    htmlLines.push('</div>'); // container
    htmlLines.push('</body>');
    htmlLines.push('</html>');

    return htmlLines.join('\n');
  }

  private appendHtmlHeader(lines: string[], state: DatabaseDocumentation): void {
    lines.push('<!DOCTYPE html>');
    lines.push('<html lang="en">');
    lines.push('<head>');
    lines.push('<meta charset="UTF-8">');
    lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    lines.push(`<title>Database Documentation - ${state.database.name}</title>`);
    this.appendStyles(lines);
    lines.push('</head>');
  }

  private appendStyles(lines: string[]): void {
    lines.push('<style>');
    lines.push(`
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f5f7fa;
        color: #333;
        line-height: 1.6;
      }

      .container {
        width: 100%;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      header h1 {
        font-size: 2.5rem;
        margin-bottom: 0.5rem;
      }

      header .subtitle {
        font-size: 1.1rem;
        opacity: 0.95;
        margin-bottom: 1rem;
      }

      header .meta {
        display: flex;
        gap: 2rem;
        font-size: 0.95rem;
        opacity: 0.9;
      }

      .main-wrapper {
        display: flex;
        flex: 1;
        gap: 0;
      }

      .sidebar {
        width: 280px;
        background-color: #fff;
        border-right: 1px solid #e0e0e0;
        overflow-y: auto;
        padding: 1.5rem 0;
        position: sticky;
        top: 0;
        max-height: calc(100vh - 200px);
      }

      .sidebar h3 {
        padding: 0.5rem 1.5rem;
        color: #667eea;
        font-size: 0.95rem;
        text-transform: uppercase;
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        letter-spacing: 0.5px;
      }

      .sidebar a {
        display: block;
        padding: 0.6rem 1.5rem;
        color: #555;
        text-decoration: none;
        border-left: 3px solid transparent;
        transition: all 0.2s;
      }

      .sidebar a:hover {
        background-color: #f5f5f5;
        color: #667eea;
        border-left-color: #667eea;
      }

      .main-content {
        flex: 1;
        padding: 2rem;
        overflow-y: auto;
      }

      section {
        background: white;
        border-radius: 8px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }

      h2 {
        color: #667eea;
        font-size: 1.8rem;
        margin-bottom: 1rem;
        border-bottom: 2px solid #e0e0e0;
        padding-bottom: 0.5rem;
      }

      h3 {
        color: #764ba2;
        font-size: 1.3rem;
        margin-top: 1.5rem;
        margin-bottom: 0.8rem;
      }

      h4 {
        color: #555;
        font-size: 1.1rem;
        margin-top: 1rem;
        margin-bottom: 0.5rem;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .summary-card {
        background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
        padding: 1rem;
        border-radius: 6px;
        border-left: 4px solid #667eea;
      }

      .summary-card strong {
        display: block;
        color: #667eea;
        font-size: 0.9rem;
        text-transform: uppercase;
        margin-bottom: 0.3rem;
      }

      .summary-card .value {
        font-size: 1.6rem;
        font-weight: bold;
        color: #333;
      }

      .search-box {
        margin-bottom: 2rem;
      }

      .search-box input {
        width: 100%;
        padding: 0.8rem;
        border: 2px solid #e0e0e0;
        border-radius: 6px;
        font-size: 1rem;
        transition: border-color 0.2s;
      }

      .search-box input:focus {
        outline: none;
        border-color: #667eea;
      }

      .search-results {
        display: grid;
        gap: 0.5rem;
      }

      .search-result {
        padding: 0.8rem;
        background-color: #f9f9f9;
        border-radius: 4px;
        border-left: 3px solid #667eea;
        cursor: pointer;
        transition: all 0.2s;
      }

      .search-result:hover {
        background-color: #f0f0f0;
        transform: translateX(4px);
      }

      .search-result .table-name {
        font-weight: bold;
        color: #667eea;
      }

      .search-result .column-name {
        color: #666;
        font-size: 0.9rem;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
      }

      table th {
        background-color: #f5f5f5;
        padding: 0.8rem;
        text-align: left;
        font-weight: 600;
        color: #667eea;
        border-bottom: 2px solid #e0e0e0;
      }

      table td {
        padding: 0.8rem;
        border-bottom: 1px solid #e0e0e0;
      }

      table tr:hover {
        background-color: #f9f9f9;
      }

      .confidence-indicator {
        display: inline-block;
        padding: 0.3rem 0.8rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
      }

      .confidence-high {
        background-color: #d4edda;
        color: #155724;
      }

      .confidence-medium {
        background-color: #fff3cd;
        color: #856404;
      }

      .confidence-low {
        background-color: #f8d7da;
        color: #721c24;
      }

      .schema-section {
        background: white;
        border-radius: 8px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }

      .schema-title {
        color: #667eea;
        font-size: 1.6rem;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #e0e0e0;
      }

      .mermaid {
        background-color: #f9f9f9;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 1rem;
        margin: 1rem 0;
        display: flex;
        justify-content: center;
      }

      .mermaid svg {
        max-width: 100%;
        height: auto;
      }

      .relationship-info {
        margin-top: 1rem;
        padding: 1rem;
        background-color: #f5f5f5;
        border-radius: 4px;
      }

      .relationship-info strong {
        color: #667eea;
      }

      .tag {
        display: inline-block;
        padding: 0.25rem 0.6rem;
        margin-right: 0.5rem;
        background-color: #e0e0e0;
        color: #333;
        border-radius: 3px;
        font-size: 0.85rem;
        font-weight: 600;
      }

      .tag.pk {
        background-color: #667eea;
        color: white;
      }

      .tag.fk {
        background-color: #764ba2;
        color: white;
      }

      .tag.notnull {
        background-color: #ff6b6b;
        color: white;
      }

      .no-results {
        text-align: center;
        color: #999;
        padding: 2rem;
        font-style: italic;
      }

      @media (max-width: 1024px) {
        .main-wrapper {
          flex-direction: column;
        }

        .sidebar {
          width: 100%;
          max-height: auto;
          border-right: none;
          border-bottom: 1px solid #e0e0e0;
          padding: 1rem 0;
        }

        .sidebar h3 {
          display: inline-block;
          margin-right: 1rem;
          margin-top: 0;
          margin-bottom: 0;
        }

        .sidebar a {
          display: inline-block;
          margin-right: 1rem;
          border-left: none;
          border-bottom: 2px solid transparent;
          padding: 0.5rem 0;
        }

        .sidebar a:hover {
          border-left: none;
          border-bottom-color: #667eea;
        }
      }
    `);
    lines.push('</style>');
  }

  private appendHeaderSection(lines: string[], state: DatabaseDocumentation): void {
    lines.push('<header>');
    lines.push(`<h1>📊 ${this.escapeHtml(state.database.name)}</h1>`);
    lines.push(`<div class="subtitle">Database Documentation</div>`);
    lines.push('<div class="meta">');
    lines.push(`<span><strong>Server:</strong> ${this.escapeHtml(state.database.server)}</span>`);
    lines.push(`<span><strong>Generated:</strong> ${new Date().toLocaleDateString()}</span>`);
    lines.push('</div>');
    lines.push('</header>');
  }

  private appendSidebar(lines: string[], state: DatabaseDocumentation): void {
    lines.push('<aside class="sidebar">');
    lines.push('<h3>📑 Schemas</h3>');

    for (const schema of state.schemas) {
      lines.push(`<a href="#schema-${this.toAnchor(schema.name)}">${this.escapeHtml(schema.name)}</a>`);
    }

    lines.push('</aside>');
  }

  private appendAnalysisSummary(lines: string[], state: DatabaseDocumentation): void {
    lines.push('<section id="summary">');
    lines.push('<h2>📈 Analysis Summary</h2>');

    const summary = state.summary;
    lines.push('<div class="summary-grid">');
    lines.push(`<div class="summary-card">
      <strong>Total Schemas</strong>
      <div class="value">${summary.totalSchemas}</div>
    </div>`);
    lines.push(`<div class="summary-card">
      <strong>Total Tables</strong>
      <div class="value">${summary.totalTables}</div>
    </div>`);
    lines.push(`<div class="summary-card">
      <strong>Total Columns</strong>
      <div class="value">${summary.totalColumns}</div>
    </div>`);
    lines.push(`<div class="summary-card">
      <strong>Total Iterations</strong>
      <div class="value">${summary.totalIterations}</div>
    </div>`);
    lines.push(`<div class="summary-card">
      <strong>Tokens Used</strong>
      <div class="value">${summary.totalTokens.toLocaleString()}</div>
    </div>`);
    lines.push(`<div class="summary-card">
      <strong>Estimated Cost</strong>
      <div class="value">$${summary.estimatedCost.toFixed(2)}</div>
    </div>`);
    lines.push('</div>');

    if (state.phases.descriptionGeneration.length > 0) {
      const lastRun = state.phases.descriptionGeneration[state.phases.descriptionGeneration.length - 1];
      lines.push('<h3>Latest Analysis Run</h3>');
      lines.push(`<p><strong>Status:</strong> ${this.escapeHtml(lastRun.status)}</p>`);
      lines.push(`<p><strong>Model:</strong> ${this.escapeHtml(lastRun.modelUsed)} (${this.escapeHtml(lastRun.vendor)})</p>`);
      lines.push(`<p><strong>Temperature:</strong> ${lastRun.temperature}</p>`);
    }

    lines.push('</section>');
  }

  private appendDatabaseContext(lines: string[], state: DatabaseDocumentation): void {
    if (!state.seedContext) {
      return;
    }

    lines.push('<section id="context">');
    lines.push('<h2>💡 Database Context</h2>');

    if (state.seedContext.overallPurpose) {
      lines.push(`<p><strong>Purpose:</strong> ${this.escapeHtml(state.seedContext.overallPurpose)}</p>`);
    }

    if (state.seedContext.industryContext) {
      lines.push(`<p><strong>Industry:</strong> ${this.escapeHtml(state.seedContext.industryContext)}</p>`);
    }

    if (state.seedContext.businessDomains && state.seedContext.businessDomains.length > 0) {
      lines.push('<p><strong>Business Domains:</strong> ');
      const domains = state.seedContext.businessDomains.map(d => this.escapeHtml(d)).join(', ');
      lines.push(domains + '</p>');
    }

    lines.push('</section>');
  }

  private appendSearchableList(
    lines: string[],
    state: DatabaseDocumentation,
    options: HTMLGeneratorOptions
  ): void {
    lines.push('<section id="search">');
    lines.push('<h2>🔍 Search Tables & Columns</h2>');
    lines.push('<div class="search-box">');
    lines.push('<input type="text" id="search-input" placeholder="Search for tables or columns...">');
    lines.push('</div>');
    lines.push('<div id="search-results" class="search-results"></div>');
    lines.push('</section>');

    // Generate search data
    lines.push('<script>');
    lines.push('const searchData = [');

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        // Check filters
        if (options.approvedOnly && !table.userApproved) {
          continue;
        }

        lines.push(`  {`);
        lines.push(`    type: 'table',`);
        lines.push(`    schema: '${this.escapeJson(schema.name)}',`);
        lines.push(`    name: '${this.escapeJson(table.name)}',`);
        lines.push(`    description: '${this.escapeJson(table.description || '')}',`);
        lines.push(`    anchor: 'table-${this.toAnchor(table.name)}'`);
        lines.push(`  },`);

        // Add columns
        for (const column of table.columns) {
          lines.push(`  {`);
          lines.push(`    type: 'column',`);
          lines.push(`    schema: '${this.escapeJson(schema.name)}',`);
          lines.push(`    table: '${this.escapeJson(table.name)}',`);
          lines.push(`    name: '${this.escapeJson(column.name)}',`);
          lines.push(`    dataType: '${this.escapeJson(column.dataType)}',`);
          lines.push(`    description: '${this.escapeJson(column.description || '')}',`);
          lines.push(`    anchor: 'table-${this.toAnchor(table.name)}'`);
          lines.push(`  },`);
        }
      }
    }

    lines.push('];');
    this.appendSearchScript(lines);
    lines.push('</script>');
  }

  private appendSearchScript(lines: string[]): void {
    lines.push(`
      const searchInput = document.getElementById('search-input');
      const searchResults = document.getElementById('search-results');

      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (!query) {
          searchResults.innerHTML = '';
          return;
        }

        const results = searchData.filter(item =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
        ).slice(0, 50);

        if (results.length === 0) {
          searchResults.innerHTML = '<div class="no-results">No results found</div>';
          return;
        }

        searchResults.innerHTML = results.map(item => {
          if (item.type === 'table') {
            return \`<div class="search-result" onclick="document.getElementById('\${item.anchor}').scrollIntoView({behavior: 'smooth'})">
              <div class="table-name">\${item.schema}.\${item.name}</div>
              <div class="column-name">\${item.description || 'No description'}</div>
            </div>\`;
          } else {
            return \`<div class="search-result" onclick="document.getElementById('\${item.anchor}').scrollIntoView({behavior: 'smooth'})">
              <div class="table-name">\${item.table}.\${item.name}</div>
              <div class="column-name">\${item.dataType} - \${item.description || 'No description'}</div>
            </div>\`;
          }
        }).join('');
      });
    `);
  }

  private appendSchemas(
    lines: string[],
    state: DatabaseDocumentation,
    options: HTMLGeneratorOptions
  ): void {
    for (const schema of state.schemas) {
      lines.push(`<div class="schema-section" id="schema-${this.toAnchor(schema.name)}">`);
      lines.push(`<div class="schema-title">${this.escapeHtml(schema.name)}</div>`);

      if (schema.description) {
        lines.push(`<p>${this.escapeHtml(schema.description)}</p>`);
      }

      if (schema.inferredPurpose) {
        lines.push(`<p><strong>Purpose:</strong> ${this.escapeHtml(schema.inferredPurpose)}</p>`);
      }

      if (schema.businessDomains && schema.businessDomains.length > 0) {
        lines.push(`<p><strong>Business Domains:</strong> ${schema.businessDomains.map(d => this.escapeHtml(d)).join(', ')}</p>`);
      }

      // Entity Relationship Diagram
      lines.push('<h3>Entity Relationship Diagram</h3>');
      lines.push('<div class="mermaid">');
      lines.push(this.generateMermaidERD(schema));
      lines.push('</div>');

      // Tables
      lines.push('<h3>Tables</h3>');

      for (const table of schema.tables) {
        // Check filters
        if (options.approvedOnly && !table.userApproved) {
          continue;
        }

        lines.push(`<div id="table-${this.toAnchor(table.name)}">`);
        lines.push(`<h4>${this.escapeHtml(table.name)}</h4>`);

        if (table.description) {
          lines.push(`<p>${this.escapeHtml(table.description)}</p>`);
        }

        // Metadata
        lines.push(`<p><strong>Row Count:</strong> ${table.rowCount.toLocaleString()}</p>`);
        if (table.dependencyLevel !== undefined) {
          lines.push(`<p><strong>Dependency Level:</strong> ${table.dependencyLevel}</p>`);
        }

        // Confidence
        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if (latest.confidence) {
            const confidence = latest.confidence * 100;
            const confClass = confidence >= 80 ? 'confidence-high' : confidence >= 60 ? 'confidence-medium' : 'confidence-low';
            lines.push(`<p><span class="confidence-indicator ${confClass}">Confidence: ${confidence.toFixed(0)}%</span></p>`);
          }
        }

        // Relationships
        if ((table.dependsOn && table.dependsOn.length > 0) || (table.dependents && table.dependents.length > 0)) {
          lines.push('<div class="relationship-info">');

          if (table.dependsOn && table.dependsOn.length > 0) {
            lines.push('<strong>Depends On:</strong>');
            lines.push('<ul>');
            for (const dep of table.dependsOn) {
              lines.push(`<li><a href="#table-${this.toAnchor(dep.table)}">${dep.schema}.${dep.table}</a> (via ${dep.column})</li>`);
            }
            lines.push('</ul>');
          }

          if (table.dependents && table.dependents.length > 0) {
            lines.push('<strong>Referenced By:</strong>');
            lines.push('<ul>');
            for (const dep of table.dependents) {
              lines.push(`<li><a href="#table-${this.toAnchor(dep.table)}">${dep.schema}.${dep.table}</a></li>`);
            }
            lines.push('</ul>');
          }

          lines.push('</div>');
        }

        // Columns table
        lines.push('<table>');
        lines.push('<thead><tr><th>Column</th><th>Type</th><th>Description</th></tr></thead>');
        lines.push('<tbody>');

        for (const column of table.columns) {
          const flags = [];
          if (column.isPrimaryKey) flags.push('<span class="tag pk">PK</span>');
          if (column.isForeignKey) flags.push('<span class="tag fk">FK</span>');
          if (!column.isNullable) flags.push('<span class="tag notnull">NOT NULL</span>');

          const typeInfo = flags.length > 0 ? `${column.dataType} ${flags.join(' ')}` : column.dataType;
          const description = column.description || '';

          lines.push(`<tr>`);
          lines.push(`<td>${this.escapeHtml(column.name)}</td>`);
          lines.push(`<td>${typeInfo}</td>`);
          lines.push(`<td>${this.escapeHtml(description)}</td>`);
          lines.push(`</tr>`);
        }

        lines.push('</tbody>');
        lines.push('</table>');
        lines.push('</div>');
      }

      lines.push('</div>');
    }

    // Add Mermaid script
    lines.push('<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>');
    lines.push('<script>mermaid.initialize({ startOnLoad: true, theme: "default" }); mermaid.contentLoaded();<\/script>');
  }

  private generateMermaidERD(schema: any): string {
    const lines: string[] = [];
    lines.push('erDiagram');

    // Add entities with their columns
    for (const table of schema.tables) {
      lines.push(`    ${table.name} {`);

      for (const column of table.columns) {
        const type = column.dataType.replace(/\s+/g, '_');
        const constraints = [];
        if (column.isPrimaryKey) constraints.push('PK');
        if (column.isForeignKey) constraints.push('FK');
        if (!column.isNullable) constraints.push('NOT_NULL');

        const constraintStr = constraints.length > 0 ? ` "${constraints.join(',')}"` : '';
        lines.push(`        ${type} ${column.name}${constraintStr}`);
      }

      lines.push('    }');
    }

    lines.push('');

    // Add relationships
    for (const table of schema.tables) {
      if (table.dependsOn && table.dependsOn.length > 0) {
        for (const dep of table.dependsOn) {
          lines.push(`    ${dep.table} ||--o{ ${table.name} : "has"`);
        }
      }
    }

    return lines.join('\n');
  }

  private toAnchor(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  private escapeJson(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
}
