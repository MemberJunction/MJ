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

/** Plain text of the first paragraph, truncated for SEO/search snippets. */
export function extractDescription(tree) {
  const paragraph = tree.children.find((node) => node.type === 'paragraph');
  if (!paragraph) return '';
  const text = mdastToString(paragraph).replace(/\s+/g, ' ').trim();
  if (text.length <= DESCRIPTION_MAX) return text;
  return `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
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
