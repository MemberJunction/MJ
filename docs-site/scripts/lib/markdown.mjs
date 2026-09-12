/**
 * Markdown transform pipeline for ingested repo docs:
 * parse (GFM) -> extract title/description -> rewrite links -> stringify,
 * then prepend Starlight frontmatter.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { toString as mdastToString } from 'mdast-util-to-string';
import { createLinkRewriter } from './rewrite.mjs';
import { rewriteThemePictures } from './theme-picture.mjs';

const STRINGIFY_OPTIONS = { bullet: '-', fences: true, rule: '-', emphasis: '*', strong: '*' };
const DESCRIPTION_MAX = 200;
const TLDR_HEADING = /^TL;?DR$/i;

/**
 * Transform one repo markdown file into a Starlight page body.
 * Returns { title, description, body } — title/description are extracted from
 * the document (first H1 / first paragraph) and the H1 is removed because
 * Starlight renders the frontmatter title as the page H1.
 */
export function transformRepoMarkdown(source, ctx) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, STRINGIFY_OPTIONS);
  const tree = processor.parse(source);
  const title = extractTitle(tree);
  const description = extractDescription(tree);
  // Before the link rewriter: the <img> pair this emits still carries repo-
  // relative src values, so the rewriter resolves them like any other image.
  rewriteThemePictures(tree);
  createLinkRewriter(ctx)(tree);
  return { title, description, body: processor.stringify(tree) };
}

/** Find + remove the first depth-1 heading; returns its plain text or ''. */
export function extractTitle(tree) {
  const index = tree.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  if (index === -1) return '';
  const [heading] = tree.children.splice(index, 1);
  return mdastToString(heading).trim();
}

/**
 * Plain text for the SEO/search snippet, truncated.
 *
 * Prefers a `TL;DR` section's content when the document has one, because release notes
 * put their summary there (see releases/README.md) and their *first paragraph* is the
 * standing-context line — "Edge builds are prereleases…" — which is identical on every
 * release page and useless as a description. Everything else still uses its first
 * paragraph, and so do release files written before the TL;DR was required.
 */
export function extractDescription(tree) {
  const raw = tldrText(tree) ?? firstParagraphText(tree);
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= DESCRIPTION_MAX) return text;
  return `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

/** Text under the first `TL;DR` heading, or null if there is none with content. */
function tldrText(tree) {
  const index = tree.children.findIndex(
    (node) => node.type === 'heading' && TLDR_HEADING.test(mdastToString(node).trim()),
  );
  if (index === -1) return null;
  const node = tree.children[index + 1];
  if (!node || node.type === 'heading') return null;
  // A list stringifies to its items concatenated with NO separator, which would run the
  // bullets together ("…claim their records.PostgreSQL deployments…"). Join explicitly.
  const text = node.type === 'list'
    ? node.children.map((item) => mdastToString(item).trim()).join(' ')
    : mdastToString(node);
  return text.trim() ? text : null;
}

function firstParagraphText(tree) {
  const paragraph = tree.children.find((node) => node.type === 'paragraph');
  return paragraph ? mdastToString(paragraph) : '';
}

/**
 * Serialize Starlight frontmatter. Scalar values are emitted with
 * JSON.stringify — valid YAML for any string content.
 */
export function buildFrontmatter({ title, description, editUrl, sidebarLabel, sidebarOrder }) {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  if (editUrl) lines.push(`editUrl: ${JSON.stringify(editUrl)}`);
  if (sidebarLabel !== undefined || sidebarOrder !== undefined) {
    lines.push('sidebar:');
    if (sidebarLabel !== undefined) lines.push(`  label: ${JSON.stringify(sidebarLabel)}`);
    if (sidebarOrder !== undefined) lines.push(`  order: ${sidebarOrder}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}
