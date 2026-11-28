import type { DocumentBlockSpec, DocumentDesignConfig } from '@memberjunction/core-entities';

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP_LFH_SIG = 0x04034b50;

// OOXML zip-bomb defense bounds: typical Word .docx archives have 15-80 XML/media parts,
// so capping at 512 entries, 16 MiB per uncompressed XML part, and 48 MiB total extracted
// prevents maliciously compressed archives from exhausting browser or Node heap memory.
const MAX_ZIP_ENTRIES = 512; // Zip-bomb guard: max ZIP central-directory entries accepted from a .docx upload
const MAX_SINGLE_ENTRY_BYTES = 16 * 1024 * 1024; // Zip-bomb guard: 16 MiB uncompressed ceiling for any single OOXML part
const MAX_TOTAL_EXTRACTED_BYTES = 48 * 1024 * 1024; // Zip-bomb guard: 48 MiB cumulative uncompressed ceiling across all parts

export const MJ_DOCX_CUSTOM_PROP_BLOCKS = 'MJBlocks';
export const MJ_DOCX_CUSTOM_PROP_DESIGN = 'MJDesignPreset';
export const MJ_DOCX_BLOCK_MARKER_PREFIX = 'MJ-BLOCK-REF:';

export interface DocxExtractedTrackedChange {
  Author: string;
  Date: string;
  DeletedText: string;
  InsertedText: string;
  ParagraphOriginalText: string;
  ParagraphProposedText: string;
}

export interface DocxExtractedComment {
  CommentID: string;
  Author: string;
  Date: string;
  BodyText: string;
  QuotedText: string;
}

export interface DocxArchiveInspection {
  MJBlocks: DocumentBlockSpec[];
  DesignConfig: Partial<DocumentDesignConfig> | null;
  TrackedChanges: DocxExtractedTrackedChange[];
  Comments: DocxExtractedComment[];
  FootnotesCount: number;
  EndnotesCount: number;
  ChartsCount: number;
  SmartArtCount: number;
  TextBoxesCount: number;
  FloatingDrawingsCount: number;
  EmbeddedMediaCount: number;
}

const RELEVANT_XML_PATHS: ReadonlySet<string> = new Set([
  'docProps/custom.xml',
  'word/document.xml',
  'word/comments.xml',
  'word/footnotes.xml',
  'word/endnotes.xml',
]);

/**
 * Decodes standard XML character references (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, numeric entities)
 * using a linear scan.
 */
export function DecodeXmlEntities(input: string): string {
  if (!input || !input.includes('&')) {
    return input;
  }
  let out = '';
  let i = 0;
  while (i < input.length) {
    const amp = input.indexOf('&', i);
    if (amp < 0) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, amp);
    const semi = input.indexOf(';', amp + 1);
    if (semi < 0 || semi - amp > 12) {
      out += '&';
      i = amp + 1;
      continue;
    }
    const entity = input.slice(amp + 1, semi);
    switch (entity) {
      case 'amp':
        out += '&';
        break;
      case 'lt':
        out += '<';
        break;
      case 'gt':
        out += '>';
        break;
      case 'quot':
        out += '"';
        break;
      case 'apos':
        out += "'";
        break;
      default:
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const cp = Number.parseInt(entity.slice(2), 16);
          out += Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : `&${entity};`;
        } else if (entity.startsWith('#')) {
          const cp = Number.parseInt(entity.slice(1), 10);
          out += Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : `&${entity};`;
        } else {
          out += `&${entity};`;
        }
        break;
    }
    i = semi + 1;
  }
  return out;
}

/**
 * Inflates a raw DEFLATE stream using the standard Web `DecompressionStream('deflate-raw')`
 * (supported in modern browsers and Node 18+), enforcing a strict output byte ceiling.
 */
