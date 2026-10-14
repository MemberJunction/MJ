/**
 * Renders an ErdClusterPlan as one Mermaid ERD per cluster page, each wrapped in a standalone HTML
 * page, plus an index (HTML and Markdown) that lists the subject areas, the reference tables and the
 * tables no diagram shows. Every page stays well inside Mermaid's text limit by drawing primary and
 * foreign key columns only (configurable).
 */

import { DatabaseDocumentation, ColumnDefinition } from '../types/state.js';
import { ErdCluster, ErdClusterPage, ErdClusterPlan } from './ErdClusterer.js';

export type ErdColumnMode = 'all' | 'keys' | 'none';

export interface ErdClusterGeneratorOptions {
  /** Which columns each entity shows. Default `keys`. */
  columns?: ErdColumnMode;
}

export interface ErdClusterFile {
  /** File name without extension, e.g. `cluster-Customer-2`. */
  BaseName: string;
  Title: string;
  Cluster: ErdCluster;
  Page: ErdClusterPage;
  Mermaid: string;
  Html: string;
}

export interface ErdClusterOutput {
  Files: ErdClusterFile[];
  IndexHtml: string;
  IndexMarkdown: string;
}

/** Mermaid's default maxTextSize is 50,000; pages are capped well below it, this is the viewer's ceiling. */
const VIEWER_MAX_TEXT_SIZE = 200000;

export class ErdClusterGenerator {
  public Generate(state: DatabaseDocumentation, plan: ErdClusterPlan, options: ErdClusterGeneratorOptions = {}): ErdClusterOutput {
    const columns = options.columns ?? 'keys';
    const files: ErdClusterFile[] = [];
    for (const cluster of plan.Clusters) {
      for (const page of cluster.Pages) {
        const multi = cluster.Pages.length > 1;
        const baseName = `cluster-${this.identifier(cluster.HubName)}${multi ? `-${page.Number}` : ''}`;
        const title = `${cluster.HubName}${multi ? ` (${page.Number} of ${cluster.Pages.length})` : ''} — ${page.Tables.length} tables`;
        const mermaid = this.renderPage(plan, cluster, page, columns);
        files.push({ BaseName: baseName, Title: title, Cluster: cluster, Page: page, Mermaid: mermaid, Html: this.renderPageHtml(state, plan, cluster, page, title, mermaid) });
      }
    }
    return { Files: files, IndexHtml: this.renderIndexHtml(state, plan, files), IndexMarkdown: this.renderIndexMarkdown(state, plan, files) };
  }

  /** The Mermaid source for one page: its tables and the FK edges between them. */
  public RenderPage(plan: ErdClusterPlan, cluster: ErdCluster, page: ErdClusterPage, columns: ErdColumnMode = 'keys'): string {
    return this.renderPage(plan, cluster, page, columns);
  }

  private renderPage(plan: ErdClusterPlan, cluster: ErdCluster, page: ErdClusterPage, columns: ErdColumnMode): string {
    const onPage = new Set(page.Tables);
    const lines: string[] = ['erDiagram'];
    for (const key of page.Tables) {
      const table = plan.TableOf(key);
      lines.push(`    ${this.identifier(table.name)} {`);
      for (const column of table.columns) {
        if (!this.showColumn(column, columns)) continue;
        const flags = [column.isPrimaryKey && 'PK', column.isForeignKey && 'FK'].filter(Boolean).join(',');
        const type = (column.dataType || 'unknown').replace(/\s+/g, '_');
        lines.push(`        ${type} ${this.identifier(column.name)}${flags ? ` "${flags}"` : ''}`);
      }
      lines.push('    }');
    }
    for (const edge of cluster.InternalEdges) {
      if (onPage.has(edge.From) && onPage.has(edge.To)) {
        lines.push(`    ${this.identifier(plan.NameOf(edge.To))} ||--o{ ${this.identifier(plan.NameOf(edge.From))} : "${this.identifier(edge.FromColumn || '')}"`);
      }
    }
    return lines.join('\n');
  }

  private showColumn(column: ColumnDefinition, mode: ErdColumnMode): boolean {
    if (mode === 'none') return false;
    if (mode === 'all') return true;
    return column.isPrimaryKey || column.isForeignKey;
  }

