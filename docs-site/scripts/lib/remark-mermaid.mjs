/**
 * Converts ```mermaid fences into <pre class="mermaid"> blocks at build time.
 * The client-side renderer in src/components/Footer.astro picks these up and
 * draws them with the bundled mermaid library (theme-aware, no CDN).
 */
import { visit } from 'unist-util-visit';

export function remarkMermaidToHtml() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || parent === undefined || index === undefined) return;
      parent.children[index] = { type: 'html', value: `<pre class="mermaid">${escapeHtml(node.value)}</pre>` };
    });
  };
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
