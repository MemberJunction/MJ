import { Injectable } from '@angular/core';
import { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { RunView, UserInfo, Metadata, IMetadataProvider } from '@memberjunction/core';

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
   * self-contained; falls back to the raw URL if the fetch fails) and rendered
   * above the title; in markdown it is referenced by URL. JSON carries it as a
   * string; plain text omits it.
   */
  logoUrl?: string;
  /** Overrides the exported document's title (defaults to the conversation name). */
  title?: string;
  /**
   * A short trademark / attribution line (e.g. `© 2026 Acme Association ·
   * Powered by Betty`) rendered at the FOOT of the exported document in every
   * format — a styled HTML footer, a markdown/text trailer, and a field in the
   * JSON `branding` block.
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
  /** Branding (tokens / logo / title) applied to the export — see {@link ExportBranding}. */
  branding?: ExportBranding;
}

/**
 * Tokens captured by the theme auto-snapshot — exactly the custom properties the
 * HTML export's stylesheet consumes. Hosts wanting more control supply their own
 * map via {@link ExportBranding.brandTokens} instead.
 */
export const DEFAULT_EXPORT_THEME_TOKENS: readonly string[] = [
  '--mj-text-primary',
  '--mj-text-secondary',
  '--mj-text-disabled',
  '--mj-brand-primary',
  '--mj-bg-surface-card',
  '--mj-status-info-bg',
];

