/**
 * @fileoverview The CPU-heavy half of {@link WebPageContentAction}: turning fetched HTML and PDF
 * bytes into text, Markdown and metadata. jsdom, turndown and pdf-parse are synchronous, and on a
 * real page they block the thread they run on for up to seconds (1.4s for HTML-to-Markdown and
 * 0.7s for one PDF in a live MJAPI profile, MJ #5510). These functions have no MemberJunction
 * imports so the same code runs on the worker thread {@link WebContentWorkerHost} owns, or
 * in-process when no worker is available.
 *
 * @module @memberjunction/core-actions
 */

import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import pdfParse from 'pdf-parse';

/** What to produce from an HTML page. */
export interface HtmlTransformOptions {
  OutputType: string;
  ExtractMainContent: boolean;
  IncludeMetadata: boolean;
  MaxLength: number;
}

/** What to produce from a PDF. */
export interface PdfTransformOptions {
  OutputType: string;
  IncludeMetadata: boolean;
  MaxLength: number;
}

let turndownService: TurndownService | null = null;

/** The shared HTML-to-Markdown converter, configured the way the action always has. */
export function GetTurndown(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });
  }
  return turndownService;
}

/** Truncates content to the given length, marking the cut with an ellipsis. */
export function TruncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

/** Converts an HTML page into the requested output, the shape `processHtml` has always returned. */
export function TransformHtml(html: string, options: HtmlTransformOptions): Record<string, unknown> {
  const { OutputType: outputType, ExtractMainContent: extractMain, IncludeMetadata: includeMetadata, MaxLength: maxLength } = options;
  const result: Record<string, unknown> = {
    detectedType: 'html',
    outputType,
    extractMainContent: extractMain,
  };

  if (includeMetadata) {
    result.metadata = extractHtmlMetadata(html);
  }

  const contentHtml = extractMain ? extractMainContent(html) : html;

  let content: string;
  if (outputType === 'markdown') {
    content = GetTurndown().turndown(contentHtml);
  } else if (outputType === 'text') {
    content = HtmlToText(contentHtml);
  } else if (outputType === 'json') {
    const dom = new JSDOM(contentHtml);
    result.content = {
      html: TruncateContent(contentHtml, maxLength),
      text: TruncateContent(HtmlToText(contentHtml), maxLength),
      markdown: TruncateContent(GetTurndown().turndown(contentHtml), maxLength),
      structure: extractStructure(dom.window.document),
    };
    return result;
  } else {
    content = contentHtml;
  }

  result.content = TruncateContent(content, maxLength);
  return result;
}

/** Extracts a PDF's text and metadata, the shape `processPdf` has always returned. */
export async function TransformPdf(data: Uint8Array, options: PdfTransformOptions): Promise<Record<string, unknown>> {
  const { OutputType: outputType, IncludeMetadata: includeMetadata, MaxLength: maxLength } = options;
  const pdfData = await pdfParse(Buffer.from(data.buffer, data.byteOffset, data.byteLength));

  const result: Record<string, unknown> = {
    detectedType: 'pdf',
    outputType,
  };

  if (includeMetadata) {
    result.metadata = {
      pages: pdfData.numpages,
      info: pdfData.info,
      version: pdfData.version,
    };
  }

  const text = pdfData.text || '';

  if (outputType === 'json') {
    result.content = {
      text: TruncateContent(text, maxLength),
      pages: pdfData.numpages,
      metadata: pdfData.info,
    };
  } else {
    result.content = TruncateContent(text, maxLength);
  }

  return result;
}

/** Title, meta tags and canonical URL. */
function extractHtmlMetadata(html: string): Record<string, unknown> {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const metadata: Record<string, unknown> = {};

  const title = doc.querySelector('title');
  if (title) {
    metadata.title = title.textContent?.trim();
  }

  const metas = doc.querySelectorAll('meta');
  metas.forEach((meta) => {
    const name = meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (name && content) {
      metadata[name] = content;
    }
  });

  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical) {
    metadata.canonical = canonical.getAttribute('href');
  }

  return metadata;
}

/** The page's main content container, or the body without navigation chrome. */
function extractMainContent(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  doc.querySelectorAll('script, style, nav, header, footer, aside').forEach((el) => el.remove());

  const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post', '.article'];
  for (const selector of mainSelectors) {
    const element = doc.querySelector(selector);
    if (element && element.textContent && element.textContent.trim().length > 100) {
      return element.innerHTML;
    }
  }

  const body = doc.querySelector('body');
  return body ? body.innerHTML : html;
}

/** Plain text, without scripts or styles. */
export function HtmlToText(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  return doc.body.textContent || '';
}

/** Headings, links and images. */
function extractStructure(doc: Document): Record<string, unknown> {
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
    level: parseInt(h.tagName[1]),
    text: h.textContent?.trim() || '',
  }));
  const links = Array.from(doc.querySelectorAll('a[href]')).map((a) => ({
    url: a.getAttribute('href'),
    text: a.textContent?.trim() || '',
  }));
  const images = Array.from(doc.querySelectorAll('img[src]')).map((img) => ({
    src: img.getAttribute('src'),
    alt: img.getAttribute('alt') || '',
  }));
  return { headings, links, images };
}
