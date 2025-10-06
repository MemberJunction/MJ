import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView } from '@memberjunction/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'mj-artifact-viewer',
  template: `
    <div class="artifact-viewer">
      <div class="viewer-content" [ngSwitch]="artifactType">
        <!-- Code Viewer -->
        <div *ngSwitchCase="'code'" class="code-viewer">
          <mj-code-editor
            [value]="content"
            [readonly]="true"
            [language]="codeLanguage"
            [lineWrapping]="true"
            [setup]="'basic'">
          </mj-code-editor>
        </div>

        <!-- Markdown Viewer -->
        <div *ngSwitchCase="'markdown'" class="markdown-viewer">
          <div markdown [data]="content"></div>
        </div>

        <!-- HTML Viewer -->
        <div *ngSwitchCase="'html'" class="html-viewer">
          <iframe [srcdoc]="content" sandbox="allow-scripts"></iframe>
        </div>

        <!-- JSON Viewer -->
        <div *ngSwitchCase="'json'" class="json-viewer">
          <mj-code-editor
            [value]="formattedJson"
            [readonly]="true"
            [language]="'json'"
            [lineWrapping]="true"
            [setup]="'basic'">
          </mj-code-editor>
        </div>

        <!-- Text Viewer (default) -->
        <div *ngSwitchDefault class="text-viewer">
          <mj-code-editor
            [value]="content"
            [readonly]="true"
            [lineWrapping]="true"
            [setup]="'minimal'">
          </mj-code-editor>
        </div>
      </div>

      <div class="viewer-actions">
        <button class="action-btn" (click)="copyToClipboard()" title="Copy to clipboard">
          <i class="fas fa-copy"></i> Copy
        </button>
        <button class="action-btn" (click)="downloadArtifact()" title="Download">
          <i class="fas fa-download"></i> Download
        </button>
      </div>
    </div>
  `,
  styles: [`
    .artifact-viewer {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .viewer-content {
      flex: 1;
      overflow: auto;
      padding: 24px;
      background: #FAFAFA;
    }
    .code-viewer, .json-viewer, .text-viewer {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .code-viewer mj-code-editor, .json-viewer mj-code-editor, .text-viewer mj-code-editor {
      flex: 1;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
      overflow: hidden;
    }
    .markdown-viewer {
      background: #FFF;
      padding: 24px;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
    }
    .html-viewer iframe {
      width: 100%;
      height: 600px;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
    }
    .viewer-actions {
      padding: 16px 24px;
      border-top: 1px solid #D9D9D9;
      display: flex;
      gap: 12px;
    }
    .action-btn {
      padding: 8px 16px;
      background: #FFF;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 150ms ease;
    }
    .action-btn:hover {
      background: #F4F4F4;
      border-color: #0076B6;
    }
  `]
})
export class ArtifactViewerComponent implements OnInit, OnChanges {
  @Input() artifact!: ArtifactEntity;
  @Input() versionNumber?: number;
  @Input() currentUser!: UserInfo;

  public content: string = '';
  public artifactType: string = 'text';
  public codeLanguage: string = 'javascript';
  public sanitizedContent: SafeHtml = '';
  public formattedJson: string = '';

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.loadContent();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['artifact'] || changes['versionNumber']) {
      this.loadContent();
    }
  }

  private async loadContent(): Promise<void> {
    if (!this.artifact) return;

    try {
      // Determine artifact type from TypeID or name
      this.artifactType = this.determineType();

      // Load the content from the specified version or latest
      const rv = new RunView();
      const filter = this.versionNumber
        ? `ArtifactID='${this.artifact.ID}' AND VersionNumber=${this.versionNumber}`
        : `ArtifactID='${this.artifact.ID}'`;

      const result = await rv.RunView<ArtifactVersionEntity>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: filter,
        OrderBy: 'VersionNumber DESC',
        MaxRows: 1,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        this.content = result.Results[0].Content || '';
        this.processContent();
      }
    } catch (error) {
      console.error('Error loading artifact content:', error);
    }
  }

  private determineType(): string {
    const name = this.artifact.Name?.toLowerCase() || '';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';

    // Code files - also determine language
    if (name.endsWith('.js') || name.endsWith('.jsx')) {
      this.codeLanguage = 'javascript';
      return 'code';
    }
    if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      this.codeLanguage = 'typescript';
      return 'code';
    }
    if (name.endsWith('.py')) {
      this.codeLanguage = 'python';
      return 'code';
    }
    if (name.endsWith('.java')) {
      this.codeLanguage = 'java';
      return 'code';
    }
    if (name.endsWith('.sql')) {
      this.codeLanguage = 'sql';
      return 'code';
    }
    if (name.endsWith('.css')) {
      this.codeLanguage = 'css';
      return 'code';
    }

    return 'text';
  }

  private processContent(): void {
    switch (this.artifactType) {
      case 'json':
        try {
          const obj = JSON.parse(this.content);
          this.formattedJson = JSON.stringify(obj, null, 2);
        } catch {
          this.formattedJson = this.content;
        }
        break;
      case 'markdown':
      case 'html':
      case 'code':
        this.sanitizedContent = this.sanitizer.sanitize(1, this.content) || '';
        break;
    }
  }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.content).then(() => {
      alert('Copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  downloadArtifact(): void {
    const blob = new Blob([this.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.artifact.Name || 'artifact.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}