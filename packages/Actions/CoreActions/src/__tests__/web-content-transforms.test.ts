/**
 * The HTML/PDF conversions WebPageContentAction runs, moved into web-content-transforms so they
 * can run on a worker thread (MJ #5510). These pin the output shapes the action has always returned.
 */
import { describe, expect, it } from 'vitest';
import { TransformHtml, TransformPdf, TruncateContent } from '../custom/web/web-content-transforms';

const PAGE = `<!doctype html><html><head>
<title> Renewals </title>
<meta name="description" content="Chapter renewal plan">
<meta property="og:type" content="article">
<link rel="canonical" href="https://example.org/renewals">
</head><body>
<nav>Home | About</nav>
<article><h1>Renewal Plan</h1><p>${'Members renew when chapters engage them early. '.repeat(4)}</p>
<h2>Steps</h2><p>Read <a href="/guide">the guide</a>.</p><img src="/chart.png" alt="Chart"></article>
<script>var x = 1;</script>
</body></html>`;

const html = (outputType: string, extra: Partial<{ ExtractMainContent: boolean; IncludeMetadata: boolean; MaxLength: number }> = {}) =>
  TransformHtml(PAGE, { OutputType: outputType, ExtractMainContent: false, IncludeMetadata: false, MaxLength: 100_000, ...extra });

/** A one-page PDF (a few hundred bytes) whose page draws `text` in Helvetica, with a correct xref table. */
function minimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 24 Tf 72 72 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

describe('TransformHtml', () => {
  it('converts the page to Markdown', () => {
    const result = html('markdown');
    expect(result).toMatchObject({ detectedType: 'html', outputType: 'markdown', extractMainContent: false });
    expect(result.content).toContain('# Renewal Plan');
    expect(result.content).toContain('## Steps');
    expect(result.content).toContain('[the guide](/guide)');
  });

  it('converts the page to plain text without script contents', () => {
    const content = html('text').content as string;
    expect(content).toContain('Renewal Plan');
    expect(content).not.toContain('var x = 1');
  });

  it('returns html, text, markdown and the heading/link/image structure for json', () => {
    const content = html('json').content as Record<string, unknown>;
    expect(content.markdown).toContain('# Renewal Plan');
    expect(content.structure).toEqual({
      headings: [
        { level: 1, text: 'Renewal Plan' },
        { level: 2, text: 'Steps' },
      ],
      links: [{ url: '/guide', text: 'the guide' }],
      images: [{ src: '/chart.png', alt: 'Chart' }],
    });
  });

  it('extracts title, meta tags and canonical URL as metadata', () => {
    expect(html('html', { IncludeMetadata: true }).metadata).toEqual({
      title: 'Renewals',
      description: 'Chapter renewal plan',
      'og:type': 'article',
      canonical: 'https://example.org/renewals',
    });
  });

  it('keeps only the main content container when asked', () => {
    const content = html('html', { ExtractMainContent: true }).content as string;
    expect(content).toContain('<h1>Renewal Plan</h1>');
    expect(content).not.toContain('Home | About');
  });

  it('truncates to MaxLength with an ellipsis', () => {
    expect(html('markdown', { MaxLength: 10 }).content).toMatch(/^.{10}\.\.\.$/s);
  });
});

describe('TransformPdf', () => {
  it("extracts the page text and the PDF's metadata", async () => {
    const result = await TransformPdf(minimalPdf('Hello renewals'), { OutputType: 'text', IncludeMetadata: true, MaxLength: 100_000 });
    expect(result.detectedType).toBe('pdf');
    expect(result.content).toContain('Hello renewals');
    expect(result.metadata).toMatchObject({ pages: 1 });
  });

  it('returns text, pages and info for json', async () => {
    const result = await TransformPdf(minimalPdf('Hello renewals'), { OutputType: 'json', IncludeMetadata: false, MaxLength: 100_000 });
    expect(result.metadata).toBeUndefined();
    expect(result.content).toMatchObject({ pages: 1 });
    expect((result.content as { text: string }).text).toContain('Hello renewals');
  });

  // pdf.js 1.10 (inside pdf-parse) copies its input with `new input.constructor(input)` and then reads
  // the copy's whole ArrayBuffer, ignoring its byteOffset. A copied Node Buffer can sit in Node's shared
  // allocation pool at a nonzero offset, so a Buffer input misparses ("bad XRef entry") depending on
  // size and Node version. These pin that every input shape parses.
  it('extracts a PDF that arrives as a pooled Buffer', async () => {
    const pooled = Buffer.from(minimalPdf('Hello renewals')); // a few hundred bytes: Node allocates it from its pool
    expect(pooled.byteOffset > 0 || pooled.buffer.byteLength > pooled.byteLength).toBe(true);
    const result = await TransformPdf(pooled, { OutputType: 'text', IncludeMetadata: false, MaxLength: 100_000 });
    expect(result.content).toContain('Hello renewals');
  });

  it('extracts a PDF that is a view into a larger buffer', async () => {
    const pdf = minimalPdf('Hello renewals');
    const backing = new Uint8Array(pdf.length + 4096).fill(0x73);
    backing.set(pdf, 2048);
    const result = await TransformPdf(backing.subarray(2048, 2048 + pdf.length), { OutputType: 'text', IncludeMetadata: false, MaxLength: 100_000 });
    expect(result.content).toContain('Hello renewals');
  });
});

describe('TruncateContent', () => {
  it('leaves short content alone and cuts long content with an ellipsis', () => {
    expect(TruncateContent('abc', 5)).toBe('abc');
    expect(TruncateContent('abcdef', 3)).toBe('abc...');
  });
});