  /** Mermaid entity and attribute names allow only word characters. */
  private identifier(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, '_');
  }

  private renderPageHtml(state: DatabaseDocumentation, plan: ErdClusterPlan, cluster: ErdCluster, page: ErdClusterPage, title: string, mermaid: string): string {
    const hub = plan.TableOf(cluster.Hub);
    const otherPages = cluster.Pages.length > 1
      ? `<p>Pages: ${cluster.Pages.map(p => p.Number === page.Number ? `<strong>${p.Number}</strong>` : `<a href="cluster-${this.identifier(cluster.HubName)}-${p.Number}.html">${p.Number}</a>`).join(' · ')}</p>`
      : '';
    const refs = cluster.ReferenceTables.length > 0
      ? `<h3>Reference tables used by this area</h3><p class="refs">${cluster.ReferenceTables.map(r => `${this.escape(r.Table)} <span class="count">(${r.UsedBy})</span>`).join(', ')}</p>`
      : '';
    const links = (label: string, edges: typeof cluster.OutboundEdges, pick: (e: typeof edges[number]) => string) => {
      if (edges.length === 0) return '';
      const counts = new Map<string, number>();
      for (const e of edges) counts.set(pick(e), (counts.get(pick(e)) ?? 0) + 1);
      return `<h3>${label}</h3><p class="refs">${[...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${this.escape(plan.NameOf(t))} <span class="count">(${n})</span>`).join(', ')}</p>`;
    };
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this.escape(title)} - ${this.escape(state.database.name)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 1.5rem; color: #333; }
  h1 { color: #667eea; margin-bottom: .25rem; }
  .desc { max-width: 70rem; color: #555; }
  .mermaid { overflow: auto; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 1rem; }
  .refs { max-width: 70rem; line-height: 1.6; }
  .count { color: #888; }
  nav a { margin-right: 1rem; }
</style>
</head>
<body>
<nav><a href="index.html">All subject areas</a><a href="../documentation.html">Documentation</a></nav>
<h1>${this.escape(title)}</h1>
${hub.description ? `<p class="desc">${this.escape(hub.description)}</p>` : ''}
${otherPages}
<pre class="mermaid">
${this.escape(mermaid)}
</pre>
${refs}
${links('References tables in other areas', cluster.OutboundEdges, e => e.To)}
${links('Referenced from other areas', cluster.InboundEdges, e => e.From)}
<script>mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose', maxTextSize: ${VIEWER_MAX_TEXT_SIZE}, maxEdges: 5000 });<\/script>
</body>
</html>`;
  }

  private renderIndexHtml(state: DatabaseDocumentation, plan: ErdClusterPlan, files: ErdClusterFile[]): string {
    const rows = files.map(f => {
      const hub = plan.TableOf(f.Cluster.Hub);
      return `<tr><td><a href="${f.BaseName}.html">${this.escape(f.Title)}</a></td><td>${f.Cluster.Tables.length}</td><td>${f.Cluster.InternalEdges.length}</td><td>${f.Cluster.OutboundEdges.length} / ${f.Cluster.InboundEdges.length}</td><td>${this.escape((hub.description ?? '').slice(0, 160))}</td></tr>`;
    }).join('\n');
    const list = (title: string, items: string[]) => items.length === 0 ? '' : `<h2>${title} (${items.length})</h2><p class="refs">${items.map(i => this.escape(i)).join(', ')}</p>`;
    const covered = plan.Clusters.reduce((n, c) => n + c.Tables.length, 0);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Subject areas - ${this.escape(state.database.name)}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 1.5rem; color: #333; max-width: 80rem; }
  h1 { color: #667eea; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f8; }
  .refs { line-height: 1.6; color: #555; }
  .meta { color: #666; }
</style>
</head>
<body>
<p><a href="../documentation.html">Documentation</a></p>
<h1>Subject areas — ${this.escape(state.database.name)}</h1>
<p class="meta">${plan.TotalTables} tables and ${plan.TotalEdges} foreign-key relationships. ${plan.Clusters.length} subject areas cover ${covered} tables; hubs are tables referenced by at least ${plan.Options.hubMinInbound} others, reference tables are those that reference nothing and hold fewer than ${plan.Options.lookupMaxRows.toLocaleString()} rows.</p>
<table>
<thead><tr><th>Subject area</th><th>Tables</th><th>FKs inside</th><th>Links out / in</th><th>Hub description</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${list('Reference tables (listed, not drawn)', plan.ReferenceTables.map(r => `${r.Table} (${r.ReferencedBy})`))}
${list('Tables with no foreign keys', plan.IsolatedTables)}
${list('Connected tables outside every subject area', plan.UnassignedTables)}
${list('Excluded by configuration', plan.ExcludedTables)}
</body>
</html>`;
  }

  private renderIndexMarkdown(state: DatabaseDocumentation, plan: ErdClusterPlan, files: ErdClusterFile[]): string {
    const covered = plan.Clusters.reduce((n, c) => n + c.Tables.length, 0);
    const md: string[] = [
      `# Subject areas — ${state.database.name}`,
      '',
      `${plan.TotalTables} tables and ${plan.TotalEdges} foreign-key relationships. ${plan.Clusters.length} subject areas cover ${covered} tables (hubs: referenced by ≥ ${plan.Options.hubMinInbound}; reference tables: reference nothing and < ${plan.Options.lookupMaxRows.toLocaleString()} rows).`,
      '',
      '| Subject area | Tables | FKs inside | Links out / in | Hub description |',
      '|---|---|---|---|---|',
    ];
    for (const f of files) {
      const hub = plan.TableOf(f.Cluster.Hub);
      md.push(`| [${f.Title}](${f.BaseName}.html) | ${f.Cluster.Tables.length} | ${f.Cluster.InternalEdges.length} | ${f.Cluster.OutboundEdges.length} / ${f.Cluster.InboundEdges.length} | ${(hub.description ?? '').replace(/\|/g, '/').slice(0, 160)} |`);
    }
    md.push('', '## Membership', '');
    for (const c of plan.Clusters) md.push(`**${c.HubName}**: ${c.Tables.map(plan.NameOf).join(', ')}`, '');
    const section = (title: string, items: string[]) => { if (items.length) md.push(`## ${title} (${items.length})`, '', items.join(', '), ''); };
    section('Reference tables (listed, not drawn)', plan.ReferenceTables.map(r => `${r.Table} (${r.ReferencedBy})`));
    section('Tables with no foreign keys', plan.IsolatedTables);
    section('Connected tables outside every subject area', plan.UnassignedTables);
    section('Excluded by configuration', plan.ExcludedTables);
    return md.join('\n');
  }

  private escape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
