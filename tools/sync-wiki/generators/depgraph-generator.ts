import * as fs from 'fs';
import * as path from 'path';
import { VAULT_DIRS, type SyncConfig } from '../lib/config.js';
import { getLastDepData } from '../extractors/package-extractor.js';

/** Generate a Mermaid dependency graph and write it to the vault */
export async function generateDepGraph(config: SyncConfig): Promise<number> {
  const depData = getLastDepData();
  if (!depData) {
    console.warn('  [depgraph] No dependency data available (run package-extractor first)');
    return 0;
  }

  const { packages, depGraph } = depData;

  // Calculate connectivity (deps + reverse deps) for each package
  const connectivity = new Map<string, number>();
  for (const pkg of packages) {
    const fwd = (depGraph.forward.get(pkg.displayName) || []).length;
    const rev = (depGraph.reverse.get(pkg.displayName) || []).length;
    connectivity.set(pkg.displayName, fwd + rev);
  }

  // Top 30 most connected packages for the main graph
  const topPackages = [...connectivity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name]) => name);

  const topSet = new Set(topPackages);

  // Build Mermaid graph
  const mermaidLines: string[] = ['```mermaid', 'graph TD'];

  // Add nodes with styling by category
  const categoryColors: Record<string, string> = {
    '_core': '#4a90d9',
    '_ai': '#9b59b6',
    '_angular': '#e74c3c',
    '_server': '#2ecc71',
    '_actions': '#f39c12',
    '_data': '#1abc9c',
    '_integration': '#e67e22',
    '_security': '#95a5a6',
    '_other': '#bdc3c7',
  };

  const packageCategories = new Map<string, string>();
  for (const pkg of packages) {
    packageCategories.set(pkg.displayName, pkg.category);
  }

  // Node definitions
  for (const name of topPackages) {
    const safeId = name.replace(/[^a-zA-Z0-9]/g, '_');
    mermaidLines.push(`  ${safeId}["${name}"]`);
  }

  // Edges (only between top packages)
  const addedEdges = new Set<string>();
  for (const name of topPackages) {
    const deps = depGraph.forward.get(name) || [];
    for (const dep of deps) {
      if (topSet.has(dep)) {
        const fromId = name.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = dep.replace(/[^a-zA-Z0-9]/g, '_');
        const edgeKey = `${fromId}-${toId}`;
        if (!addedEdges.has(edgeKey)) {
          mermaidLines.push(`  ${fromId} --> ${toId}`);
          addedEdges.add(edgeKey);
        }
      }
    }
  }

  // Style classes by category
  const categoryMembers = new Map<string, string[]>();
  for (const name of topPackages) {
    const cat = packageCategories.get(name) || '_other';
    const members = categoryMembers.get(cat) || [];
    members.push(name.replace(/[^a-zA-Z0-9]/g, '_'));
    categoryMembers.set(cat, members);
  }

  for (const [cat, color] of Object.entries(categoryColors)) {
    const members = categoryMembers.get(cat);
    if (members && members.length > 0) {
      const className = cat.replace('_', '');
      mermaidLines.push(`  classDef ${className} fill:${color},color:#fff,stroke:#333`);
      mermaidLines.push(`  class ${members.join(',')} ${className}`);
    }
  }

  mermaidLines.push('```');

  // Build the full page
  const page = [
    '---',
    'tags: ["moc", "dependency-graph"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Package Dependency Graph',
    '',
    `> Top 30 most connected packages (out of ${packages.length} total)`,
    '',
    '## Legend',
    '| Color | Category |',
    '|-------|----------|',
    '| Blue | Core |',
    '| Purple | AI |',
    '| Red | Angular |',
    '| Green | Server |',
    '| Orange | Actions |',
    '| Teal | Data |',
    '',
    '## Graph',
    '',
    ...mermaidLines,
    '',
    '## Statistics',
    '',
    `- **Total packages**: ${packages.length}`,
    `- **Total MJ dependencies**: ${[...depGraph.forward.values()].reduce((sum, deps) => sum + deps.length, 0)}`,
    `- **Most depended-on**: ${[...connectivity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `[[${name}]] (${count})`).join(', ')}`,
    '',
    '## See Also',
    '- [[MOC-Packages]]',
    '',
  ].join('\n');

  const indexDir = path.join(config.vaultPath, VAULT_DIRS.index);
  fs.mkdirSync(indexDir, { recursive: true });
  fs.writeFileSync(path.join(indexDir, 'MOC-Dependency-Graph.md'), page);

  return 1;
}
