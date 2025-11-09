/**
 * Generates standalone Mermaid diagram files for ERD
 */

import { DatabaseDocumentation } from '../types/state.js';

export interface MermaidGeneratorOptions {
  approvedOnly?: boolean;
  confidenceThreshold?: number;
  includeComments?: boolean;
}

export class MermaidGenerator {
  /**
   * Generate Mermaid ERD diagram
   */
  public generate(
    state: DatabaseDocumentation,
    options: MermaidGeneratorOptions = {}
  ): string {
    const lines: string[] = [];

    // Header comments
    if (options.includeComments !== false) {
      lines.push(`%% Entity Relationship Diagram`);
      lines.push(`%% Database: ${state.database.name}`);
      lines.push(`%% Server: ${state.database.server}`);
      lines.push(`%% Generated: ${new Date().toISOString()}`);
      lines.push(`%% Total Schemas: ${state.schemas.length}`);
      lines.push(`%% Total Tables: ${state.summary.totalTables}`);
      lines.push(`%% Total Columns: ${state.summary.totalColumns}`);
      lines.push('');
    }

    // Start ERD
    lines.push('erDiagram');
    lines.push('');

    // Process each schema
    for (const schema of state.schemas) {
      if (options.includeComments !== false) {
        lines.push(`    %% Schema: ${schema.name}`);
        if (schema.description) {
          lines.push(`    %% ${schema.description}`);
        }
        lines.push('');
      }

      // Process all tables
      this.appendSchemaEntities(lines, schema, options);
    }

    lines.push('');

    // Add relationships
    if (options.includeComments !== false) {
      lines.push(`    %% Relationships`);
      lines.push('');
    }

    this.appendRelationships(lines, state, options);

    return lines.join('\n');
  }

  /**
   * Append entity definitions for a schema
   */
  private appendSchemaEntities(
    lines: string[],
    schema: any,
    options: MermaidGeneratorOptions
  ): void {
    for (const table of schema.tables) {
      // Check filters
      if (options.approvedOnly && !table.userApproved) {
        continue;
      }

      if (options.confidenceThreshold && table.descriptionIterations.length > 0) {
        const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
        if ((latest.confidence || 0) < options.confidenceThreshold) {
          continue;
        }
      }

      lines.push(`    ${table.name} {`);

      for (const column of table.columns) {
        const type = column.dataType.replace(/\s+/g, '_');
        const constraints = [];

        if (column.isPrimaryKey) constraints.push('PK');
        if (column.isForeignKey) constraints.push('FK');
        if (!column.isNullable) constraints.push('NOT_NULL');

        const constraintStr = constraints.length > 0 ? ` "${constraints.join(',')}"` : '';

        // Include description as comment if available
        if (options.includeComments !== false && column.description) {
          const description = column.description.replace(/"/g, '\\"').substring(0, 60);
          lines.push(`        ${type} ${column.name}${constraintStr} %% ${description}`);
        } else {
          lines.push(`        ${type} ${column.name}${constraintStr}`);
        }
      }

      lines.push('    }');
      lines.push('');
    }
  }

  /**
   * Append relationship definitions
   */
  private appendRelationships(
    lines: string[],
    state: DatabaseDocumentation,
    options: MermaidGeneratorOptions
  ): void {
    const relationships: Set<string> = new Set();

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        // Check filters
        if (options.approvedOnly && !table.userApproved) {
          continue;
        }

        if (options.confidenceThreshold && table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if ((latest.confidence || 0) < options.confidenceThreshold) {
            continue;
          }
        }

        if (table.dependsOn && table.dependsOn.length > 0) {
          for (const dep of table.dependsOn) {
            // Check if dependent table passes filters
            if (this.tablePassesFilters(state, dep.schema, dep.table, options)) {
              const key = `${dep.table}||--o{${table.name}`;
              if (!relationships.has(key)) {
                relationships.add(key);
                lines.push(`    ${dep.table} ||--o{ ${table.name} : "has"`);
              }
            }
          }
        }
      }
    }

    // Add comments for complex relationships
    if (options.includeComments !== false && relationships.size > 0) {
      lines.push('');
      lines.push(`    %% Relationship Notation:`);
      lines.push(`    %% Parent ||--o{ Child : "describes"`);
      lines.push(`    %% One Parent can have zero or more Children`);
    }
  }

  /**
   * Check if a table passes the configured filters
   */
  private tablePassesFilters(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string,
    options: MermaidGeneratorOptions
  ): boolean {
    const schema = state.schemas.find(s => s.name === schemaName);
    if (!schema) return false;

    const table = schema.tables.find(t => t.name === tableName);
    if (!table) return false;

    if (options.approvedOnly && !table.userApproved) {
      return false;
    }

    if (options.confidenceThreshold && table.descriptionIterations.length > 0) {
      const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
      if ((latest.confidence || 0) < options.confidenceThreshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate an HTML-wrapped version of the Mermaid diagram
   * Useful for standalone rendering
   */
  public generateHtml(
    state: DatabaseDocumentation,
    options: MermaidGeneratorOptions = {}
  ): string {
    const mermaidDiagram = this.generate(state, options);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database ERD - ${this.escapeHtml(state.database.name)}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f7fa;
            color: #333;
            padding: 2rem;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            padding: 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        h1 {
            color: #667eea;
            margin-bottom: 0.5rem;
        }

        .metadata {
            color: #666;
            font-size: 0.95rem;
            margin-bottom: 2rem;
            padding: 1rem;
            background-color: #f9f9f9;
            border-radius: 4px;
        }

        .metadata p {
            margin: 0.3rem 0;
        }

        .mermaid {
            background-color: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 1rem;
            margin: 2rem 0;
            overflow: auto;
        }

        .mermaid svg {
            max-width: 100%;
            height: auto;
        }

        .controls {
            margin-bottom: 2rem;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }

        button {
            padding: 0.6rem 1.2rem;
            background-color: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.95rem;
            transition: background-color 0.2s;
        }

        button:hover {
            background-color: #764ba2;
        }

        .download-link {
            display: inline-block;
            padding: 0.6rem 1.2rem;
            background-color: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .download-link:hover {
            background-color: #764ba2;
        }

        @media print {
            body {
                background: white;
                padding: 0;
            }

            .container {
                box-shadow: none;
                padding: 0;
            }

            .controls {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Database Entity Relationship Diagram</h1>
        <div class="metadata">
            <p><strong>Database:</strong> ${this.escapeHtml(state.database.name)}</p>
            <p><strong>Server:</strong> ${this.escapeHtml(state.database.server)}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Tables:</strong> ${state.summary.totalTables} | <strong>Columns:</strong> ${state.summary.totalColumns}</p>
        </div>

        <div class="controls">
            <button onclick="downloadMmd()">Download .mmd File</button>
            <button onclick="window.print()">Print / Save as PDF</button>
        </div>

        <div class="mermaid">
${mermaidDiagram}
        </div>
    </div>

    <script>
        mermaid.initialize({ startOnLoad: true, theme: "default", securityLevel: "loose" });
        mermaid.contentLoaded();

        function downloadMmd() {
            const content = \`${this.escapeLiteral(mermaidDiagram)}\`;
            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
            element.setAttribute('download', '${state.database.name.replace(/\\s+/g, '_')}_erd.mmd');
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }
    </script>
</body>
</html>`;
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

  private escapeLiteral(text: string): string {
    return text.replace(/`/g, '\\`').replace(/\$/g, '\\$');
  }
}
