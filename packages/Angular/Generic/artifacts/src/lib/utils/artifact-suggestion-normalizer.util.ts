import { SafeJSONParse } from '@memberjunction/global';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import type { DocumentSuggestionItem } from '../services/document-collaboration.service';

/**
 * Canonical suggestion domains supported across Docs, Sheets, and Slides (`NW-3`).
 */
export type ArtifactSuggestionDomain = 'document' | 'spreadsheet' | 'slides';

/**
 * Canonical review status values persisted in `Configuration.suggestions` and `Y.Map('suggestions')`.
 */
export type ArtifactSuggestionStatus = 'Pending' | 'Accepted' | 'Rejected';

/**
 * Canonical suggestion target anchor aligned with `@memberjunction/ng-artifacts` selection/anchor contracts.
 */
export interface ArtifactSuggestionAnchor {
  domain?: ArtifactSuggestionDomain;
  blockId?: string;
  heading?: string;
  quote?: string;
  sheet?: string;
  sheetId?: string;
  range?: string;
  cellAddress?: string;
  slideId?: string;
  slideNumber?: number;
  elementId?: string;
  regionId?: string;
}

/**
 * Canonical suggestion payload persisted in `MJArtifactVersionEntity.Configuration.suggestions` and
 * `Y.Map('suggestions')`, carrying viewer-compat aliases so Docs, Sheets, Slides, server Yjs bridge,
 * and AI agent actions read/write one interoperable structure (`NW-3`).
 */
export interface ArtifactSuggestionRecord {
  SuggestionID: string;
  Domain: ArtifactSuggestionDomain;
  ArtifactID?: string;
  Anchor: ArtifactSuggestionAnchor;
  OriginalSlice: string;
  ProposedReplacement: string;
  Rationale: string;
  AuthorName: string;
  AuthorUserID?: string;
  CreatedAt: string;
  Status: ArtifactSuggestionStatus | 'pending' | 'accepted' | 'rejected';
  ReviewedByUserID?: string;
  ReviewedAt?: string;
  ReviewComment?: string;

  // Docs compatibility aliases
  BlockID?: string;
  OriginalMarkdown?: string;
  ProposedMarkdown?: string;

  // Sheets compatibility aliases
  SheetID?: string;
  Range?: string;
  ProposedValue?: string;
  CurrentDisplayValue?: string;
  IsAgent?: boolean;

  // Slides compatibility aliases
  SlideID?: string;
  RegionID?: string;
  Field?: 'region-markdown' | 'slide-title' | 'slide-subtitle';
  AuthorID?: string;
  OriginalText?: string;
  SuggestedText?: string;
}

/**
 * Strongly-typed wrapper for parsed `MJArtifactVersionEntity.Configuration` objects carrying `suggestions`.
 */
export interface ArtifactConfigurationWithSuggestions {
  suggestions?: ArtifactSuggestionRecord[];
  PreviewSnapshot?: object;
  ThumbnailDataUrl?: string | null;
}

/**
 * Minimal Sheets UI suggestion shape kept in sync with {@link SpreadsheetCellSuggestionSpec}.
 */
export interface NormalizedSpreadsheetSuggestion {
  SuggestionID: string;
  SheetID: string;
  Range: string;
  ProposedValue: string;
  CurrentDisplayValue: string;
  Rationale: string;
  AuthorName: string;
  AuthorUserID: string;
  IsAgent: boolean;
  CreatedAt: string;
  Status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Minimal Slides UI suggestion shape kept in sync with {@link SlideDeckSuggestion}.
 */
export interface NormalizedSlideSuggestion {
  SuggestionID: string;
  SlideID: string;
  SlideNumber?: number;
  RegionID?: string;
  Field: 'region-markdown' | 'slide-title' | 'slide-subtitle';
  AuthorID: string;
  AuthorName: string;
  OriginalText: string;
  SuggestedText: string;
  Rationale?: string;
  Status: ArtifactSuggestionStatus;
  CreatedAt: string;
}

/**
 * Normalizes any lowercase/PascalCase status string to canonical {@link ArtifactSuggestionStatus}.
 */
export function NormalizeArtifactSuggestionStatus(
  rawStatus: string | undefined | null,
): ArtifactSuggestionStatus {
  const lowered = (rawStatus ?? '').trim().toLowerCase();
  if (lowered === 'accepted') {
    return 'Accepted';
  }
  if (lowered === 'rejected') {
    return 'Rejected';
  }
  return 'Pending';
}

/**
 * Parses `suggestions` from an `MJArtifactVersionEntity.Configuration` JSON string, filtering to `domain` when provided.
 */
export function ParseSuggestionsFromConfiguration(
  configurationJson: string | null | undefined,
  domain?: ArtifactSuggestionDomain,
): ArtifactSuggestionRecord[] {
  if (!configurationJson || typeof configurationJson !== 'string' || !configurationJson.trim()) {
    return [];
  }
  const parsed = SafeJSONParse<ArtifactConfigurationWithSuggestions>(configurationJson);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    return [];
  }
  return parsed.suggestions.filter((item): item is ArtifactSuggestionRecord => {
    if (!item || typeof item !== 'object' || typeof item.SuggestionID !== 'string') {
      return false;
    }
    if (!domain) {
      return true;
    }
    return inferSuggestionDomain(item) === domain;
  });
}

