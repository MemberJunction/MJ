import { Component, Input } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { CreateCodeSnapshot } from '../../snapshot-helpers';

/**
 * Viewer component for code artifacts (Python, C#, Java, TypeScript, JavaScript, SQL, CSS, XML)
 */
@Component({
  standalone: false,
  selector: 'mj-code-artifact-viewer',
  template: `
    <div class="code-artifact-viewer" [ngClass]="cssClass">
      <div class="code-toolbar">
        <div class="language-badge">{{ languageLabel }}</div>
        <button class="btn-icon" title="Copy Code" (click)="onCopy()">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
      <div class="code-editor-container">
        <mj-code-editor
          [(ngModel)]="codeContent"
          [language]="language"
          [readonly]="readonly"
          style="width: 100%; height: 100%;">
        </mj-code-editor>
      </div>
    </div>
  `,
  styles: [`
    .code-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .code-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }

    .language-badge {
      padding: 4px 12px;
      background: #007acc;
      color: white;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .btn-icon {
      padding: 6px 12px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-icon:hover {
      background: #e9ecef;
      border-color: #999;
    }

    .code-editor-container {
      flex: 1;
      overflow: auto;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'CodeArtifactViewerPlugin')
export class CodeArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  public CodeContent = '';

  /** @deprecated Use {@link CodeContent}. */
  public get codeContent() {
    return this.CodeContent;
  }
  /** @deprecated Use {@link CodeContent}. */
  public set codeContent(value) {
    this.CodeContent = value;
  }
  public Language = 'plaintext';

  /** @deprecated Use {@link Language}. */
  public get language() {
    return this.Language;
  }
  /** @deprecated Use {@link Language}. */
  public set language(value) {
    this.Language = value;
  }
  public LanguageLabel = 'Code';

  /** @deprecated Use {@link LanguageLabel}. */
  public get languageLabel() {
    return this.LanguageLabel;
  }
  /** @deprecated Use {@link LanguageLabel}. */
  public set languageLabel(value) {
    this.LanguageLabel = value;
  }

  @Input() ContentType?: string;

  /** @deprecated Use {@link ContentType}. */
  @Input() set contentType(value: string | undefined) {
    this.ContentType = value;
  }
  /** @deprecated Use {@link ContentType}. */
  get contentType(): string | undefined {
    return this.ContentType;
  }

  /**
   * Code artifacts always have content to display
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  ngOnInit(): void {
    this.CodeContent = this.getContent();
    this.detectLanguage();
  }

  private detectLanguage(): void {
    const ct = this.ContentType?.toLowerCase() || '';

    // Map content types to Monaco editor language modes
    if (ct.includes('python')) {
      this.Language = 'python';
      this.LanguageLabel = 'Python';
    } else if (ct.includes('csharp') || ct.includes('c#')) {
      this.Language = 'csharp';
      this.LanguageLabel = 'C#';
    } else if (ct.includes('java')) {
      this.Language = 'java';
      this.LanguageLabel = 'Java';
    } else if (ct.includes('typescript')) {
      this.Language = 'typescript';
      this.LanguageLabel = 'TypeScript';
    } else if (ct.includes('javascript')) {
      this.Language = 'javascript';
      this.LanguageLabel = 'JavaScript';
    } else if (ct.includes('sql')) {
      this.Language = 'sql';
      this.LanguageLabel = 'SQL';
    } else if (ct.includes('css')) {
      this.Language = 'css';
      this.LanguageLabel = 'CSS';
    } else if (ct.includes('xml')) {
      this.Language = 'xml';
      this.LanguageLabel = 'XML';
    } else {
      this.Language = 'plaintext';
      this.LanguageLabel = 'Code';
    }
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    return CreateCodeSnapshot(this.getRawContent(), this.getDisplayTitle());
  }

  OnCopy(): void {
    if (this.CodeContent) {
      navigator.clipboard.writeText(this.CodeContent).then(() => {
        console.log('✅ Copied code to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  /** @deprecated Use {@link OnCopy}. */
  onCopy(): void {
    return this.OnCopy();
  }
}
