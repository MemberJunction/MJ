/**
 * @fileoverview Pure helpers for durable document record-mention links (`@{"_mode":"mention","type":"record",...}`).
 *
 * Links are stored by record ID with a display label (never resolved by name on the server) using
 * {@link ConversationUtility.CreateRecordLink} and parsed with {@link ConversationUtility.ParseSpecialContent}.
 * Chips always render the stored label and never fetch the target's current title for a viewer who
 * cannot open it.
 */

import { ConversationUtility, type MentionContent, type SpecialContentToken } from '@memberjunction/ai-core-plus';
import { CompositeKey, EntityInfo, IMetadataProvider, LogError, RunView, type RunViewParams, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { EscapeHtml } from '../components/previews/office-preview.logic';

const ARTIFACTS_ENTITY = 'MJ: Artifacts';
/** Max keys per single entity batch query to stay well below SQL IN / OR expression limits. */
const MAX_KEYS_PER_BATCH_QUERY = 200;
/** Safe fragment URL prefix emitted in Markdown Preview mode for readable doc-link chips (`[EnableHtml]="false"`). */
export const DOC_LINK_PREVIEW_HREF_READABLE = '#mj-doc-link-readable/';
/** Safe fragment URL prefix emitted in Markdown Preview mode for unreadable/checking doc-link chips (`[EnableHtml]="false"`). */
export const DOC_LINK_PREVIEW_HREF_UNREADABLE = '#mj-doc-link-unreadable/';

/** Resolved viewer access state for a durable record link chip. */
export type DocRecordLinkAccessState = 'readable' | 'unreadable' | 'checking';

/** A parsed record-mention token extracted from document markdown. */
export interface ParsedDocRecordLink {
  Token: SpecialContentToken;
  EntityName: string;
  Label: string;
  Content: MentionContent;
  Keys: Record<string, string | number>;
  KeySignature: string;
  RawToken: string;
}

/** Active `[[...` trigger detected before the caret in edit/suggest mode. */
export interface ActiveDocLinkTrigger {
  TriggerStart: number;
  Query: string;
}

/** Stable deduplication / cache key for a parsed record link's target entity and PK values. */
export function BuildDocRecordLinkKeySignature(entityName: string, keys: Record<string, string | number>): string {
  const normalizedEntity = entityName.trim().toLowerCase();
  const sortedKeys = Object.keys(keys)
    .sort()
    .map((k) => `${k}=${String(keys[k]).trim().toLowerCase()}`)
    .join('&');
  return `${normalizedEntity}|${sortedKeys}`;
}

/**
 * Finds byte/character ranges of Markdown fenced code blocks (`` ``` `` / `~~~`) and CommonMark
 * inline backtick code spans in linear O(N) time without backtracking regexes.
 */
function findMarkdownCodeRanges(text: string): Array<{ Start: number; End: number }> {
  const ranges: Array<{ Start: number; End: number }> = [];
  const len = text.length;
  let i = 0;
  let atLineStart = true;

  while (i < len) {
    if (atLineStart) {
      let indent = i;
      while (indent < len && indent - i < 3 && text[indent] === ' ') {
        indent++;
      }
      const fenceChar = text[indent];
      if (fenceChar === '`' || fenceChar === '~') {
        let fenceLen = 0;
        while (indent + fenceLen < len && text[indent + fenceLen] === fenceChar) {
          fenceLen++;
        }
        if (fenceLen >= 3) {
          const fenceStart = i;
          // Move past the opening fence line
          let lineEnd = text.indexOf('\n', indent + fenceLen);
          if (lineEnd === -1) {
            ranges.push({ Start: fenceStart, End: len });
            break;
          }
          let scan = lineEnd + 1;
          let closed = false;
          while (scan < len) {
            let closeIndent = scan;
            while (closeIndent < len && closeIndent - scan < 3 && text[closeIndent] === ' ') {
              closeIndent++;
            }
            let closeLen = 0;
            while (closeIndent + closeLen < len && text[closeIndent + closeLen] === fenceChar) {
              closeLen++;
            }
            const nextNl = text.indexOf('\n', scan);
            const currLineEnd = nextNl === -1 ? len : nextNl;
            if (closeLen >= fenceLen) {
              const tail = text.slice(closeIndent + closeLen, currLineEnd).trim();
              if (tail.length === 0) {
                const blockEnd = nextNl === -1 ? len : nextNl + 1;
                ranges.push({ Start: fenceStart, End: blockEnd });
                i = blockEnd;
                atLineStart = true;
                closed = true;
                break;
              }
            }
            if (nextNl === -1) {
              break;
            }
            scan = nextNl + 1;
          }
          if (!closed) {
            ranges.push({ Start: fenceStart, End: len });
            break;
          }
          continue;
        }
      }
    }

    const ch = text[i];
    if (ch === '\\' && i + 1 < len) {
      atLineStart = false;
      i += 2;
      continue;
    }
    if (ch === '`') {
      let tickLen = 0;
      while (i + tickLen < len && text[i + tickLen] === '`') {
        tickLen++;
      }
      const spanStart = i;
      let scan = i + tickLen;
      let foundEnd = -1;
      while (scan < len) {
        if (text[scan] === '`') {
          let closeLen = 0;
          while (scan + closeLen < len && text[scan + closeLen] === '`') {
            closeLen++;
          }
          if (closeLen === tickLen) {
            foundEnd = scan + closeLen;
            break;
          }
          scan += closeLen;
          continue;
        }
        scan++;
      }
      if (foundEnd !== -1) {
        ranges.push({ Start: spanStart, End: foundEnd });
        i = foundEnd;
        atLineStart = false;
        continue;
      }
      i += tickLen;
      atLineStart = false;
      continue;
    }

    atLineStart = ch === '\n';
    i++;
  }

  return ranges;
}

function isInsideRanges(index: number, ranges: ReadonlyArray<{ Start: number; End: number }>): boolean {
  for (const r of ranges) {
    if (index >= r.Start && index < r.End) {
      return true;
    }
    if (r.Start > index) {
      break;
    }
  }
  return false;
}

/**
 * Extracts all durable record-mention tokens (`@{"_mode":"mention","type":"record",...}`) from text
 * in order of appearance, reusing {@link ConversationUtility.ParseSpecialContent}.
 * Skips tokens inside Markdown code spans and fenced code blocks by default (`SkipCode: true`).
 */
export function ExtractDocRecordLinks(
  text: string,
  options?: { SkipCode?: boolean },
): ParsedDocRecordLink[] {
  if (!text || !text.includes('@{')) {
    return [];
  }
  const skipCode = options?.SkipCode ?? true;
  const codeRanges = skipCode && (text.includes('`') || text.includes('~')) ? findMarkdownCodeRanges(text) : [];
  const tokens = ConversationUtility.ParseSpecialContent(text);
  const out: ParsedDocRecordLink[] = [];
  for (const token of tokens) {
    if (codeRanges.length > 0 && isInsideRanges(token.startIndex, codeRanges)) {
      continue;
    }
    if (token.mode !== 'mention') {
      continue;
    }
    const content = token.content as MentionContent;
    if (content.type !== 'record' || !content.entityName) {
      continue;
    }
    const entityName = content.entityName.trim();
    if (!entityName) {
      continue;
    }
    const keys = ConversationUtility.RecordLinkKeyMap(content);
    const label = (content.name ?? '').trim() || entityName;
    out.push({
      Token: token,
      EntityName: entityName,
      Label: label,
      Content: content,
      Keys: keys,
      KeySignature: BuildDocRecordLinkKeySignature(entityName, keys),
      RawToken: token.originalText,
    });
  }
  return out;
}

/** Returns true when `text` contains at least one valid durable record-mention token. */
export function HasDocRecordLinks(text: string): boolean {
  return ExtractDocRecordLinks(text).length > 0;
}

/**
 * Resolves a parsed record link to its `EntityInfo`, `CompositeKey`, and compact URL segment
 * using entity metadata (`EntityByName` + `CompositeKeyFromRecordLink`).
 */
export function ResolveDocRecordLinkCompositeKey(
  link: Pick<ParsedDocRecordLink, 'EntityName' | 'Content'>,
  provider: IMetadataProvider | null | undefined,
): { Entity: EntityInfo; Key: CompositeKey; CompactKey: string } | null {
  if (!provider) {
    return null;
  }
  const entity = provider.EntityByName(link.EntityName);
  if (!entity) {
    return null;
  }
  const pkNames = entity.PrimaryKeys.map((pk) => pk.Name);
  const key = ConversationUtility.CompositeKeyFromRecordLink(link.Content, pkNames);
  if (!key) {
    return null;
  }
  return {
    Entity: entity,
    Key: key,
    CompactKey: key.ToCompactURLSegment(),
  };
}

interface ResolvedBatchEntry {
  Link: ParsedDocRecordLink;
  Entity: EntityInfo;
  Key: CompositeKey;
  CompactKey: string;
}

interface NonArtifactBatchQuery {
  Entity: EntityInfo;
  Entries: ResolvedBatchEntry[];
  Params: RunViewParams;
}

/** Formats a single-column primary-key value safely for an `IN (...)` predicate. */
function formatSinglePkSqlLiteral(value: unknown, needsQuotes: boolean | undefined): string {
  if (needsQuotes === false) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return value.trim();
    }
  }
  return `'${EscapeSQLString(String(value))}'`;
}