/**
 * Updates `Configuration.suggestions` in `configurationJson` while preserving all unrelated configuration fields.
 */
export function MergeConfigurationSuggestions(
  configurationJson: string | null | undefined,
  records: ReadonlyArray<ArtifactSuggestionRecord>,
): string {
  const baseObj =
    configurationJson && configurationJson.trim()
      ? SafeJSONParse<ArtifactConfigurationWithSuggestions>(configurationJson)
      : null;
  const nextObj: ArtifactConfigurationWithSuggestions =
    baseObj && typeof baseObj === 'object' ? { ...baseObj } : {};
  nextObj.suggestions = [...records];
  return JSON.stringify(nextObj);
}

/**
 * Reads `MJArtifactVersionEntity.Configuration` without throwing if an uninitialized `BaseEntity`
 * test stub lacks field metadata (`Object.create(MJArtifactVersionEntity.prototype)`).
 */
export function ReadArtifactVersionConfigurationSafe(
  version: MJArtifactVersionEntity | null | undefined,
): string | null {
  if (!version) {
    return null;
  }
  try {
    return version.Configuration ?? null;
  } catch {
    return null;
  }
}

/**
 * Merges `record` into `version.Configuration.suggestions` while tolerating uninitialized or
 * non-writable property descriptors on partial entity test stubs.
 */
export function UpsertArtifactSuggestionInVersionConfiguration(
  version: MJArtifactVersionEntity | null | undefined,
  record: ArtifactSuggestionRecord,
): void {
  if (!version) {
    return;
  }
  const currentConfig = ReadArtifactVersionConfigurationSafe(version);
  const existing = ParseSuggestionsFromConfiguration(currentConfig);
  const nextList = existing.filter((s) => s.SuggestionID !== record.SuggestionID);
  nextList.push(record);
  const merged = MergeConfigurationSuggestions(currentConfig, nextList);
  const ownDesc = Object.getOwnPropertyDescriptor(version, 'Configuration');
  if (ownDesc && !ownDesc.writable && !ownDesc.set) {
    return;
  }
  try {
    version.Configuration = merged;
  } catch {
    // Uninitialized BaseEntity setter on partial test stubs; runtime session state stays updated.
  }
}

/**
 * Normalizes a raw `Y.Map('suggestions')` or `Configuration.suggestions` entry into a {@link DocumentSuggestionItem}.
 */
export function NormalizeDocumentSuggestion(
  rawInput: string | ArtifactSuggestionRecord | DocumentSuggestionItem,
  fallbackId = '',
): DocumentSuggestionItem | null {
  const parsed =
    typeof rawInput === 'string'
      ? SafeJSONParse<ArtifactSuggestionRecord>(rawInput)
      : (rawInput as ArtifactSuggestionRecord | null);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  if (parsed.Domain && parsed.Domain !== 'document') {
    return null;
  }
  const suggestionId = (parsed.SuggestionID || fallbackId).trim();
  const blockId = (parsed.BlockID ?? parsed.Anchor?.blockId ?? '').trim();
  const heading = parsed.Anchor?.heading?.trim() || undefined;
  const quote = parsed.Anchor?.quote?.trim() || undefined;
  const originalMarkdown = parsed.OriginalMarkdown ?? parsed.OriginalSlice;
  const proposedMarkdown = parsed.ProposedMarkdown ?? parsed.ProposedReplacement;
  const hasFallbackAnchor =
    Boolean(heading) ||
    Boolean(quote) ||
    (typeof originalMarkdown === 'string' && originalMarkdown.trim().length > 0);
  if (
    !suggestionId ||
    (!blockId && !hasFallbackAnchor) ||
    typeof originalMarkdown !== 'string' ||
    typeof proposedMarkdown !== 'string'
  ) {
    return null;
  }
  return {
    SuggestionID: suggestionId,
    BlockID: blockId,
    Heading: heading,
    Quote: quote,
    AuthorName: parsed.AuthorName || 'Collaborator',
    AuthorUserID: parsed.AuthorUserID,
    CreatedAt: parsed.CreatedAt || new Date().toISOString(),
    OriginalMarkdown: originalMarkdown,
    ProposedMarkdown: proposedMarkdown,
    Rationale: parsed.Rationale || '',
    Status: NormalizeArtifactSuggestionStatus(parsed.Status),
  };
}

