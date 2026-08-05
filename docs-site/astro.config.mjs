// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { remarkMermaidToHtml } from './scripts/lib/remark-mermaid.mjs';

/**
 * Deploy-time knobs (set by .github/workflows/docs.yml):
 *   DOCS_BASE  path prefix the site is served under. '/MJ' on github.io today;
 *              unset (root) after the docs.memberjunction.org CNAME flip.
 *   DOCS_SITE  canonical origin for sitemap/OG URLs.
 * All cross-page links in generated content are RELATIVE (see ingest), so the
 * base can change without touching content.
 */
const base = normalizeBase(process.env.DOCS_BASE ?? '/');
const site = process.env.DOCS_SITE ?? 'https://memberjunction.github.io';
const apiHref = base === '/' ? '/api/' : `${base}/api/`;

export default defineConfig({
  site,
  base,
  markdown: {
    remarkPlugins: [remarkMermaidToHtml],
  },
  integrations: [
    starlight({
      title: 'MemberJunction',
      description: 'The open-source, AI-native data platform — unify your data, add intelligence, build AI-native apps on top of it.',
      /*
       * Horizontal lockup (948x132). The previous stacked pair was 200px wide,
       * which renders soft on retina and reads as a tiny mark once the header
       * bar constrains it by height. `light`/`dark` name the THEME the file is
       * shown in, so `light` carries the navy-ink artwork.
       */
      logo: {
        light: './src/assets/MJ_logo_wide.png',
        dark: './src/assets/MJ_logo_wide_dark.png',
        replacesTitle: true,
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/MemberJunction/MJ' }],
      editLink: { baseUrl: 'https://github.com/MemberJunction/MJ/edit/next/docs-site/' },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      components: {
        Footer: './src/components/Footer.astro',
        SiteTitle: './src/components/SiteTitle.astro',
      },
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { label: 'What is MemberJunction?', slug: 'overview' },
            { label: 'Getting Started', slug: 'getting-started' },
            { label: 'Deployment', slug: 'deployment' },
            { label: 'Upgrading to v5', slug: 'upgrade-v5' },
          ],
        },
        { label: 'Release Notes', collapsed: true, autogenerate: { directory: 'releases', collapsed: true } },
        { label: 'Architecture', slug: 'architecture' },
        { label: 'Building Apps on MJ', slug: 'custom-apps' },
        { label: 'Guides', collapsed: true, autogenerate: { directory: 'guides', collapsed: true } },
        {
          label: 'AI & Agents',
          items: [
            { label: 'Overview', slug: 'ai-and-agents' },
            { label: 'Agent Skills', slug: 'ai-and-agents/skills' },
          ],
        },
        { label: 'Packages', collapsed: true, autogenerate: { directory: 'packages', collapsed: true } },
        {
          label: 'Reference',
          items: [
            { label: 'Metadata System', slug: 'metadata' },
            { label: 'API Reference (TypeDoc)', link: apiHref },
          ],
        },
        { label: 'Ecosystem', slug: 'ecosystem' },
        { label: 'Community', slug: 'community' },
        {
          label: 'MJ Central — hosted MJ ↗',
          link: 'https://central.memberjunction.com',
          attrs: { target: '_blank', rel: 'noopener' },
          badge: { text: 'MJC', variant: 'tip' },
        },
      ],
    }),
  ],
});

/**
 * '/MJ/' -> '/MJ'; '' -> '/'; guarantees a leading slash, no trailing slash.
 * @param {string} value
 */
function normalizeBase(value) {
  const trimmed = `/${value}`.replace(/^\/+/, '/').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}