/** Builds a single batched SQL `ExtraFilter` covering all keys in `entries` for one entity. */
function buildBatchEntityWhereClause(entity: EntityInfo, entries: ReadonlyArray<ResolvedBatchEntry>): string {
  if (entries.length === 1) {
    return entries[0].Key.ToWhereClause();
  }
  if (entity.PrimaryKeys.length === 1) {
    const pkField = entity.FirstPrimaryKey; // first-pk-ok: guarded by PrimaryKeys.length === 1; composite PKs use OR of ToWhereClause() below
    const pkName = pkField.Name;
    const literals = Array.from(
      new Set(
        entries
          .map((e) => e.Key.GetValueByFieldName(pkName))
          .filter((v) => v !== null && v !== undefined)
          .map((v) => formatSinglePkSqlLiteral(v, pkField.NeedsQuotes)),
      ),
    );
    if (literals.length > 0) {
      return `[${pkName}] IN (${literals.join(', ')})`;
    }
  }
  return `(${entries.map((e) => `(${e.Key.ToWhereClause()})`).join(' OR ')})`;
}

/**
 * Checks whether `user` can open each target in `links` in a batched, DB-optimal pass:
 * - For `MJ: Artifacts`: resolves via {@link ArtifactPermissionEngine.ResolvePermissions} with a
 *   shared memo across the batch (never querying artifact names).
 * - For all other entities: checks entity `CanRead`, groups readable entities' links by entity,
 *   and executes **one `RunView` per entity** (all sent together in a single `RunViews` batch when
 *   multiple entities are present), projecting **only** primary-key columns (`Fields: pkNames`) so
 *   current record titles/fields can never leak.
 *
 * Fails closed (`'unreadable'`) on missing provider/user, unknown entity, incomplete PK, or error.
 */