/**
 * Serializes a Docs UI {@link DocumentSuggestionItem} as a canonical {@link ArtifactSuggestionRecord}.
 */
export function BuildCanonicalDocumentSuggestionRecord(
  item: DocumentSuggestionItem,
  artifactId?: string,
  extra?: { Heading?: string; ReviewedByUserID?: string; ReviewedAt?: string },
): ArtifactSuggestionRecord {
  return {
    SuggestionID: item.SuggestionID,
    Domain: 'document',
    ArtifactID: artifactId,
    Anchor: {
      domain: 'document',
      blockId: item.BlockID,
      heading: extra?.Heading ?? item.Heading,
      quote: item.Quote,
    },
    OriginalSlice: item.OriginalMarkdown,
    ProposedReplacement: item.ProposedMarkdown,
    Rationale: item.Rationale,
    AuthorName: item.AuthorName,
    AuthorUserID: item.AuthorUserID,
    CreatedAt: item.CreatedAt,
    Status: NormalizeArtifactSuggestionStatus(item.Status),
    ReviewedByUserID: extra?.ReviewedByUserID,
    ReviewedAt: extra?.ReviewedAt,
    BlockID: item.BlockID,
    OriginalMarkdown: item.OriginalMarkdown,
    ProposedMarkdown: item.ProposedMarkdown,
  };
}

/**
 * Normalizes a raw `Y.Map('suggestions')` or `Configuration.suggestions` entry into Sheets UI shape.
 */
export function NormalizeSpreadsheetSuggestion(
  rawInput: string | ArtifactSuggestionRecord,
  fallbackId = '',
): NormalizedSpreadsheetSuggestion | null {
  const parsed =
    typeof rawInput === 'string'
      ? SafeJSONParse<ArtifactSuggestionRecord>(rawInput)
      : (rawInput as ArtifactSuggestionRecord | null);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  if (parsed.Domain && parsed.Domain !== 'spreadsheet') {
    return null;
  }
  const suggestionId = (parsed.SuggestionID || fallbackId).trim();
  const sheetId = (parsed.SheetID ?? parsed.Anchor?.sheetId ?? parsed.Anchor?.sheet ?? '').trim();
  const range = (parsed.Range ?? parsed.Anchor?.range ?? parsed.Anchor?.cellAddress ?? '').trim();
  const proposedValue = parsed.ProposedValue ?? parsed.ProposedReplacement;
  if (!suggestionId || !range || typeof proposedValue !== 'string') {
    return null;
  }
  const status = NormalizeArtifactSuggestionStatus(parsed.Status).toLowerCase() as
    | 'pending'
    | 'accepted'
    | 'rejected';
  return {
    SuggestionID: suggestionId,
    SheetID: sheetId,
    Range: range,
    ProposedValue: proposedValue,
    CurrentDisplayValue: parsed.CurrentDisplayValue ?? parsed.OriginalSlice ?? '',
    Rationale: parsed.Rationale ?? '',
    AuthorName: parsed.AuthorName || 'Collaborator',
    AuthorUserID: parsed.AuthorUserID || 'anonymous',
    IsAgent: Boolean(parsed.IsAgent),
    CreatedAt: parsed.CreatedAt || new Date().toISOString(),
    Status: status,
  };
}

/**
 * Serializes a Sheets UI suggestion into a canonical {@link ArtifactSuggestionRecord}.
 */
export function BuildCanonicalSpreadsheetSuggestionRecord(
  item: NormalizedSpreadsheetSuggestion,
  sheetName?: string,
  artifactId?: string,
  extra?: { ReviewedByUserID?: string; ReviewedAt?: string },
): ArtifactSuggestionRecord {
  return {
    SuggestionID: item.SuggestionID,
    Domain: 'spreadsheet',
    ArtifactID: artifactId,
    Anchor: {
      domain: 'spreadsheet',
      sheet: sheetName,
      sheetId: item.SheetID,
      range: item.Range,
      cellAddress: item.Range,
    },
    OriginalSlice: item.CurrentDisplayValue,
    ProposedReplacement: item.ProposedValue,
    Rationale: item.Rationale,
    AuthorName: item.AuthorName,
    AuthorUserID: item.AuthorUserID,
    CreatedAt: item.CreatedAt,
    Status: NormalizeArtifactSuggestionStatus(item.Status),
    ReviewedByUserID: extra?.ReviewedByUserID,
    ReviewedAt: extra?.ReviewedAt,
    SheetID: item.SheetID,
    Range: item.Range,
    ProposedValue: item.ProposedValue,
    CurrentDisplayValue: item.CurrentDisplayValue,
    IsAgent: item.IsAgent,
  };
}