async function inflateRawBounded(compressed: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream is unavailable in this runtime.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const writePromise = writer
    .write(copy)
    .then(() => writer.close())
    .catch(() => {
      // Errors surface on the reader side as well
    });

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error('ZIP entry exceeded safe decompression size limit.');
        }
        chunks.push(value);
      }
    }
  } finally {
    await writePromise;
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Reads selected XML text parts and lists archive member paths from a `.docx` ZIP buffer
 * without requiring any external ZIP package.
 */
export async function ReadDocxZipMetadata(arrayBuffer: ArrayBuffer): Promise<{
  XmlParts: Map<string, string>;
  AllPaths: string[];
}> {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const xmlParts = new Map<string, string>();
  const allPaths: string[] = [];

  if (bytes.byteLength < 22) {
    return { XmlParts: xmlParts, AllPaths: allPaths };
  }

  // Locate End of Central Directory (EOCD)
  const searchStart = Math.max(0, bytes.byteLength - 65557);
  let eocdOffset = -1;
  for (let pos = bytes.byteLength - 22; pos >= searchStart; pos--) {
    if (view.getUint32(pos, true) === ZIP_EOCD_SIG) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset < 0) {
    return { XmlParts: xmlParts, AllPaths: allPaths };
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  if (cdOffset + cdSize > bytes.byteLength) {
    return { XmlParts: xmlParts, AllPaths: allPaths };
  }

  const textDecoder = new TextDecoder('utf-8');
  let cursor = cdOffset;
  let totalExtracted = 0;
  const entryLimit = Math.min(totalEntries, MAX_ZIP_ENTRIES);

  for (let i = 0; i < entryLimit && cursor + 46 <= cdOffset + cdSize; i++) {
    if (view.getUint32(cursor, true) !== ZIP_CD_SIG) {
      break;
    }
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > bytes.byteLength) {
      break;
    }
    const entryName = textDecoder.decode(bytes.subarray(nameStart, nameEnd));
    cursor = nameEnd + extraLen + commentLen;

    if (entryName.includes('..') || entryName.startsWith('/')) {
      continue;
    }
    allPaths.push(entryName);

    if (!RELEVANT_XML_PATHS.has(entryName)) {
      continue;
    }
    if (uncompressedSize > MAX_SINGLE_ENTRY_BYTES || totalExtracted + uncompressedSize > MAX_TOTAL_EXTRACTED_BYTES) {
      continue;
    }
    if (localHeaderOffset + 30 > bytes.byteLength || view.getUint32(localHeaderOffset, true) !== ZIP_LFH_SIG) {
      continue;
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) {
      continue;
    }

    const rawSlice = bytes.subarray(dataStart, dataEnd);
    let inflated: Uint8Array | null = null;
    if (compressionMethod === 0) {
      inflated = rawSlice;
    } else if (compressionMethod === 8) {
      try {
        inflated = await inflateRawBounded(rawSlice, MAX_SINGLE_ENTRY_BYTES);
      } catch {
        inflated = null;
      }
    }
    if (inflated) {
      totalExtracted += inflated.byteLength;
      xmlParts.set(entryName, textDecoder.decode(inflated));
    }
  }

  return { XmlParts: xmlParts, AllPaths: allPaths };
}

/**
 * Extracts a named custom property string value from `docProps/custom.xml` linearly.
 */
export function ExtractCustomPropertyFromXml(customXml: string, propName: string): string | null {
  if (!customXml) {
    return null;
  }
  const needle = `name="${propName}"`;
  let searchPos = 0;
  while (searchPos < customXml.length) {
    const idx = customXml.indexOf(needle, searchPos);
    if (idx < 0) {
      return null;
    }
    const tagStart = customXml.lastIndexOf('<', idx);
    const propEnd = customXml.indexOf('</property>', idx);
    if (tagStart >= 0 && propEnd > idx) {
      const propSlice = customXml.slice(idx, propEnd);
      const valOpen = propSlice.indexOf('<vt:lpwstr>');
      const valClose = propSlice.indexOf('</vt:lpwstr>');
      if (valOpen >= 0 && valClose > valOpen) {
        return DecodeXmlEntities(propSlice.slice(valOpen + '<vt:lpwstr>'.length, valClose));
      }
    }
    searchPos = idx + needle.length;
  }
  return null;
}

/** Reads an XML attribute value (e.g. `w:author="..."`) from an opening tag snippet linearly. */
function readXmlAttr(tagSlice: string, attrName: string): string {
  const doublePrefix = `${attrName}="`;
  const dIdx = tagSlice.indexOf(doublePrefix);
  if (dIdx >= 0) {
    const valStart = dIdx + doublePrefix.length;
    const valEnd = tagSlice.indexOf('"', valStart);
    if (valEnd >= valStart) {
      return DecodeXmlEntities(tagSlice.slice(valStart, valEnd));
    }
  }
  const singlePrefix = `${attrName}='`;
  const sIdx = tagSlice.indexOf(singlePrefix);
  if (sIdx >= 0) {
    const valStart = sIdx + singlePrefix.length;
    const valEnd = tagSlice.indexOf("'", valStart);
    if (valEnd >= valStart) {
      return DecodeXmlEntities(tagSlice.slice(valStart, valEnd));
    }
  }
  return '';
}

/** Extracts all plain text inside `<w:t ...>...</w:t>` and `<w:delText ...>...</w:delText>` nodes linearly. */
function extractTagText(xmlSlice: string, tagName: 'w:t' | 'w:delText'): string {
  const openPrefix = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let out = '';
  let pos = 0;
  while (pos < xmlSlice.length) {
    const start = xmlSlice.indexOf(openPrefix, pos);
    if (start < 0) break;
    const nextChar = xmlSlice[start + openPrefix.length];
    if (nextChar !== '>' && nextChar !== ' ' && nextChar !== '/') {
      pos = start + openPrefix.length;
      continue;
    }
    const openEnd = xmlSlice.indexOf('>', start);
    if (openEnd < 0) break;
    if (xmlSlice[openEnd - 1] === '/') {
      pos = openEnd + 1;
      continue;
    }
    const closeIdx = xmlSlice.indexOf(closeTag, openEnd + 1);
    if (closeIdx < 0) break;
    out += DecodeXmlEntities(xmlSlice.slice(openEnd + 1, closeIdx));
    pos = closeIdx + closeTag.length;
  }
  return out;
}

/** Counts occurrences of an XML opening tag name (linear scan). */
function countXmlTags(xml: string, tagName: string): number {
  if (!xml) return 0;
  const openPrefix = `<${tagName}`;
  let count = 0;
  let pos = 0;
  while (pos < xml.length) {
    const idx = xml.indexOf(openPrefix, pos);
    if (idx < 0) break;
    const after = xml[idx + openPrefix.length];
    if (after === '>' || after === ' ' || after === '/') {
      count++;
    }
    pos = idx + openPrefix.length;
  }
  return count;
}

/**
 * Extracts Word `<w:ins>` and `<w:del>` tracked revisions from `word/document.xml`
 * grouped per paragraph so they map cleanly into MJ Docs suggestions.
 */
export function ExtractWordTrackedChangesFromDocumentXml(docXml: string): DocxExtractedTrackedChange[] {
  if (!docXml || (!docXml.includes('<w:ins') && !docXml.includes('<w:del'))) {
    return [];
  }
  const results: DocxExtractedTrackedChange[] = [];
  let pos = 0;
  while (pos < docXml.length) {
    const pStart = docXml.indexOf('<w:p', pos);
    if (pStart < 0) break;
    const nextCh = docXml[pStart + 4];
    if (nextCh !== '>' && nextCh !== ' ') {
      pos = pStart + 4;
      continue;
    }
    const pEnd = docXml.indexOf('</w:p>', pStart);
    if (pEnd < 0) break;
    const pXml = docXml.slice(pStart, pEnd + 6);
    pos = pEnd + 6;

    if (!pXml.includes('<w:ins') && !pXml.includes('<w:del')) {
      continue;
    }

    let originalText = '';
    let proposedText = '';
    let deletedParts: string[] = [];
    let insertedParts: string[] = [];
    let author = '';
    let date = '';

    // Linearly walk top-level runs/revisions inside this paragraph
    let cursor = 0;
    while (cursor < pXml.length) {
      const nextIns = pXml.indexOf('<w:ins', cursor);
      const nextDel = pXml.indexOf('<w:del', cursor);
      const candidates: Array<{ kind: 'ins' | 'del'; idx: number }> = [];
      if (nextIns >= 0 && (pXml[nextIns + 6] === '>' || pXml[nextIns + 6] === ' ')) {
        candidates.push({ kind: 'ins', idx: nextIns });
      }
      if (nextDel >= 0 && (pXml[nextDel + 6] === '>' || pXml[nextDel + 6] === ' ')) {
        candidates.push({ kind: 'del', idx: nextDel });
      }
      if (candidates.length === 0) {
        const plain = extractTagText(pXml.slice(cursor), 'w:t');
        originalText += plain;
        proposedText += plain;
        break;
      }
      candidates.sort((a, b) => a.idx - b.idx);
      const next = candidates[0];
      const beforePlain = extractTagText(pXml.slice(cursor, next.idx), 'w:t');
      originalText += beforePlain;
      proposedText += beforePlain;

      const closeTag = next.kind === 'ins' ? '</w:ins>' : '</w:del>';
      const openEnd = pXml.indexOf('>', next.idx);
      const closeIdx = pXml.indexOf(closeTag, next.idx);
      if (openEnd < 0 || closeIdx < 0) {
        cursor = next.idx + 6;
        continue;
      }
      const openHeader = pXml.slice(next.idx, openEnd + 1);
      if (!author) {
        author = readXmlAttr(openHeader, 'w:author');
      }
      if (!date) {
        date = readXmlAttr(openHeader, 'w:date');
      }
      const inner = pXml.slice(openEnd + 1, closeIdx);
      if (next.kind === 'ins') {
        const insText = extractTagText(inner, 'w:t');
        proposedText += insText;
        if (insText) insertedParts.push(insText);
      } else {
        const delText = extractTagText(inner, 'w:delText') || extractTagText(inner, 'w:t');
        originalText += delText;
        if (delText) deletedParts.push(delText);
      }
      cursor = closeIdx + closeTag.length;
    }

    const origTrimmed = originalText.trim();
    const propTrimmed = proposedText.trim();
    if (origTrimmed !== propTrimmed && (deletedParts.length > 0 || insertedParts.length > 0)) {
      results.push({
        Author: author || 'Word Reviewer',
        Date: date || new Date().toISOString(),
        DeletedText: deletedParts.join(' '),
        InsertedText: insertedParts.join(' '),
        ParagraphOriginalText: origTrimmed,
        ParagraphProposedText: propTrimmed,
      });
    }
  }
  return results;
}

/**
 * Extracts Word margin comments from `word/comments.xml` and resolves quoted anchor text
 * from `w:commentRangeStart`..`w:commentRangeEnd` inside `word/document.xml`.
 */
export function ExtractWordCommentsFromXml(commentsXml: string, docXml: string): DocxExtractedComment[] {
  if (!commentsXml || !commentsXml.includes('<w:comment')) {
    return [];
  }
  const comments: DocxExtractedComment[] = [];
  let pos = 0;
  while (pos < commentsXml.length) {
    const start = commentsXml.indexOf('<w:comment', pos);
    if (start < 0) break;
    const after = commentsXml[start + 10];
    if (after !== '>' && after !== ' ') {
      pos = start + 10;
      continue;
    }
    const openEnd = commentsXml.indexOf('>', start);
    const closeIdx = commentsXml.indexOf('</w:comment>', start);
    if (openEnd < 0 || closeIdx < 0) break;

    const header = commentsXml.slice(start, openEnd + 1);
    const id = readXmlAttr(header, 'w:id');
    const author = readXmlAttr(header, 'w:author') || 'Word Reviewer';
    const date = readXmlAttr(header, 'w:date') || new Date().toISOString();
    const bodyXml = commentsXml.slice(openEnd + 1, closeIdx);
    const bodyText = extractTagText(bodyXml, 'w:t').trim();
    pos = closeIdx + '</w:comment>'.length;

    if (!bodyText) {
      continue;
    }

    let quotedText = '';
    if (id && docXml) {
      const startMarkerDouble = `<w:commentRangeStart w:id="${id}"`;
      const startMarkerSingle = `<w:commentRangeStart w:id='${id}'`;
      let rStart = docXml.indexOf(startMarkerDouble);
      if (rStart < 0) {
        rStart = docXml.indexOf(startMarkerSingle);
      }
      if (rStart >= 0) {
        const endMarkerDouble = `<w:commentRangeEnd w:id="${id}"`;
        const endMarkerSingle = `<w:commentRangeEnd w:id='${id}'`;
        let rEnd = docXml.indexOf(endMarkerDouble, rStart);
        if (rEnd < 0) {
          rEnd = docXml.indexOf(endMarkerSingle, rStart);
        }
        if (rEnd > rStart) {
          quotedText = extractTagText(docXml.slice(rStart, rEnd), 'w:t').trim().slice(0, 240);
        }
      }
    }

    comments.push({
      CommentID: id || `word-comment-${comments.length + 1}`,
      Author: author,
      Date: date,
      BodyText: bodyText,
      QuotedText: quotedText,
    });
  }
  return comments;
}

/**
 * Inspects a `.docx` binary archive for embedded MJ metadata (`MJBlocks`, `MJDesignPreset`),
 * Word tracked changes, Word margin comments, and Word-only fidelity features.
 */
export async function InspectDocxArchive(arrayBuffer: ArrayBuffer): Promise<DocxArchiveInspection> {
  const { XmlParts, AllPaths } = await ReadDocxZipMetadata(arrayBuffer);
  const customXml = XmlParts.get('docProps/custom.xml') ?? '';
  const docXml = XmlParts.get('word/document.xml') ?? '';
  const commentsXml = XmlParts.get('word/comments.xml') ?? '';
  const footnotesXml = XmlParts.get('word/footnotes.xml') ?? '';
  const endnotesXml = XmlParts.get('word/endnotes.xml') ?? '';

  let mjBlocks: DocumentBlockSpec[] = [];
  const rawBlocksJson = ExtractCustomPropertyFromXml(customXml, MJ_DOCX_CUSTOM_PROP_BLOCKS);
  if (rawBlocksJson) {
    try {
      const parsed: unknown = JSON.parse(rawBlocksJson);
      if (Array.isArray(parsed)) {
        mjBlocks = parsed.filter(
          (item): item is DocumentBlockSpec =>
            Boolean(item && typeof item === 'object' && typeof (item as DocumentBlockSpec).BlockID === 'string'),
        );
      }
    } catch {
      mjBlocks = [];
    }
  }

  let designConfig: Partial<DocumentDesignConfig> | null = null;
  const rawDesignJson = ExtractCustomPropertyFromXml(customXml, MJ_DOCX_CUSTOM_PROP_DESIGN);
  if (rawDesignJson) {
    try {
      const parsed: unknown = JSON.parse(rawDesignJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        designConfig = parsed as Partial<DocumentDesignConfig>;
      }
    } catch {
      designConfig = null;
    }
  }

  const trackedChanges = ExtractWordTrackedChangesFromDocumentXml(docXml);
  const comments = ExtractWordCommentsFromXml(commentsXml, docXml);

  const chartsCount = AllPaths.filter((p) => p.startsWith('word/charts/') && p.endsWith('.xml')).length;
  const smartArtCount = AllPaths.filter((p) => p.startsWith('word/diagrams/') && p.endsWith('.xml')).length;
  const embeddedMediaCount = AllPaths.filter((p) => p.startsWith('word/media/')).length;
  const footnotesCount = Math.max(
    countXmlTags(docXml, 'w:footnoteReference'),
    Math.max(0, countXmlTags(footnotesXml, 'w:footnote') - 2),
  );
  const endnotesCount = Math.max(
    countXmlTags(docXml, 'w:endnoteReference'),
    Math.max(0, countXmlTags(endnotesXml, 'w:endnote') - 2),
  );
  const textBoxesCount = countXmlTags(docXml, 'w:txbxContent');
  const floatingDrawingsCount = countXmlTags(docXml, 'wp:anchor');

  return {
    MJBlocks: mjBlocks,
    DesignConfig: designConfig,
    TrackedChanges: trackedChanges,
    Comments: comments,
    FootnotesCount: footnotesCount,
    EndnotesCount: endnotesCount,
    ChartsCount: chartsCount,
    SmartArtCount: smartArtCount,
    TextBoxesCount: textBoxesCount,
    FloatingDrawingsCount: floatingDrawingsCount,
    EmbeddedMediaCount: embeddedMediaCount,
  };
}

/**
 * Rehydrates exported MJ block placeholder sections (`MJ-BLOCK-REF:<BlockID>`) inside
 * imported Markdown back into canonical `:::mj-block` directives while preserving edits
 * made to surrounding prose in Microsoft Word.
 */
export function RehydrateMjBlocksInMarkdown(
  markdown: string,
  blocks: readonly DocumentBlockSpec[],
): { Markdown: string; RestoredCount: number } {
  if (!blocks.length) {
    return { Markdown: markdown, RestoredCount: 0 };
  }
  const blockById = new Map<string, DocumentBlockSpec>();
  for (const b of blocks) {
    blockById.set(b.BlockID, b);
  }

  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const restoredIds = new Set<string>();
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const unescaped = line.replace(/\\([[\]_*])/g, '$1');
    const markerIdx = unescaped.indexOf(MJ_DOCX_BLOCK_MARKER_PREFIX);
    if (markerIdx >= 0) {
      const afterPrefix = unescaped.slice(markerIdx + MJ_DOCX_BLOCK_MARKER_PREFIX.length);
      const endTokenIdx = findMarkerEnd(afterPrefix);
      const blockId = afterPrefix.slice(0, endTokenIdx).trim();
      const spec = blockById.get(blockId);
      if (spec) {
        restoredIds.add(blockId);
        // Skip the exported placeholder header line and any immediately following exported table/image snapshot
        idx++;
        while (idx < lines.length && lines[idx].trim() === '') {
          idx++;
        }
        // Skip exported image placeholder if present
        if (idx < lines.length && lines[idx].trim().startsWith('![')) {
          idx++;
          while (idx < lines.length && lines[idx].trim() === '') {
            idx++;
          }
        }
        // Skip exported markdown table representing the block's static snapshot rows
        if (idx < lines.length && lines[idx].trim().startsWith('|')) {
          while (idx < lines.length && lines[idx].trim().startsWith('|')) {
            idx++;
          }
        }
        out.push(':::mj-block');
        out.push(JSON.stringify(spec, null, 2));
        out.push(':::');
        out.push('');
        continue;
      }
    }
    out.push(line);
    idx++;
  }

  return {
    Markdown: out.join('\n').trim(),
    RestoredCount: restoredIds.size,
  };
}

function findMarkerEnd(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ']' || ch === ')' || ch === ' ' || ch === '\t' || ch === '*') {
      return i;
    }
  }
  return text.length;
}