export async function CheckDocRecordLinksAccessBatch(
  links: ReadonlyArray<ParsedDocRecordLink>,
  provider: IMetadataProvider | null | undefined,
  user: UserInfo | null | undefined,
): Promise<Map<string, 'readable' | 'unreadable'>> {
  const results = new Map<string, 'readable' | 'unreadable'>();
  const uniqueLinks = new Map<string, ParsedDocRecordLink>();
  for (const link of links) {
    if (!uniqueLinks.has(link.KeySignature)) {
      uniqueLinks.set(link.KeySignature, link);
      results.set(link.KeySignature, 'unreadable');
    }
  }
  if (uniqueLinks.size === 0 || !provider || !user) {
    return results;
  }

  const artifactEntries: Array<{ Link: ParsedDocRecordLink; ArtifactID: string }> = [];
  const entityGroups = new Map<string, { Entity: EntityInfo; Entries: ResolvedBatchEntry[] }>();

  for (const link of uniqueLinks.values()) {
    const resolved = ResolveDocRecordLinkCompositeKey(link, provider);
    if (!resolved) {
      continue;
    }
    if (resolved.Entity.Name.trim().toLowerCase() === ARTIFACTS_ENTITY.toLowerCase()) {
      const artifactId = resolved.Key.GetValueByFieldName('ID');
      if (artifactId) {
        artifactEntries.push({ Link: link, ArtifactID: String(artifactId) });
      }
      continue;
    }
    const entityPerms = resolved.Entity.GetUserPermisions(user);
    if (!entityPerms?.CanRead) {
      continue;
    }
    const groupKey = resolved.Entity.Name.trim().toLowerCase();
    let group = entityGroups.get(groupKey);
    if (!group) {
      group = { Entity: resolved.Entity, Entries: [] };
      entityGroups.set(groupKey, group);
    }
    group.Entries.push({
      Link: link,
      Entity: resolved.Entity,
      Key: resolved.Key,
      CompactKey: resolved.CompactKey,
    });
  }

  const tasks: Promise<void>[] = [];

  if (artifactEntries.length > 0) {
    tasks.push(resolveArtifactBatchAccess(artifactEntries, provider, user, results));
  }

  if (entityGroups.size > 0) {
    tasks.push(resolveNonArtifactBatchAccess(Array.from(entityGroups.values()), provider, user, results));
  }

  await Promise.all(tasks);
  return results;
}

