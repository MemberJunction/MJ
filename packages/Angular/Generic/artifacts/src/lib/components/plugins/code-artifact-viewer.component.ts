import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';

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
  public codeContent = '';
  public language = 'plaintext';
  public languageLabel = 'Code';

  @Input() contentType?: string;

  /**
   * Code artifacts always have content to display
   */
  public override get hasDisplayContent(): boolean {
    return true;
  }

  ngOnInit(): void {
    this.codeContent = this.getContent();
    this.detectLanguage();
  }

  private detectLanguage(): void {
    const ct = this.contentType?.toLowerCase() || '';

    // Map content types to Monaco editor language modes
    if (ct.includes('python')) {
      this.language = 'python';
      this.languageLabel = 'Python';
    } else if (ct.includes('csharp') || ct.includes('c#')) {
      this.language = 'csharp';
      this.languageLabel = 'C#';
    } else if (ct.includes('java')) {
      this.language = 'java';
      this.languageLabel = 'Java';
    } else if (ct.includes('typescript')) {
      this.language = 'typescript';
      this.languageLabel = 'TypeScript';
    } else if (ct.includes('javascript')) {
      this.language = 'javascript';
      this.languageLabel = 'JavaScript';
    } else if (ct.includes('sql')) {
      this.language = 'sql';
      this.languageLabel = 'SQL';
    } else if (ct.includes('css')) {
      this.language = 'css';
      this.languageLabel = 'CSS';
    } else if (ct.includes('xml')) {
      this.language = 'xml';
      this.languageLabel = 'XML';
    } else {
      this.language = 'plaintext';
      this.languageLabel = 'Code';
    }
  }

  onCopy(): void {
    if (this.codeContent) {
      navigator.clipboard.writeText(this.codeContent).then(() => {
        console.log('✅ Copied code to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }
}
