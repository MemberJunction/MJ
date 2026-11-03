import { Injectable } from '@angular/core';
import {
  ConversationEngine,
  ConversationScope,
  MJConversationEntity,
  MJConversationDetailEntity,
  MJConversationDetailArtifactEntity,
  MJArtifactVersionEntity,
  MJArtifactEntity
} from '@memberjunction/core-entities';
import { RunView, UserInfo, Metadata, IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

export type ExportFormat = 'json' | 'markdown' | 'html' | 'text';

/**
 * Branding applied to exported files, across EVERY format. HTML gets the full
 * treatment (theme colors, an inlined logo, the title, and a trademark footer);
 * JSON/markdown/text carry the title and trademark (markdown also references the
 * logo). Hosts supply this via `mj-conversation-chat-area`'s `exportBranding`
 * input. Color theming (`brandTokens`) is HTML-only — it has no meaning in the
 * data/plain-text formats.
 */
export interface ExportBranding {
  /**
   * CSS custom-property snapshot emitted as a `:root{}` block in the exported
   * document, so the export's stylesheet (which reads `var(--mj-…, fallback)`)
   * renders in the app's theme. HTML export only. Keys must be valid
   * custom-property names (`--like-this`). Entries are DROPPED when the key is
   * invalid or the value carries declaration-escape / network-call characters
   * (`<>{};@\`, `url(`, `expression(`) — plain colors, `var()`, and
   * `color-mix()` pass. When omitted and `ExportOptions.includeTheme` is true,
   * the current theme is auto-snapshotted from `document.documentElement` (see
   * {@link DEFAULT_EXPORT_THEME_TOKENS}).
   */
  brandTokens?: Record<string, string>;
  /**
   * Logo URL. In HTML it is fetched and inlined as a data URI (so the file stays
   * self-contained) and rendered above the title — requires
   * `ExportOptions.includeCSS`, since it needs its stylesheet rule. In markdown it is
   * referenced by URL. JSON carries it as a string; plain text omits it.
   *
   * If the fetch fails, or the response isn't `content-type: image/*`, the raw URL is
   * emitted instead — so the exported file will reach out to that URL when opened.
   * There is no size or timeout guard on the fetch: a very large logo inflates the
   * export.
   */
  logoUrl?: string;
  /** Overrides the exported document's title (defaults to the conversation name). */
  title?: string;
  /**
   * A short trademark / attribution line (e.g. `© 2026 Acme Association ·
   * Powered by Betty`) rendered at the FOOT of the exported document: a styled HTML
   * footer, a markdown/text trailer, and a field in the JSON `branding` block.
   *
   * In HTML it needs its stylesheet rule, so — like the logo — it is emitted only when
   * `ExportOptions.includeCSS` is true. The markdown/text/JSON trailers have no such
   * dependency and always emit.
   *
   * NOT escaped for markdown: a value containing `_`, `]`, `)`, or a newline can break
   * the surrounding markdown. Supply plain text (HTML and JSON are escaped).
   */
  trademark?: string;
}

export interface ExportOptions {
  includeMessages?: boolean;
  includeMetadata?: boolean;
  prettyPrint?: boolean;
  includeCSS?: boolean;
  /**
   * Emit the current app theme into the HTML export. When true and
   * `branding.brandTokens` is absent, the {@link DEFAULT_EXPORT_THEME_TOKENS}
   * are auto-snapshotted from the live document at export time. Default false —
   * an unthemed export renders exactly as before (the stylesheet's `var()`
   * fallbacks carry the legacy palette).
   *
   * Gates only the TOKEN auto-snapshot: a supplied `branding`'s `logoUrl`,
   * `title`, and `trademark` apply whenever `branding` is present — in HTML AND
   * in the JSON/markdown/text formats. (The export modal passes `branding`
   * through only while its "Include branding" checkbox is on, so in the UI flow
   * everything travels together.)
   */
  includeTheme?: boolean;
  /**
   * Which theme mode the snapshot captures — NOT whichever mode the app happens to be
   * in when the user clicks Export. Defaults to `'light'`: an export taken during a
   * dark session would otherwise bake dark text onto the page's white background and
   * come out unreadable. `'dark'` pairs the dark palette with the dark
   * `--mj-bg-page` the body rule applies, so the file is coherent either way.
   * HTML only — the data formats carry no colors.
   */
  themeMode?: 'light' | 'dark';
  /** Branding (tokens / logo / title) applied to the export — see {@link ExportBranding}. */
  branding?: ExportBranding;
  /**
   * Write the artifacts each message produced under that message: name, type, version, a link
   * when {@link artifactLink} is set, and the stored content as text. File-backed versions
   * (PDF, spreadsheets, images) carry their MIME type instead of content. Default true.
   */
  includeArtifacts?: boolean;
  /**
   * Builds a link that opens an exported artifact in the app. This package has no router, so
   * the host supplies it; without it (or when it returns null) the export carries IDs only.
   * Only `http(s)` links are written.
   */
  artifactLink?: (target: ExportArtifactLinkTarget) => string | null;
}

/** What {@link ExportOptions.artifactLink} receives for each exported artifact. */
export interface ExportArtifactLinkTarget {
  ConversationID: string;
  ArtifactID: string;
  VersionID: string;
  VersionNumber: number;
}

/** One artifact version a message produced, as an export writes it. */
export interface ExportArtifact {
  ArtifactID: string;
  VersionID: string;
  Name: string;
  /** The artifact type's name (e.g. "Component", "Report"). */
  Type: string;
  VersionNumber: number;
  /** Stored text content; null for a file-backed version. */
  Content: string | null;
  MimeType: string | null;
  /** True when the version's content lives in a file rather than as text. */
  FileBacked: boolean;
}

/**
 * Longest artifact content the Markdown, HTML and text formats write; longer content is cut
 * with a marker line. JSON carries content as stored.
 */
export const EXPORT_ARTIFACT_CONTENT_LIMIT = 20000;

/**
 * Tokens captured by the theme auto-snapshot — exactly the custom properties the
 * HTML export's stylesheet consumes. Hosts wanting more control supply their own
 * map via {@link ExportBranding.brandTokens} instead.
 */
export const DEFAULT_EXPORT_THEME_TOKENS: readonly string[] = [
  '--mj-bg-page',
  '--mj-text-primary',
  '--mj-text-secondary',
  '--mj-text-disabled',
  '--mj-border-default',
  '--mj-brand-primary',
  '--mj-brand-accent-subtle',
  '--mj-bg-surface-card',
  '--mj-font-family',
  '--mj-radius-md',
];

/** The conversation and the messages one export writes. */
export interface ExportConversationData {
  conversation: MJConversationEntity;
  details: MJConversationDetailEntity[];
  /**
   * The fork the messages come from, as the header names it (its display name). Absent or null
   * in Main.
   */
  fork?: string | null;
  /**
   * The output artifacts of each message, keyed by lower-cased message ID, in creation order.
   * Absent or empty when the messages produced none.
   */
  artifacts?: Map<string, ExportArtifact[]>;
}

/** Internal: options with defaults applied (branding and the link builder stay optional). */
type ResolvedExportOptions = Required<Omit<ExportOptions, 'branding' | 'artifactLink'>> &
  Pick<ExportOptions, 'branding' | 'artifactLink'>;

/** The junction columns the export reads. */
type ExportArtifactLinkRow = Pick<MJConversationDetailArtifactEntity, 'ConversationDetailID' | 'ArtifactVersionID'>;
/** The version columns the export reads. */
type ExportArtifactVersionRow = Pick<
  MJArtifactVersionEntity,
  'ID' | 'ArtifactID' | 'VersionNumber' | 'Name' | 'Content' | 'FileID' | 'MimeType'
>;
/** The artifact columns the export reads. */
type ExportArtifactRow = Pick<MJArtifactEntity, 'ID' | 'Name' | 'Type'>;

/** Internal: the theme pieces resolved once per HTML export. */
interface ResolvedExportTheme {
  /** `<style>:root{…}</style>` block (empty string when no tokens resolved). */
  rootBlock: string;
  /** Inlined logo (data URI, or the raw URL on fetch failure); null = no logo. */
  logoDataUri: string | null;
  /** Document-title override; null = use the conversation name. */
  title: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private _provider: IMetadataProvider | null = null;

  /**
   * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
   */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  /**
   * Exports the messages of one scope of a conversation (Main, or one fork's path) and
   * downloads the file. In a fork the export header names the fork.
   * @throws when the scope belongs to another conversation, or the conversation is not found.
   */
  async ExportConversation(
    conversationId: string,
    scope: ConversationScope,
    format: ExportFormat,
    currentUser: UserInfo,
    options: ExportOptions = {}
  ): Promise<void> {
    const conversation = await this.loadConversationData(conversationId, scope, currentUser, options.includeArtifacts ?? true);
    const { content, filename, mimeType } = await this.BuildExportContent(conversation, format, options);
    this.downloadFile(content, filename, mimeType);
  }

  /**
   * @deprecated Use {@link ExportConversation}. Without `scope`, exports Main.
   */
  async exportConversation(
    conversationId: string,
    format: ExportFormat,
    currentUser: UserInfo,
    options: ExportOptions = {},
    scope?: ConversationScope
  ): Promise<void> {
    const resolved = scope ?? ConversationEngine.TrunkScope(conversationId);
    return this.ExportConversation(conversationId, resolved, format, currentUser, options);
  }

  /**
   * Build the export document for already-loaded conversation data — the
   * download-free seam of {@link ExportConversation}. Async because HTML-format
   * branding may inline a logo. Exposed publicly so hosts (and tests) can build
   * export content without triggering a browser download.
   */
  public async BuildExportContent(
    data: ExportConversationData,
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<{ content: string; filename: string; mimeType: string }> {
    const exportOptions: ResolvedExportOptions = {
      includeMessages: options.includeMessages ?? true,
      includeMetadata: options.includeMetadata ?? true,
      prettyPrint: options.prettyPrint ?? true,
      includeCSS: options.includeCSS ?? true,
      includeTheme: options.includeTheme ?? false,
      themeMode: options.themeMode ?? 'light',
      includeArtifacts: options.includeArtifacts ?? true,
      branding: options.branding,
      artifactLink: options.artifactLink
    };
    const baseName = `conversation-${data.conversation.Name}-${this.getTimestamp()}`;

    switch (format) {
      case 'json':
        return { content: this.exportAsJSON(data, exportOptions), filename: `${baseName}.json`, mimeType: 'application/json' };
      case 'markdown':
        return { content: this.exportAsMarkdown(data, exportOptions), filename: `${baseName}.md`, mimeType: 'text/markdown' };
      case 'html':
        return {
          content: this.exportAsHTML(data, exportOptions, await this.resolveTheme(exportOptions)),
          filename: `${baseName}.html`,
          mimeType: 'text/html'
        };
      case 'text':
        return { content: this.exportAsText(data, exportOptions), filename: `${baseName}.txt`, mimeType: 'text/plain' };
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Snapshot the given theme tokens from the live document. Empty/unset tokens are
   * skipped.
   *
   * `mode` captures a SPECIFIC palette rather than whatever the app is rendering right
   * now. Without it, exporting from a dark session bakes dark text onto the export's
   * white page and the file is unreadable. When the requested mode isn't the active one,
   * `data-theme` is flipped on `documentElement`, read, and restored — all synchronous
   * within one task, so the browser never paints the intermediate state. Omit `mode`
   * to read the live values as-is.
   */
  public SnapshotBrandTokens(
    tokens: readonly string[] = DEFAULT_EXPORT_THEME_TOKENS,
    mode?: 'light' | 'dark'
  ): Record<string, string> {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    // The app's two real states are `data-theme="dark"` and NO attribute at all —
    // `MJExplorerAppComponent` removes it for light rather than writing "light"
    // (explorer-app.component.ts). Reproduce those exactly rather than inventing a
    // third state, so the transient DOM is one the stylesheet has actually seen.
    const wantDark = mode === 'dark';
    const isDark = previous === 'dark';
    const mustSwap = mode != null && wantDark !== isDark;

    if (mustSwap) {
      if (wantDark) {
        root.setAttribute('data-theme', 'dark');
      } else {
        root.removeAttribute('data-theme');
      }
    }
    try {
      const style = getComputedStyle(root);
      const out: Record<string, string> = {};
      for (const token of tokens) {
        const value = style.getPropertyValue(token).trim();
        if (value) {
          out[token] = value;
        }
      }
      return out;
    } finally {
      // Restore even if reading throws — never strand the app in the other theme.
      if (mustSwap) {
        if (previous === null) {
          root.removeAttribute('data-theme');
        } else {
          root.setAttribute('data-theme', previous);
        }
      }
    }
  }

  /** Resolve the HTML export's theme pieces once: tokens (explicit > snapshot), logo, title. */
  private async resolveTheme(options: ResolvedExportOptions): Promise<ResolvedExportTheme> {
    const tokens = this.resolveBrandTokens(options);
    const rootBlock = tokens ? this.buildRootBlock(tokens) : '';
    const logoUrl = options.branding?.logoUrl?.trim();
    return {
      rootBlock,
      // The logo needs its `.brand-logo` rule (as the trademark footer needs its own),
      // so both are gated on includeCSS — a CSS-less export must never carry a
      // full-size unstyled logo. The modal enforces this too, but the public
      // BuildExportContent seam has to hold the line on its own.
      logoDataUri: options.includeCSS && logoUrl ? await this.inlineLogo(logoUrl) : null,
      // The title is deliberately NOT includeCSS-gated: it lands in <title>/<h1>, needs
      // no stylesheet, and is the one branding field every format carries unconditionally.
      title: options.branding?.title?.trim() || null
    };
  }

  /** Explicit host tokens win; `includeTheme` falls back to a live snapshot; else no theme. */
  private resolveBrandTokens(options: ResolvedExportOptions): Record<string, string> | null {
    const explicit = options.branding?.brandTokens;
    if (explicit && Object.keys(explicit).length > 0) {
      return explicit;
    }
    return options.includeTheme ? this.SnapshotBrandTokens(DEFAULT_EXPORT_THEME_TOKENS, options.themeMode) : null;
  }

  /** Document title used by every format: branding override → conversation name → generic. */
  private resolveTitle(
    data: ExportConversationData,
    options: ResolvedExportOptions
  ): string {
    return options.branding?.title?.trim() || data.conversation.Name || 'Conversation';
  }

  /**
   * The JSON `branding` block — the data-format analogue of the HTML header +
   * trademark footer. Carries the title, trademark, and logo URL the host set;
   * null when no branding (or none of those fields) is present. Theme color
   * tokens are HTML-only and never included here.
   */
  private buildBrandingBlock(options: ResolvedExportOptions): Record<string, string> | null {
    const b = options.branding;
    if (!b) {
      return null;
    }
    const block: Record<string, string> = {};
    const title = b.title?.trim();
    const trademark = b.trademark?.trim();
    const logoUrl = b.logoUrl?.trim();
    if (title) block.title = title;
    if (trademark) block.trademark = trademark;
    if (logoUrl) block.logoUrl = logoUrl;
    return Object.keys(block).length > 0 ? block : null;
  }

  /**
   * CSS functions permitted inside an exported token value. This is an ALLOWLIST
   * (not a blocklist) so no network-capable function can slip through: blocking
   * only `url(`/`expression(` let `image-set()`, `-webkit-image-set()`,
   * `cross-fade()`, `image()`, and `src()` fetch a beacon URL without ever
   * writing the literal `url(`. Anything not on this list drops the whole entry.
   * The set is the safe value/color-math functions the export could legitimately
   * carry; extend it only with functions that CANNOT load an external resource.
   */
  private static readonly SAFE_CSS_FUNCTIONS = new Set([
    'var', 'calc', 'min', 'max', 'clamp',
    'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch',
    'color', 'color-mix',
  ]);

  /**
   * Emit the sanitized `:root{}` style block. Keys must be custom-property names.
   * A value is REJECTED (the entry is dropped, not stripped) when it carries any
   * declaration/tag-escape or network-reach vector: `<>{}` (tag/rule breakout),
   * `;` (declaration breakout — e.g. `; background: url(beacon)`), `\` (CSS
   * escapes), `@` (at-rules), OR any CSS function not in
   * {@link SAFE_CSS_FUNCTIONS} (which excludes every resource-loading function —
   * url/image-set/cross-fade/image/src/expression/…). Plain colors, `var()`, and
   * `color-mix()` pass untouched.
   */
  private buildRootBlock(tokens: Record<string, string>): string {
    const rules: string[] = [];
    for (const [key, rawValue] of Object.entries(tokens)) {
      if (!/^--[A-Za-z0-9_-]+$/.test(key)) {
        continue;
      }
      const value = String(rawValue).trim();
      if (!value || /[<>{};@\\]/.test(value) || this.hasUnsafeCssFunction(value)) {
        continue;
      }
      rules.push(`${key}: ${value};`);
    }
    return rules.length > 0 ? `
  <style>:root { ${rules.join(' ')} }</style>` : '';
  }

  /** True if the value calls any CSS function outside {@link SAFE_CSS_FUNCTIONS}. */
  private hasUnsafeCssFunction(value: string): boolean {
    // Every `name(` occurrence — the identifier immediately before a '('.
    const calls = value.match(/([a-zA-Z][a-zA-Z-]*)\s*\(/g) ?? [];
    return calls.some((c) => {
      const name = c.replace(/\s*\($/, '').toLowerCase();
      return !ExportService.SAFE_CSS_FUNCTIONS.has(name);
    });
  }

  /** Fetch → data URI so the export stays self-contained; raw URL on any failure
   *  (or when the response isn't actually an image — don't inline HTML/other as
   *  a bogus `data:` image). */
  private async inlineLogo(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return url;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!/^image\//i.test(contentType)) {
        return url;
      }
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  }

  /** Loads the conversation and the messages in the scope that no rerun replaced, in Sequence order. */
  private async loadConversationData(
    conversationId: string,
    scope: ConversationScope,
    currentUser: UserInfo,
    includeArtifacts: boolean
  ): Promise<ExportConversationData> {
    if (!UUIDsEqual(scope.ConversationID, conversationId)) {
      throw new Error(`Conversation ${conversationId} cannot be exported with the scope of conversation ${scope.ConversationID}`);
    }
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Load conversation and details in parallel
    const [conversationResult, detailsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Conversations',
        ExtraFilter: `ID='${conversationId}'`,
        ResultType: 'entity_object'
      },
      {
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: ConversationEngine.LiveRowsFilter(ConversationEngine.ScopeFilter(scope)),
        OrderBy: 'Sequence ASC',
        ResultType: 'entity_object'
      }
    ], currentUser);

    if (!conversationResult.Success || !conversationResult.Results?.length) {
      throw new Error('Conversation not found');
    }

    const details = (detailsResult.Results || []) as MJConversationDetailEntity[];
    return {
      conversation: conversationResult.Results[0] as MJConversationEntity,
      details,
      fork: this.forkLabel(scope, details),
      artifacts: includeArtifacts ? await this.loadOutputArtifacts(details, currentUser) : undefined
    };
  }

  /**
   * The output artifacts of the exported messages, keyed by lower-cased message ID. Reads run as
   * the current user, so row-level security decides what an export carries. A failed read
   * exports the messages without artifacts.
   */
  private async loadOutputArtifacts(
    details: ReadonlyArray<MJConversationDetailEntity>,
    currentUser: UserInfo
  ): Promise<Map<string, ExportArtifact[]>> {
    const byDetail = new Map<string, ExportArtifact[]>();
    if (details.length === 0) {
      return byDetail;
    }
    const rv = RunView.FromMetadataProvider(this.Provider);
    const inList = (ids: Iterable<string>): string => [...ids].map(id => `'${EscapeSQLString(id)}'`).join(',');

    const links = await rv.RunView<ExportArtifactLinkRow>({
      EntityName: 'MJ: Conversation Detail Artifacts',
      ExtraFilter: `ConversationDetailID IN (${inList(details.map(d => d.ID))}) AND Direction='Output'`,
      Fields: ['ConversationDetailID', 'ArtifactVersionID'],
      OrderBy: '__mj_CreatedAt ASC',
      ResultType: 'simple'
    }, currentUser);
    const linkRows = links.Success ? links.Results ?? [] : [];
    if (!links.Success) {
      console.error('Failed to load artifacts for the export:', links.ErrorMessage);
    }
    if (linkRows.length === 0) {
      return byDetail;
    }

    const versionIds = new Set(linkRows.map(l => l.ArtifactVersionID));
    const versions = await rv.RunView<ExportArtifactVersionRow>({
      EntityName: 'MJ: Artifact Versions',
      ExtraFilter: `ID IN (${inList(versionIds)})`,
      Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Name', 'Content', 'FileID', 'MimeType'],
      ResultType: 'simple'
    }, currentUser);
    const versionRows = versions.Success ? versions.Results ?? [] : [];
    if (versionRows.length === 0) {
      return byDetail;
    }

    const artifacts = await rv.RunView<ExportArtifactRow>({
      EntityName: 'MJ: Artifacts',
      ExtraFilter: `ID IN (${inList(new Set(versionRows.map(v => v.ArtifactID)))})`,
      Fields: ['ID', 'Name', 'Type'],
      ResultType: 'simple'
    }, currentUser);
    const artifactById = new Map((artifacts.Success ? artifacts.Results ?? [] : []).map(a => [a.ID.toLowerCase(), a]));
    const versionById = new Map(versionRows.map(v => [v.ID.toLowerCase(), v]));

    for (const link of linkRows) {
      const version = versionById.get(link.ArtifactVersionID.toLowerCase());
      // A version the user cannot read, or whose artifact they cannot read, is left out.
      const artifact = version ? artifactById.get(version.ArtifactID.toLowerCase()) : undefined;
      if (!version || !artifact) {
        continue;
      }
      const key = link.ConversationDetailID.toLowerCase();
      const list = byDetail.get(key) ?? [];
      list.push({
        ArtifactID: artifact.ID,
        VersionID: version.ID,
        Name: version.Name || artifact.Name || 'Untitled artifact',
        Type: artifact.Type,
        VersionNumber: version.VersionNumber,
        Content: version.FileID ? null : version.Content,
        MimeType: version.MimeType,
        FileBacked: !!version.FileID
      });
      byDetail.set(key, list);
    }
    return byDetail;
  }

  /** The artifacts to write under one message: none when artifacts are off or it produced none. */
  private artifactsFor(
    data: ExportConversationData,
    detail: MJConversationDetailEntity,
    options: ResolvedExportOptions
  ): ExportArtifact[] {
    if (!options.includeArtifacts || !data.artifacts) {
      return [];
    }
    return data.artifacts.get(detail.ID.toLowerCase()) ?? [];
  }

  /** The host's link for an artifact, when it builds one and the link is http(s). */
  private artifactUrl(
    data: ExportConversationData,
    artifact: ExportArtifact,
    options: ResolvedExportOptions
  ): string | null {
    const url = options.artifactLink?.({
      ConversationID: data.conversation.ID,
      ArtifactID: artifact.ArtifactID,
      VersionID: artifact.VersionID,
      VersionNumber: artifact.VersionNumber
    })?.trim();
    return url && /^https?:\/\//i.test(url) ? url : null;
  }

  /** "Type, version N" plus the MIME type of a file-backed version. */
  private artifactSummary(artifact: ExportArtifact): string {
    const mime = artifact.FileBacked && artifact.MimeType ? `, ${artifact.MimeType}` : '';
    return `${artifact.Type}, version ${artifact.VersionNumber}${mime}`;
  }

  /**
   * Text content for the Markdown, HTML and text formats, cut at
   * {@link EXPORT_ARTIFACT_CONTENT_LIMIT} with a marker line. Null when there is none.
   */
  private artifactText(artifact: ExportArtifact): string | null {
    const content = artifact.Content;
    if (artifact.FileBacked || content == null || content.length === 0) {
      return null;
    }
    if (content.length <= EXPORT_ARTIFACT_CONTENT_LIMIT) {
      return content;
    }
    return `${content.slice(0, EXPORT_ARTIFACT_CONTENT_LIMIT)}\n[truncated: ${EXPORT_ARTIFACT_CONTENT_LIMIT} of ${content.length} characters shown]`;
  }

  /** A Markdown code fence longer than any backtick run inside the content. */
  private markdownFence(content: string): string {
    const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(run => run.length));
    return '`'.repeat(Math.max(3, longest + 1));
  }

  /** The header name of the scope's fork: its display name; null in Main. */
  private forkLabel(scope: ConversationScope, details: ReadonlyArray<MJConversationDetailEntity>): string | null {
    if (scope.BranchID == null) {
      return null;
    }
    const fork = scope.Branches.find(b => UUIDsEqual(b.ID, scope.BranchID));
    if (!fork) {
      return scope.BranchID;
    }
    const first = [...details]
      .filter(d => UUIDsEqual(d.BranchID ?? null, scope.BranchID))
      .sort((a, b) => a.Sequence - b.Sequence)
      .find(d => ConversationEngine.ForkPlainText(d.Message) != null);
    return ConversationEngine.ForkDisplayName(fork, first?.Message ?? null);
  }

  private exportAsJSON(
    data: ExportConversationData,
    options: ResolvedExportOptions
  ): string {
    const exportData: Record<string, unknown> = {};

    // Add metadata if requested
    const conversationBlock: Record<string, unknown> = options.includeMetadata
      ? {
          id: data.conversation.ID,
          name: data.conversation.Name,
          description: data.conversation.Description,
          createdAt: data.conversation.__mj_CreatedAt,
          updatedAt: data.conversation.__mj_UpdatedAt
        }
      : { name: data.conversation.Name };
    if (data.fork) {
      conversationBlock.fork = data.fork;
    }
    exportData.conversation = conversationBlock;

    // Branding block (title / trademark / logo) when the host supplied branding —
    // the data-format analogue of the HTML header + trademark footer.
    const branding = this.buildBrandingBlock(options);
    if (branding) {
      exportData.branding = branding;
    }

    // Add messages if requested
    if (options.includeMessages) {
      exportData.messages = data.details.map((detail, index) => {
        const message: Record<string, unknown> = {
          role: detail.Role,
          message: detail.Message
        };

        if (options.includeMetadata) {
          message.id = detail.ID;
          message.sequence = index + 1;
          message.timestamp = detail.__mj_CreatedAt;
        }

        const artifacts = this.artifactsFor(data, detail, options);
        if (artifacts.length > 0) {
          message.artifacts = artifacts.map(artifact => {
            const entry: Record<string, unknown> = {
              id: artifact.ArtifactID,
              versionId: artifact.VersionID,
              name: artifact.Name,
              type: artifact.Type,
              version: artifact.VersionNumber
            };
            if (artifact.FileBacked) {
              entry.mimeType = artifact.MimeType;
            }
            const link = this.artifactUrl(data, artifact, options);
            if (link) {
              entry.link = link;
            }
            entry.content = artifact.Content;
            return entry;
          });
        }

        return message;
      });
    }

    // Use pretty print option
    return JSON.stringify(exportData, null, options.prettyPrint ? 2 : 0);
  }

  private exportAsMarkdown(
    data: ExportConversationData,
    options: ResolvedExportOptions
  ): string {
    const logoUrl = options.branding?.logoUrl?.trim();
    // Unbranded markdown must stay byte-identical to before (`# <Name>`), so DON'T
    // route through resolveTitle's 'Conversation' fallback here — only a supplied
    // branding title overrides the raw conversation name.
    const title = options.branding?.title?.trim() || data.conversation.Name;
    let md = '';
    if (logoUrl) {
      md += `![${title}](${logoUrl})\n\n`;
    }
    md += `# ${title}\n\n`;

    if (data.conversation.Description) {
      md += `${data.conversation.Description}\n\n`;
    }

    if (options.includeMetadata) {
      md += `**Created:** ${this.formatDate(data.conversation.__mj_CreatedAt)}\n\n`;
    }

    if (data.fork) {
      md += `**Fork:** ${data.fork}\n\n`;
    }

    md += `---\n\n`;

    if (options.includeMessages) {
      for (const detail of data.details) {
        md += `## ${this.capitalizeRole(detail.Role || 'Unknown')}\n\n`;
        md += `${detail.Message}\n\n`;

        for (const artifact of this.artifactsFor(data, detail, options)) {
          md += `**Artifact:** ${artifact.Name} (${this.artifactSummary(artifact)})\n\n`;
          const link = this.artifactUrl(data, artifact, options);
          if (link) {
            md += `[Open in the app](${link})\n\n`;
          }
          const text = this.artifactText(artifact);
          if (text) {
            const fence = this.markdownFence(text);
            md += `${fence}\n${text}\n${fence}\n\n`;
          }
        }

        if (options.includeMetadata) {
          md += `*${this.formatDate(detail.__mj_CreatedAt)}*\n\n`;
        }

        md += `---\n\n`;
      }
    }

    const trademark = options.branding?.trademark?.trim();
    if (trademark) {
      md += `_${trademark}_\n`;
    }

    return md;
  }

  private exportAsHTML(
    data: ExportConversationData,
    options: ResolvedExportOptions,
    theme: ResolvedExportTheme
  ): string {
    const trademark = options.branding?.trademark?.trim();
    // Every color reads a theme token with the legacy hex as its fallback, so an
    // unthemed export (no :root block emitted) renders exactly as it always has,
    // while a themed one follows the app's palette.
    const styles = options.includeCSS ? `
  <style>
    body { font-family: var(--mj-font-family, system-ui, -apple-system, sans-serif); background: var(--mj-bg-page, #fff); color: var(--mj-text-primary, #333); max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { color: var(--mj-text-primary, #333); border-bottom: 2px solid var(--mj-brand-primary, #007bff); padding-bottom: 10px; }
    .meta { color: var(--mj-text-secondary, #666); font-size: 14px; margin-bottom: 30px; }
    .message { margin-bottom: 30px; padding: 20px; border-radius: var(--mj-radius-md, 8px); background: var(--mj-bg-surface-card, #f5f5f5); }
    .message.user { background: var(--mj-brand-accent-subtle, #e3f2fd); }
    .message.assistant { background: var(--mj-bg-surface-card, #f5f5f5); }
    .role { font-weight: 600; color: var(--mj-brand-primary, #007bff); margin-bottom: 10px; }
    .content { white-space: pre-wrap; }
    .timestamp { color: var(--mj-text-disabled, #999); font-size: 12px; margin-top: 10px; }${this.hasArtifacts(data, options) ? `
    .artifact { margin-top: 12px; padding: 12px; border: 1px solid var(--mj-border-default, #ddd); border-radius: var(--mj-radius-md, 8px); background: var(--mj-bg-page, #fff); }
    .artifact-name { font-weight: 600; }
    .artifact-meta { color: var(--mj-text-secondary, #666); font-size: 12px; }
    .artifact-content { white-space: pre-wrap; overflow-x: auto; font-size: 13px; margin: 8px 0 0; }` : ''}${theme.logoDataUri ? `
    .brand-logo { display: block; max-height: 48px; margin-bottom: 12px; }` : ''}${trademark ? `
    .brand-trademark { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--mj-border-default, #ddd); color: var(--mj-text-secondary, #666); font-size: 12px; text-align: center; }` : ''}
  </style>${theme.rootBlock}` : '';

    const title = theme.title ?? (data.conversation.Name || 'Conversation');
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>${styles}
</head>
<body>
  ${theme.logoDataUri ? `<img class="brand-logo" src="${this.escapeAttr(theme.logoDataUri)}" alt="" />
  ` : ''}<h1>${this.escapeHtml(title)}</h1>`;

    const forkLine = data.fork ? `
    <p>Fork: ${this.escapeHtml(data.fork)}</p>` : '';
    if (options.includeMetadata) {
      html += `
  <div class="meta">
    ${data.conversation.Description ? `<p>${this.escapeHtml(data.conversation.Description)}</p>` : ''}
    <p>Created: ${this.formatDate(data.conversation.__mj_CreatedAt)}</p>${forkLine}
  </div>`;
    } else if (forkLine) {
      html += `
  <div class="meta">${forkLine}
  </div>`;
    }

    if (options.includeMessages) {
      for (const detail of data.details) {
        const roleClass = detail.Role?.toLowerCase() || 'unknown';
        html += `
  <div class="message ${roleClass}">
    <div class="role">${this.capitalizeRole(detail.Role || 'Unknown')}</div>
    <div class="content">${this.escapeHtml(detail.Message || '')}</div>`;

        for (const artifact of this.artifactsFor(data, detail, options)) {
          const link = this.artifactUrl(data, artifact, options);
          const text = this.artifactText(artifact);
          html += `
    <div class="artifact">
      <div class="artifact-name">${this.escapeHtml(artifact.Name)}</div>
      <div class="artifact-meta">${this.escapeHtml(this.artifactSummary(artifact))}${link ? ` · <a href="${this.escapeAttr(link)}">Open in the app</a>` : ''}</div>${text ? `
      <pre class="artifact-content">${this.escapeHtml(text)}</pre>` : ''}
    </div>`;
        }

        if (options.includeMetadata) {
          html += `
    <div class="timestamp">${this.formatDate(detail.__mj_CreatedAt)}</div>`;
        }

        html += `
  </div>`;
      }
    }

    if (options.includeCSS && trademark) {
      html += `
  <footer class="brand-trademark">${this.escapeHtml(trademark)}</footer>`;
    }

    html += `
</body>
</html>`;

    return html;
  }

  private exportAsText(
    data: ExportConversationData,
    options: ResolvedExportOptions
  ): string {
    const name = this.resolveTitle(data, options) || 'Conversation';
    let text = `${name}\n`;
    text += '='.repeat(name.length) + '\n\n';

    if (data.conversation.Description) {
      text += `${data.conversation.Description}\n\n`;
    }

    if (options.includeMetadata) {
      text += `Created: ${this.formatDate(data.conversation.__mj_CreatedAt)}\n\n`;
    }

    if (data.fork) {
      text += `Fork: ${data.fork}\n\n`;
    }

    text += '-'.repeat(80) + '\n\n';

    if (options.includeMessages) {
      for (const detail of data.details) {
        text += `[${this.capitalizeRole(detail.Role || 'Unknown')}]\n`;
        text += `${detail.Message}\n`;

        for (const artifact of this.artifactsFor(data, detail, options)) {
          text += `\n[Artifact] ${artifact.Name} (${this.artifactSummary(artifact)})\n`;
          const link = this.artifactUrl(data, artifact, options);
          if (link) {
            text += `Link: ${link}\n`;
          }
          const content = this.artifactText(artifact);
          if (content) {
            text += `${content}\n`;
          }
        }

        if (options.includeMetadata) {
          text += `(${this.formatDate(detail.__mj_CreatedAt)})\n`;
        }

        text += '\n' + '-'.repeat(80) + '\n\n';
      }
    }

    const trademark = options.branding?.trademark?.trim();
    if (trademark) {
      text += `${trademark}\n`;
    }

    return text;
  }

  /** True when any exported message carries an artifact (the HTML adds its rules only then). */
  private hasArtifacts(data: ExportConversationData, options: ResolvedExportOptions): boolean {
    return options.includeMessages && data.details.some(d => this.artifactsFor(data, d, options).length > 0);
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private capitalizeRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** escapeHtml + quote escaping — for values interpolated into HTML attributes. */
  private escapeAttr(text: string): string {
    return this.escapeHtml(text).replace(/"/g, '&quot;');
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  }
}
