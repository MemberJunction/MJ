import { Component, Input, Output, EventEmitter } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ArtifactStateService } from '../../services/artifact-state.service';

type ArtifactTab = 'preview' | 'source' | 'history';

@Component({
  selector: 'mj-artifact-panel',
  template: `
    <div class="artifact-panel">
      <div class="artifact-panel-header">
        <div class="artifact-panel-title">
          <i class="fas fa-file-alt"></i>
          <span>{{ activeArtifact?.Name || 'Artifact' }}</span>
        </div>
        <div class="artifact-panel-actions">
          <button class="artifact-share-button" (click)="shareArtifact()" title="Share">
            <i class="fas fa-share"></i>
            <span>Share</span>
          </button>
          <button class="artifact-panel-action" (click)="copyContent()" title="Copy">
            <i class="fas fa-copy"></i>
          </button>
          <button class="artifact-panel-action" (click)="downloadArtifact()" title="Download">
            <i class="fas fa-download"></i>
          </button>
          <button class="artifact-panel-action" (click)="maximizeArtifact()" title="Maximize">
            <i class="fas fa-expand"></i>
          </button>
          <button class="artifact-panel-close" (click)="close.emit()" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="artifact-panel-tabs">
        <button class="artifact-panel-tab"
                [class.active]="activeTab === 'preview'"
                (click)="switchTab('preview')">
          Preview
        </button>
        <button class="artifact-panel-tab"
                [class.active]="activeTab === 'source'"
                (click)="switchTab('source')">
          Source
        </button>
        <button class="artifact-panel-tab"
                [class.active]="activeTab === 'history'"
                (click)="switchTab('history')">
          History
        </button>
      </div>
      <div class="artifact-panel-content">
        <div *ngIf="activeTab === 'preview'" class="tab-content">
          <mj-artifact-viewer
            *ngIf="activeArtifact"
            [artifact]="activeArtifact"
            [currentUser]="currentUser">
          </mj-artifact-viewer>
          <div *ngIf="!activeArtifact" class="empty-state">
            <i class="fas fa-file-alt"></i>
            <p>No artifact selected</p>
          </div>
        </div>
        <div *ngIf="activeTab === 'source'" class="tab-content">
          <div class="source-view" *ngIf="activeArtifact">
            <mj-code-editor
              [value]="activeArtifact.Content || ''"
              [readonly]="true"
              [lineWrapping]="true"
              [setup]="'basic'">
            </mj-code-editor>
          </div>
        </div>
        <div *ngIf="activeTab === 'history'" class="tab-content">
          <mj-artifact-version-history
            *ngIf="activeArtifact"
            [artifact]="activeArtifact"
            [currentUser]="currentUser">
          </mj-artifact-version-history>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .artifact-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      border-left: 1px solid #E5E7EB;
    }
    .artifact-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #E5E7EB;
    }
    .artifact-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
      color: #111827;
    }
    .artifact-panel-title i {
      color: #6B7280;
    }
    .artifact-panel-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .artifact-share-button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #1e40af;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      cursor: pointer;
      transition: background 150ms ease;
    }
    .artifact-share-button:hover {
      background: #1e3a8a;
    }
    .artifact-panel-action {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      color: #6B7280;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .artifact-panel-action:hover {
      background: #F9FAFB;
      color: #111827;
    }
    .artifact-panel-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #6B7280;
      cursor: pointer;
      transition: all 150ms ease;
      border-radius: 6px;
    }
    .artifact-panel-close:hover {
      background: #FEE2E2;
      color: #DC2626;
    }
    .artifact-panel-tabs {
      display: flex;
      border-bottom: 1px solid #E5E7EB;
      padding: 0 20px;
    }
    .artifact-panel-tab {
      padding: 12px 16px;
      background: transparent;
      border: none;
      color: #6B7280;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 150ms ease;
    }
    .artifact-panel-tab:hover {
      color: #111827;
    }
    .artifact-panel-tab.active {
      color: #1e40af;
      border-bottom-color: #1e40af;
    }
    .artifact-panel-content {
      flex: 1;
      overflow-y: auto;
    }
    .tab-content {
      height: 100%;
    }
    .source-view {
      height: 100%;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #9CA3AF;
    }
    .empty-state i {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    .empty-state p {
      margin: 0;
      font-size: 14px;
    }
  `]
})
export class ArtifactPanelComponent {
  @Input() currentUser!: UserInfo;
  @Output() close = new EventEmitter<void>();

  public activeTab: ArtifactTab = 'preview';
  public activeArtifact: any = null;

  constructor(private artifactState: ArtifactStateService) {
    // Subscribe to active artifact
    this.artifactState.activeArtifact$.subscribe(artifact => {
      this.activeArtifact = artifact;
    });
  }

  switchTab(tab: ArtifactTab): void {
    this.activeTab = tab;
  }

  shareArtifact(): void {
    console.log('Share artifact');
  }

  copyContent(): void {
    console.log('Copy content');
  }

  downloadArtifact(): void {
    console.log('Download artifact');
  }

  maximizeArtifact(): void {
    console.log('Maximize artifact');
  }
}