async function resolveArtifactBatchAccess(
  entries: ReadonlyArray<{ Link: ParsedDocRecordLink; ArtifactID: string }>,
  provider: IMetadataProvider,
  user: UserInfo,
  results: Map<string, 'readable' | 'unreadable'>,
): Promise<void> {
  try {
    const permsById = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
      provider,
      entries.map((e) => e.ArtifactID),
      user,
    );
    for (const { Link, ArtifactID } of entries) {
      const perms = permsById.get(ArtifactID);
      results.set(Link.KeySignature, perms?.CanRead ? 'readable' : 'unreadable');
    }
  } catch (error: unknown) {
    LogError(
      `DocRecordLink batched artifact access check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    for (const { Link } of entries) {
      results.set(Link.KeySignature, 'unreadable');
    }
  }
}

async function resolveNonArtifactBatchAccess(
  groups: ReadonlyArray<{ Entity: EntityInfo; Entries: ResolvedBatchEntry[] }>,
  provider: IMetadataProvider,
  user: UserInfo,
  results: Map<string, 'readable' | 'unreadable'>,
): Promise<void> {
  const queries: NonArtifactBatchQuery[] = [];
  for (const group of groups) {
    const pkNames = group.Entity.PrimaryKeys.map((pk) => pk.Name);
    if (pkNames.length === 0) {
      continue;
    }
    for (let offset = 0; offset < group.Entries.length; offset += MAX_KEYS_PER_BATCH_QUERY) {
      const chunk = group.Entries.slice(offset, offset + MAX_KEYS_PER_BATCH_QUERY);
      queries.push({
        Entity: group.Entity,
        Entries: chunk,
        Params: {
          EntityName: group.Entity.Name,
          Fields: pkNames,
          ExtraFilter: buildBatchEntityWhereClause(group.Entity, chunk),
          ResultType: 'simple',
          IgnoreMaxRows: true,
          SkipTotalRowCount: true,
        },
      });
    }
  }
  if (queries.length === 0) {
    return;
  }

  try {
    const rv = RunView.FromMetadataProvider(provider);
    const batchResults =
      queries.length === 1
        ? [await rv.RunView<Record<string, unknown>>(queries[0].Params, user)]
        : await rv.RunViews(
            queries.map((q) => q.Params),
            user,
          );

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const res = batchResults[i];
      if (!res?.Success || !Array.isArray(res.Results)) {
        continue;
      }
      const readableCompactKeys = new Set<string>();
      for (const rawRow of res.Results as Record<string, unknown>[]) {
        if (!rawRow || typeof rawRow !== 'object') {
          continue;
        }
        const key = CompositeKey.FromEntityRecord(query.Entity, rawRow);
        const compact = key.ToCompactURLSegment().trim().toLowerCase();
        if (compact) {
          readableCompactKeys.add(compact);
        }
      }
      for (const entry of query.Entries) {
        if (readableCompactKeys.has(entry.CompactKey.trim().toLowerCase())) {
          results.set(entry.Link.KeySignature, 'readable');
        }
      }
    }
  } catch (error: unknown) {
    LogError(
      `DocRecordLink batched access check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Convenience single-link wrapper over {@link CheckDocRecordLinksAccessBatch}.
 */
export async function CheckDocRecordLinkAccess(
  link: ParsedDocRecordLink,
  provider: IMetadataProvider | null | undefined,
  user: UserInfo | null | undefined,
): Promise<'readable' | 'unreadable'> {
  const batch = await CheckDocRecordLinksAccessBatch([link], provider, user);
  return batch.get(link.KeySignature) ?? 'unreadable';
}

/**
 * Replaces every durable record-mention token in `markdown` with its stored display label as plain
 * text (used for Markdown, PDF, and DOCX export; Source mode keeps the raw tokens).
 */
export function StripDocRecordLinksToPlainText(markdown: string): string {
  if (!markdown || !markdown.includes('@{')) {
    return markdown ?? '';
  }
  const links = ExtractDocRecordLinks(markdown);
  if (links.length === 0) {
    return markdown;
  }
  let result = markdown;
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    result = result.slice(0, link.Token.startIndex) + link.Label + result.slice(link.Token.endIndex);
  }
  return result;
}

/**
 * Renders one durable record-mention token as an inline HTML chip using ONLY its stored label.
 *
 * - Readable: clickable (`role="link"`, `tabindex="0"`, `title="Open <label>"`).
 * - Unreadable / checking: greyed, non-clickable (`aria-disabled="true"`, `title="You don't have access"`).
 */
export function RenderDocRecordLinkChipHtml(
  link: ParsedDocRecordLink,
  state: DocRecordLinkAccessState,
  options?: { Editable?: boolean },
): string {
  const isReadable = state === 'readable';
  const escapedLabel = EscapeHtml(link.Label);
  const escapedEntity = EscapeHtml(link.EntityName);
  const escapedKeys = EscapeHtml(JSON.stringify(link.Keys));
  const escapedRaw = EscapeHtml(link.RawToken);
  const isArtifact = link.EntityName.trim().toLowerCase() === ARTIFACTS_ENTITY.toLowerCase();
  const iconClass = isArtifact ? 'fa-solid fa-file-lines' : 'fa-solid fa-up-right-from-square';
  const editableAttr = options?.Editable ? ' contenteditable="false"' : '';

  const stateClass = isReadable ? 'mj-doc-link-chip--readable' : 'mj-doc-link-chip--unreadable';
  const interactionAttrs = isReadable
    ? ` role="link" tabindex="0" title="${EscapeHtml(`Open ${link.Label}`)}" aria-label="${EscapeHtml(`Open ${link.Label}`)}"`
    : ` aria-disabled="true" title="You don&#39;t have access" aria-label="${EscapeHtml(`${link.Label} — You don't have access`)}"`;

  return (
    `<span class="mj-doc-link-chip ${stateClass}" data-doc-record-link="true" data-doc-link-access="${state}"` +
    ` data-doc-link-raw="${escapedRaw}" data-record-entity="${escapedEntity}" data-record-keys="${escapedKeys}"` +
    `${editableAttr}${interactionAttrs}>` +
    `<i class="${iconClass}" aria-hidden="true"></i>` +
    `<span class="mj-doc-link-chip__label">${escapedLabel}</span>` +
    `</span>`
  );
}

/** Escapes Markdown inline formatting characters inside a link label so stored titles render literally. */
function escapeMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/([[\]*_`~<>])/g, '\\$1')
    .replace(/\r?\n/g, ' ');
}

/** Escapes double quotes and backslashes inside a Markdown link title attribute (`"..."`). */
function escapeMarkdownLinkTitle(title: string): string {
  return title
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

/**
 * Replaces every durable record-mention token outside Markdown code spans/fences with a safe
 * Markdown fragment link (`#mj-doc-link-readable/...` or `#mj-doc-link-unreadable/...`) using
 * ONLY the stored label. Keeps `<mj-markdown [EnableHtml]="false">` strictly sanitized so raw HTML
 * injection (`<style>`, `<form>`, `<script>`, tracking `<img>`) can never bypass Angular's sanitizer.
 */
export function ReplaceDocRecordLinksWithPreviewMarkdown(
  markdown: string,
  getState: (link: ParsedDocRecordLink) => DocRecordLinkAccessState,
): string {
  if (!markdown || !markdown.includes('@{')) {
    return markdown ?? '';
  }
  const links = ExtractDocRecordLinks(markdown, { SkipCode: true });
  if (links.length === 0) {
    return markdown;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const link of links) {
    if (link.Token.startIndex > cursor) {
      parts.push(markdown.slice(cursor, link.Token.startIndex));
    }
    const isReadable = getState(link) === 'readable';
    const prefix = isReadable ? DOC_LINK_PREVIEW_HREF_READABLE : DOC_LINK_PREVIEW_HREF_UNREADABLE;
    const href = `${prefix}${encodeURIComponent(link.KeySignature)}`;
    const title = isReadable ? `Open ${link.Label}` : "You don't have access";
    parts.push(`[${escapeMarkdownLinkLabel(link.Label)}](${href} "${escapeMarkdownLinkTitle(title)}")`);
    cursor = link.Token.endIndex;
  }
  if (cursor < markdown.length) {
    parts.push(markdown.slice(cursor));
  }
  return parts.join('');
}

/**
 * Replaces every record-mention token outside Markdown code spans/fences with its rendered HTML chip.
 */
export function ReplaceDocRecordLinksWithChipHtml(
  markdown: string,
  getState: (link: ParsedDocRecordLink) => DocRecordLinkAccessState,
  options?: { Editable?: boolean },
): string {
  if (!markdown || !markdown.includes('@{')) {
    return markdown ?? '';
  }
  const links = ExtractDocRecordLinks(markdown, { SkipCode: true });
  if (links.length === 0) {
    return markdown;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const link of links) {
    if (link.Token.startIndex > cursor) {
      parts.push(markdown.slice(cursor, link.Token.startIndex));
    }
    parts.push(RenderDocRecordLinkChipHtml(link, getState(link), options));
    cursor = link.Token.endIndex;
  }
  if (cursor < markdown.length) {
    parts.push(markdown.slice(cursor));
  }
  return parts.join('');
}

/**
 * Detects an unclosed `[[query` trigger on the current line before the caret.
 * Returns `null` if no open `[[` exists, if it was closed with `]]`, or if a newline separates it.
 */
export function FindActiveDocLinkTrigger(textBeforeCaret: string): ActiveDocLinkTrigger | null {
  if (!textBeforeCaret) {
    return null;
  }
  const lastOpen = textBeforeCaret.lastIndexOf('[[');
  if (lastOpen === -1) {
    return null;
  }
  const afterOpen = textBeforeCaret.slice(lastOpen + 2);
  if (afterOpen.includes(']]') || afterOpen.includes('\n') || afterOpen.includes('[')) {
    return null;
  }
  return {
    TriggerStart: lastOpen,
    Query: afterOpen,
  };
}

/**
 * Replaces the last unclosed `[[<query>` sequence in `markdown` with `token`.
 */
export function ReplaceDocLinkTriggerWithToken(markdown: string, query: string, token: string): string {
  const needle = `[[${query}`;
  const idx = markdown.lastIndexOf(needle);
  if (idx === -1) {
    return markdown ? `${markdown} ${token}` : token;
  }
  const before = markdown.slice(0, idx);
  const after = markdown.slice(idx + needle.length);
  return `${before}${token}${after}`;
}