/**
 * Normalizes a raw `Y.Map('suggestions')` or `Configuration.suggestions` entry into Slides UI shape.
 */
export function NormalizeSlideSuggestion(
  rawInput: string | ArtifactSuggestionRecord,
  fallbackId = '',
): NormalizedSlideSuggestion | null {
  const parsed =
    typeof rawInput === 'string'
      ? SafeJSONParse<ArtifactSuggestionRecord>(rawInput)
      : (rawInput as ArtifactSuggestionRecord | null);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  if (parsed.Domain && parsed.Domain !== 'slides') {
    return null;
  }
  const suggestionId = (parsed.SuggestionID || fallbackId).trim();
  const slideId = (parsed.SlideID ?? parsed.Anchor?.slideId ?? '').trim();
  const slideNumber =
    typeof parsed.Anchor?.slideNumber === 'number' && Number.isFinite(parsed.Anchor.slideNumber)
      ? parsed.Anchor.slideNumber
      : undefined;
  const suggestedText = parsed.SuggestedText ?? parsed.ProposedReplacement;
  if (!suggestionId || (!slideId && slideNumber === undefined) || typeof suggestedText !== 'string') {
    return null;
  }
  const regionId = parsed.RegionID ?? parsed.Anchor?.regionId ?? parsed.Anchor?.elementId;
  return {
    SuggestionID: suggestionId,
    SlideID: slideId,
    SlideNumber: slideNumber,
    RegionID: regionId,
    Field: parsed.Field ?? 'region-markdown',
    AuthorID: parsed.AuthorID ?? parsed.AuthorUserID ?? 'anonymous',
    AuthorName: parsed.AuthorName || 'Collaborator',
    OriginalText: parsed.OriginalText ?? parsed.OriginalSlice ?? '',
    SuggestedText: suggestedText,
    Rationale: parsed.Rationale ?? '',
    Status: NormalizeArtifactSuggestionStatus(parsed.Status),
    CreatedAt: parsed.CreatedAt || new Date().toISOString(),
  };
}

/**
 * Serializes a Slides UI suggestion into a canonical {@link ArtifactSuggestionRecord}.
 */
export function BuildCanonicalSlideSuggestionRecord(
  item: NormalizedSlideSuggestion,
  slideNumber?: number,
  artifactId?: string,
  extra?: { ReviewedByUserID?: string; ReviewedAt?: string },
): ArtifactSuggestionRecord {
  return {
    SuggestionID: item.SuggestionID,
    Domain: 'slides',
    ArtifactID: artifactId,
    Anchor: {
      domain: 'slides',
      slideId: item.SlideID,
      slideNumber: slideNumber ?? item.SlideNumber,
      regionId: item.RegionID,
      elementId: item.RegionID,
    },
    OriginalSlice: item.OriginalText,
    ProposedReplacement: item.SuggestedText,
    Rationale: item.Rationale ?? '',
    AuthorName: item.AuthorName,
    AuthorUserID: item.AuthorID,
    CreatedAt: item.CreatedAt,
    Status: NormalizeArtifactSuggestionStatus(item.Status),
    ReviewedByUserID: extra?.ReviewedByUserID,
    ReviewedAt: extra?.ReviewedAt,
    SlideID: item.SlideID,
    RegionID: item.RegionID,
    Field: item.Field,
    AuthorID: item.AuthorID,
    OriginalText: item.OriginalText,
    SuggestedText: item.SuggestedText,
  };
}

function inferSuggestionDomain(record: ArtifactSuggestionRecord): ArtifactSuggestionDomain {
  if (record.Domain === 'document' || record.Domain === 'spreadsheet' || record.Domain === 'slides') {
    return record.Domain;
  }
  if (record.Anchor?.domain) {
    return record.Anchor.domain;
  }
  if (
    record.SlideID ||
    record.Anchor?.slideId ||
    record.Anchor?.slideNumber !== undefined ||
    record.SuggestedText !== undefined
  ) {
    return 'slides';
  }
  if (record.Range || record.SheetID || record.Anchor?.range || record.ProposedValue !== undefined) {
    return 'spreadsheet';
  }
  return 'document';
}
