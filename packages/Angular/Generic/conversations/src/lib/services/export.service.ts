import { Injectable } from '@angular/core';
import { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { RunView, UserInfo } from '@memberjunction/core';

export type ExportFormat = 'json' | 'markdown' | 'html' | 'text';

export interface ExportOptions {
  includeMessages?: boolean;
  includeMetadata?: boolean;
  prettyPrint?: boolean;
  includeCSS?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  async exportConversation(
    conversationId: string,
    format: ExportFormat,
    currentUser: UserInfo,
    options: ExportOptions = {}
  ): Promise<void> {
    const conversation = await this.loadConversationData(conversationId, currentUser);

    // Apply default options
    const exportOptions: Required<ExportOptions> = {
      includeMessages: options.includeMessages ?? true,
      includeMetadata: options.includeMetadata ?? true,
      prettyPrint: options.prettyPrint ?? true,
      includeCSS: options.includeCSS ?? true
    };

    let content: string;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'json':
        content = this.exportAsJSON(conversation, exportOptions);
        filename = `conversation-${conversation.conversation.Name}-${this.getTimestamp()}.json`;
        mimeType = 'application/json';
        break;
      case 'markdown':
        content = this.exportAsMarkdown(conversation, exportOptions);
        filename = `conversation-${conversation.conversation.Name}-${this.getTimestamp()}.md`;
        mimeType = 'text/markdown';
        break;
      case 'html':
        content = this.exportAsHTML(conversation, exportOptions);
        filename = `conversation-${conversation.conversation.Name}-${this.getTimestamp()}.html`;
        mimeType = 'text/html';
        break;
      case 'text':
        content = this.exportAsText(conversation, exportOptions);
        filename = `conversation-${conversation.conversation.Name}-${this.getTimestamp()}.txt`;
        mimeType = 'text/plain';
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    this.downloadFile(content, filename, mimeType);
  }

  private async loadConversationData(
    conversationId: string,
    currentUser: UserInfo
  ): Promise<{ conversation: MJConversationEntity; details: MJConversationDetailEntity[] }> {
    const rv = new RunView();

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
    options: Required<ExportOptions>
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
    options: Required<ExportOptions>
  ): string {
    let md = `# ${data.conversation.Name}\n\n`;

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

    return md;
  }

  private exportAsHTML(
    data: {
      conversation: MJConversationEntity;
      details: MJConversationDetailEntity[];
    },
    options: Required<ExportOptions>
  ): string {
    const styles = options.includeCSS ? `
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .message { margin-bottom: 30px; padding: 20px; border-radius: 8px; background: #f5f5f5; }
    .message.user { background: #e3f2fd; }
    .message.assistant { background: #f5f5f5; }
    .role { font-weight: 600; color: #007bff; margin-bottom: 10px; }
    .content { white-space: pre-wrap; }
    .timestamp { color: #999; font-size: 12px; margin-top: 10px; }
  </style>` : '';

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(data.conversation.Name || 'Conversation')}</title>${styles}
</head>
<body>
  <h1>${this.escapeHtml(data.conversation.Name || 'Conversation')}</h1>`;

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
    options: Required<ExportOptions>
  ): string {
    const name = data.conversation.Name || 'Conversation';
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

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  }
}