/** Internal: options with defaults applied (branding stays optional). */
type ResolvedExportOptions = Required<Omit<ExportOptions, 'branding'>> & Pick<ExportOptions, 'branding'>;

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

  async exportConversation(
    conversationId: string,
    format: ExportFormat,
    currentUser: UserInfo,
    options: ExportOptions = {}
  ): Promise<void> {
    const conversation = await this.loadConversationData(conversationId, currentUser);
    const { content, filename, mimeType } = await this.BuildExportContent(conversation, format, options);
    this.downloadFile(content, filename, mimeType);
  }

  /**
   * Build the export document for already-loaded conversation data — the
   * download-free seam of {@link exportConversation}. Async because HTML-format
   * branding may inline a logo. Exposed publicly so hosts (and tests) can build
   * export content without triggering a browser download.
   */
  public async BuildExportContent(
    data: { conversation: MJConversationEntity; details: MJConversationDetailEntity[] },
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<{ content: string; filename: string; mimeType: string }> {
    const exportOptions: ResolvedExportOptions = {
      includeMessages: options.includeMessages ?? true,
      includeMetadata: options.includeMetadata ?? true,
      prettyPrint: options.prettyPrint ?? true,
      includeCSS: options.includeCSS ?? true,
      includeTheme: options.includeTheme ?? false,
      branding: options.branding
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
   * Snapshot the given theme tokens from the live document (the values the app
   * is rendering with right now). Empty/unset tokens are skipped.
   */
  public SnapshotBrandTokens(tokens: readonly string[] = DEFAULT_EXPORT_THEME_TOKENS): Record<string, string> {
    const style = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const token of tokens) {
      const value = style.getPropertyValue(token).trim();
      if (value) {
        out[token] = value;
      }
    }
    return out;
  }

  /** Resolve the HTML export's theme pieces once: tokens (explicit > snapshot), logo, title. */
  private async resolveTheme(options: ResolvedExportOptions): Promise<ResolvedExportTheme> {
    const tokens = this.resolveBrandTokens(options);
    const rootBlock = tokens ? this.buildRootBlock(tokens) : '';
    const logoUrl = options.branding?.logoUrl?.trim();
    return {
      rootBlock,
      logoDataUri: logoUrl ? await this.inlineLogo(logoUrl) : null,
      title: options.branding?.title?.trim() || null
    };
  }

  /** Explicit host tokens win; `includeTheme` falls back to a live snapshot; else no theme. */
  private resolveBrandTokens(options: ResolvedExportOptions): Record<string, string> | null {
    const explicit = options.branding?.brandTokens;
    if (explicit && Object.keys(explicit).length > 0) {
      return explicit;
    }
    return options.includeTheme ? this.SnapshotBrandTokens() : null;
  }

  /** Document title used by every format: branding override → conversation name → generic. */
  private resolveTitle(
    data: { conversation: MJConversationEntity; details: MJConversationDetailEntity[] },
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
   * Emit the sanitized `:root{}` style block. Keys must be custom-property names.
   * Values are REJECTED (the entry is dropped), not stripped, when they carry
   * anything that could escape the declaration or reach the network from a
   * style value: `<>{}` (tag/rule breakout), `;` (declaration breakout — e.g. a
   * value appending `; background: url(beacon)` onto :root), `\` (CSS escapes),
   * `@` (at-rules), or `url(`/`expression(` calls. Plain colors, `var()`, and
   * `color-mix()` values pass untouched.
   */
  private buildRootBlock(tokens: Record<string, string>): string {
    const rules: string[] = [];
    for (const [key, rawValue] of Object.entries(tokens)) {
      if (!/^--[A-Za-z0-9_-]+$/.test(key)) {
        continue;
      }
      const value = String(rawValue).trim();
      if (!value || /[<>{};@\\]/.test(value) || /(?:url|expression)\s*\(/i.test(value)) {
        continue;
      }
      rules.push(`${key}: ${value};`);
    }
    return rules.length > 0 ? `
  <style>:root { ${rules.join(' ')} }</style>` : '';
  }

  /** Fetch → data URI so the export stays self-contained; raw URL on any failure. */
  private async inlineLogo(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
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

  private async loadConversationData(
    conversationId: string,
    currentUser: UserInfo
  ): Promise<{ conversation: MJConversationEntity; details: MJConversationDetailEntity[] }> {
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
        ExtraFilter: `ConversationID='${conversationId}'`,
        OrderBy: 'Sequence ASC',
        ResultType: 'entity_object'
      }
    ], currentUser);

    if (!conversationResult.Success || !conversationResult.Results?.length) {
      throw new Error('Conversation not found');
    }

    return {
      conversation: conversationResult.Results[0] as MJConversationEntity,
      details: (detailsResult.Results || []) as MJConversationDetailEntity[]
    };
  }

  private exportAsJSON(
    data: {
      conversation: MJConversationEntity;
      details: MJConversationDetailEntity[];
    },
    options: ResolvedExportOptions
  ): string {
    const exportData: Record<string, unknown> = {};

    // Add metadata if requested
    if (options.includeMetadata) {
      exportData.conversation = {
        id: data.conversation.ID,
        name: data.conversation.Name,
        description: data.conversation.Description,
        createdAt: data.conversation.__mj_CreatedAt,
        updatedAt: data.conversation.__mj_UpdatedAt
      };
    } else {
      exportData.conversation = {
        name: data.conversation.Name
      };
    }

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

        return message;
      });
    }

    // Use pretty print option
    return JSON.stringify(exportData, null, options.prettyPrint ? 2 : 0);
  }

  private exportAsMarkdown(
    data: {
      conversation: MJConversationEntity;
      details: MJConversationDetailEntity[];
    },
    options: ResolvedExportOptions
  ): string {
    const logoUrl = options.branding?.logoUrl?.trim();
    const title = this.resolveTitle(data, options);
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

    md += `---\n\n`;

    if (options.includeMessages) {
      for (const detail of data.details) {
        md += `## ${this.capitalizeRole(detail.Role || 'Unknown')}\n\n`;
        md += `${detail.Message}\n\n`;

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
    data: {
      conversation: MJConversationEntity;
      details: MJConversationDetailEntity[];
    },
    options: ResolvedExportOptions,
    theme: ResolvedExportTheme
  ): string {
    const trademark = options.branding?.trademark?.trim();
    // Every color reads a theme token with the legacy hex as its fallback, so an
    // unthemed export (no :root block emitted) renders exactly as it always has,
    // while a themed one follows the app's palette.
    const styles = options.includeCSS ? `
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { color: var(--mj-text-primary, #333); border-bottom: 2px solid var(--mj-brand-primary, #007bff); padding-bottom: 10px; }
    .meta { color: var(--mj-text-secondary, #666); font-size: 14px; margin-bottom: 30px; }
    .message { margin-bottom: 30px; padding: 20px; border-radius: 8px; background: var(--mj-bg-surface-card, #f5f5f5); }
    .message.user { background: var(--mj-status-info-bg, #e3f2fd); }
    .message.assistant { background: var(--mj-bg-surface-card, #f5f5f5); }
    .role { font-weight: 600; color: var(--mj-brand-primary, #007bff); margin-bottom: 10px; }
    .content { white-space: pre-wrap; }
    .timestamp { color: var(--mj-text-disabled, #999); font-size: 12px; margin-top: 10px; }${theme.logoDataUri ? `
    .brand-logo { display: block; max-height: 48px; margin-bottom: 12px; }` : ''}${trademark ? `
    .brand-trademark { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--mj-text-disabled, #ddd); color: var(--mj-text-secondary, #666); font-size: 12px; text-align: center; }` : ''}
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

    if (options.includeMetadata) {
      html += `
  <div class="meta">
    ${data.conversation.Description ? `<p>${this.escapeHtml(data.conversation.Description)}</p>` : ''}
    <p>Created: ${this.formatDate(data.conversation.__mj_CreatedAt)}</p>
  </div>`;
    }

    if (options.includeMessages) {
      for (const detail of data.details) {
        const roleClass = detail.Role?.toLowerCase() || 'unknown';
        html += `
  <div class="message ${roleClass}">
    <div class="role">${this.capitalizeRole(detail.Role || 'Unknown')}</div>
    <div class="content">${this.escapeHtml(detail.Message || '')}</div>`;

        if (options.includeMetadata) {
          html += `
    <div class="timestamp">${this.formatDate(detail.__mj_CreatedAt)}</div>`;
        }

        html += `
  </div>`;
      }
    }

    if (trademark) {
      html += `
  <footer class="brand-trademark">${this.escapeHtml(trademark)}</footer>`;
    }

    html += `
</body>
</html>`;

    return html;
  }

  private exportAsText(
    data: {
      conversation: MJConversationEntity;
      details: MJConversationDetailEntity[];
    },
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

    text += '-'.repeat(80) + '\n\n';

    if (options.includeMessages) {
      for (const detail of data.details) {
        text += `[${this.capitalizeRole(detail.Role || 'Unknown')}]\n`;
        text += `${detail.Message}\n`;

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
