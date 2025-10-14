import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { MJReactComponent, AngularAdapterService } from '@memberjunction/ng-react';
import { BuildComponentCompleteCode, ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Viewer component for interactive Component artifacts (React-based UI components)
 */
@Component({
  selector: 'mj-component-artifact-viewer',
  template: `
    <div class="component-artifact-viewer" [ngClass]="cssClass">
      <div class="component-toolbar">
        <div class="component-badge">
          <i class="fas fa-cube"></i> Interactive Component
        </div>
        <button class="btn-icon" title="View Source Code" (click)="viewMode = viewMode === 'preview' ? 'source' : 'preview'">
          <i [class]="viewMode === 'preview' ? 'fas fa-code' : 'fas fa-eye'"></i>
          {{ viewMode === 'preview' ? 'Source' : 'Preview' }}
        </button>
        @if (viewMode === 'source') {
          <button class="btn-icon" title="Copy Code" (click)="onCopy()">
            <i class="fas fa-copy"></i> Copy
          </button>
        }
      </div>
      <div class="component-content-container">
        @if (viewMode === 'preview') {
          <div class="component-preview">
            @if (hasError) {
              <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Component Error</h3>
                <p>{{ errorMessage }}</p>
                @if (errorDetails) {
                  <details>
                    <summary>Technical Details</summary>
                    <pre>{{ errorDetails }}</pre>
                  </details>
                }
              </div>
            } @else {
              @if (component) {
                <mj-react-component
                  #reactComponent
                  [component]="component"
                  (componentEvent)="onComponentEvent($event)"
                  (stateChange)="onStateChange($event)"
                  (openEntityRecord)="onOpenEntityRecord($event)">
                </mj-react-component>
              }
              @else {
                <div class="error-state">
                  <i class="fas fa-exclamation-circle"></i>
                  <h3>No Component Loaded</h3>
                  <p>The component data is missing or invalid.</p>
                </div>
              }
            }
          </div>
        } @else {
          <mj-code-editor
            [(ngModel)]="componentCode"
            [language]="'typescript'"
            [readonly]="readonly"
            style="width: 100%; height: 100%;">
          </mj-code-editor>
        }
      </div>
    </div>
  `,
  styles: [`
    .component-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .component-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      gap: 8px;
    }

    .component-badge {
      padding: 6px 12px;
      background: #28a745;
      color: white;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
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

    .component-content-container {
      flex: 1;
      overflow: auto;
    }

    .component-preview {
      padding: 20px;
      background: white;
      height: 100%;
      overflow: auto;
    }

    .error-state {
      padding: 20px;
      text-align: center;
      color: #dc3545;
    }

    .error-state i {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .error-state h3 {
      margin: 0 0 12px;
      font-size: 20px;
      font-weight: 600;
    }

    .error-state p {
      margin: 0 0 12px;
      color: #6c757d;
    }

    .error-state details {
      margin-top: 16px;
      text-align: left;
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
    }

    .error-state summary {
      cursor: pointer;
      font-weight: 600;
      color: #495057;
    }

    .error-state pre {
      margin-top: 8px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 12px;
      color: #212529;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'ComponentArtifactViewerPlugin')
export class ComponentArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements AfterViewInit {
  @ViewChild('reactComponent') reactComponent?: MJReactComponent;

  public component: ComponentSpec | null = null;
  public componentCode: string = "";
  public componentName: string = '';
  public viewMode: 'preview' | 'source' = 'preview';
  public hasError = false;
  public errorMessage = '';
  public errorDetails = '';

  constructor(private adapter: AngularAdapterService) {
    super();
  }

  async ngOnInit(): Promise<void> {
    // Extract component name from the code
    if (this.artifactVersion.Content) {
      this.component = SafeJSONParse(this.artifactVersion.Content) as ComponentSpec;
    }
    else {
      throw new Error('Artifact content is empty');
    }

    this.extractComponentParts();

    // Initialize Angular adapter for React components
    try {
      await this.adapter.initialize();
    } catch (error) {
      console.error('Failed to initialize Angular adapter:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to initialize component runtime';
      this.errorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    // Component initialization happens automatically via mj-react-component
  }

  /**
   * Component plugin always shows elevated display (interactive React component).
   */
  public override get isShowingElevatedDisplay(): boolean {
    return true;
  }

  /**
   * Component plugin should tell parent to show JSON tab so users can view the component spec source.
   */
  public override get parentShouldShowRawContent(): boolean {
    return true;
  }

  private extractComponentParts(): void {
    if (this.component?.name) {
      this.componentName = this.component?.name;
    }
    if (this.component?.code) {
      this.componentCode = BuildComponentCompleteCode(this.component);
    }
  }

  onCopy(): void {
    if (this.componentCode) {
      navigator.clipboard.writeText(this.componentCode).then(() => {
        console.log('✅ Copied component code to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  onComponentEvent(event: any): void {
    if (event.type === 'error') {
      this.hasError = true;
      this.errorMessage = event.payload?.error || 'An unknown error occurred';
      this.errorDetails = event.payload?.errorInfo || event.payload?.stackTrace || '';
      console.error('Component error:', event.payload);
    } else {
      console.log('Component event:', event.type, event.payload);
    }
  }

  onStateChange(event: any): void {
    console.log('Component state change:', event);
    // Could update componentContext here if needed for persistence
  }

  onOpenEntityRecord(event: { entityName: string; key: any }): void {
    console.log('Open entity record requested:', event);
    // This would typically be handled by a parent component to open entity forms
    // For now just log it
  }
}
 