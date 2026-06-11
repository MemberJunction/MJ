import { Component } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '@memberjunction/ng-artifacts';
import { ParseBoardStateJson, WhiteboardSnapshotComponent } from './whiteboard-snapshot.component';
import { BuildWhiteboardExportHtml, BuildWhiteboardExportSvg } from './whiteboard-export';
import { WhiteboardState } from './whiteboard-state';

/**
 * ARTIFACT VIEWER PLUGIN for saved whiteboards — renders the session-channel board
 * artifact (a {@link WhiteboardState.ToJSON} payload) as a read-only snapshot with the
 * same export affordances the live board offers (Download HTML / Download SVG / Print).
 *
 * Resolved dynamically by the artifact plugin host via the MJ ClassFactory (keyed by the
 * artifact type's DriverClass), which instantiates the class ONCE with a bare `new` to
 * discover the component type — so this class must stay constructible outside an Angular
 * injection context (no `inject()` field initializers, no constructor DI).
 */
@Component({
  standalone: true,
  selector: 'mj-whiteboard-artifact-viewer',
  imports: [WhiteboardSnapshotComponent],
  template: `
    <div [class]="'wb-artifact-viewer ' + (cssClass || '')" [style.height]="height || null">
      <div class="wb-artifact-toolbar">
        <button type="button" class="wb-tool-btn" title="Download as HTML" [disabled]="!HasBoard" (click)="OnDownloadHtml()">
          <i class="fa-solid fa-file-code" aria-hidden="true"></i> HTML
        </button>
        <button type="button" class="wb-tool-btn" title="Download as SVG" [disabled]="!HasBoard" (click)="OnDownloadSvg()">
          <i class="fa-solid fa-bezier-curve" aria-hidden="true"></i> SVG
        </button>
        <button type="button" class="wb-tool-btn" title="Print board" [disabled]="!HasBoard" (click)="OnPrint()">
          <i class="fa-solid fa-print" aria-hidden="true"></i> Print
        </button>
      </div>
      <mj-whiteboard-snapshot class="wb-artifact-board" [StateJson]="ContentJson" />
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
    }
    .wb-artifact-viewer {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
    }
    .wb-artifact-toolbar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      padding: 8px;
      flex-shrink: 0;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
    }
    .wb-tool-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      font-size: 12px;
      cursor: pointer;
      color: var(--mj-text-secondary);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm, 4px);
    }
    .wb-tool-btn:hover:not(:disabled) {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }
    .wb-tool-btn:disabled {
      color: var(--mj-text-disabled);
      cursor: default;
    }
    .wb-artifact-board {
      flex: 1;
      min-height: 0;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'WhiteboardArtifactViewerPlugin')
export class WhiteboardArtifactViewerComponent extends BaseArtifactViewerPluginComponent {
  /** Memoized parse — keyed by the raw content string so version switches re-parse. */
  private parsedForJson: string | null = null;
  private parsedState: WhiteboardState | null = null;

  /** Raw board payload fed to the snapshot component (setter-driven re-parse there). */
  public get ContentJson(): string {
    return this.getRawContent() ?? '';
  }

  /** Rehydrated board engine for export/snapshot duty (null when content is malformed). */
  public get BoardState(): WhiteboardState | null {
    const json = this.getRawContent();
    if (json !== this.parsedForJson) {
      this.parsedForJson = json;
      this.parsedState = ParseBoardStateJson(json);
    }
    return this.parsedState;
  }

  public get HasBoard(): boolean {
    return this.BoardState !== null;
  }

  public override get hasDisplayContent(): boolean {
    return this.HasBoard;
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const state = this.BoardState;
    if (!state) {
      return null;
    }
    const scene = state.BuildSceneSummary();
    const snap = new DataSnapshot();
    snap.title = this.getDisplayTitle() ?? 'Whiteboard';
    snap.interpretation = scene.summary;
    snap.custom = { elementCounts: scene.counts };
    return snap;
  }

  // ────────────────────────────────────────────── export actions (live-board parity)

  /** Download the board as one self-contained HTML document. */
  public OnDownloadHtml(): void {
    const state = this.BoardState;
    if (!state) {
      return;
    }
    this.downloadBlob(this.buildExportHtml(state), 'text/html', `whiteboard-${WhiteboardArtifactViewerComponent.exportDateStamp()}.html`);
  }

  /** Download the board as a standalone SVG document. */
  public OnDownloadSvg(): void {
    const state = this.BoardState;
    if (!state) {
      return;
    }
    this.downloadBlob(BuildWhiteboardExportSvg(state), 'image/svg+xml', `whiteboard-${WhiteboardArtifactViewerComponent.exportDateStamp()}.svg`);
  }

  /**
   * Print the board: open a blank window, write the self-contained export document and
   * invoke the print dialog (same precedent as the live board host's print path). When
   * the popup is blocked this is a logged no-op — nothing breaks, the user can retry.
   */
  public OnPrint(): void {
    const state = this.BoardState;
    if (!state) {
      return;
    }
    const printWindow = window.open('about:blank', '_blank');
    if (!printWindow) {
      console.warn('Whiteboard print: popup was blocked — allow popups for this site and retry.');
      return;
    }
    printWindow.document.write(this.buildExportHtml(state));
    printWindow.document.close();
    printWindow.focus();
    // let the document lay out before invoking the dialog (artifact-viewer precedent)
    setTimeout(() => printWindow.print(), 250);
  }

  private buildExportHtml(state: WhiteboardState): string {
    return BuildWhiteboardExportHtml(state, {
      Title: this.getDisplayTitle() ?? 'Whiteboard',
      AgentName: 'Agent',
      GeneratedAt: new Date().toLocaleString()
    });
  }

  private downloadBlob(content: string, mimeType: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private static exportDateStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Tree-shaking prevention: the plugin is resolved dynamically through the MJ ClassFactory
 * (keyed by the artifact type's DriverClass), so this static call keeps the @RegisterClass
 * side effect from being eliminated by the bundler.
 */
export function LoadWhiteboardArtifactViewer(): void {
  // intentional no-op — the import side effect performs the registration
}
