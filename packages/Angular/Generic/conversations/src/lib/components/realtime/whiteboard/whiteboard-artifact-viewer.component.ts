import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '@memberjunction/ng-artifacts';
import {
  BuildWhiteboardExportHtml,
  BuildWhiteboardExportSvg,
  ParseBoardStateJson,
  RealtimeWhiteboardHostComponent,
  WhiteboardSnapshotComponent,
  WhiteboardState
} from '@memberjunction/ng-whiteboard';

/**
 * ARTIFACT VIEWER PLUGIN for saved and inline OLE whiteboards (§ 3.4.1 / D12).
 *
 * Supports two modes controlled by `[readonly]`:
 * 1. **Read-Only Mode (`[readonly]="true"`, default)**: Renders `<mj-whiteboard-snapshot>`
 *    with export controls (Download HTML / Download SVG / Print).
 * 2. **Inline OLE Canvas Mode (`[readonly]="false"`)**: Renders the full interactive
 *    `<mj-realtime-whiteboard-host [State]="EditableBoardState" [ShowFocusToggle]="false">`
 *    canvas (pen, sticky notes, shapes, connectors, text, undo/redo, zoom/pan, pages) and
 *    emits `ContentCommitted` with `state.ToJSON()` when the user commits edits.
 *
 * Resolved dynamically by the artifact plugin host via the MJ ClassFactory (keyed by the
 * artifact type's DriverClass), which instantiates the class ONCE with a bare `new` to
 * discover the component type — so this class must stay constructible outside an Angular
 * injection context (no `inject()` field initializers, no constructor DI).
 */
@Component({
  standalone: true,
  selector: 'mj-whiteboard-artifact-viewer',
  imports: [WhiteboardSnapshotComponent, RealtimeWhiteboardHostComponent],
  template: `
    <div [class]="'wb-artifact-viewer ' + (cssClass || '')" [style.height]="height || null">
      <div class="wb-artifact-toolbar">
        <div class="wb-toolbar-mode-badge">
          @if (!readonly) {
            <span class="wb-mode-pill wb-mode-pill--live">
              <i class="fa-solid fa-pen-ruler" aria-hidden="true"></i> Interactive Canvas
            </span>
          } @else {
            <span class="wb-mode-pill">
              <i class="fa-solid fa-chalkboard" aria-hidden="true"></i> Whiteboard Snapshot
            </span>
          }
        </div>
        <div class="wb-toolbar-actions">
          @if (!readonly) {
            <button
              type="button"
              class="wb-tool-btn wb-tool-btn--primary"
              [disabled]="!IsDirty"
              title="Save and commit whiteboard changes to artifact version"
              (click)="OnCommitInlineChanges()"
            >
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save / Commit Changes
            </button>
          }
          <button type="button" class="wb-tool-btn" title="Download as HTML" [disabled]="!HasBoard && readonly" (click)="OnDownloadHtml()">
            <i class="fa-solid fa-file-code" aria-hidden="true"></i> HTML
          </button>
          <button type="button" class="wb-tool-btn" title="Download as SVG" [disabled]="!HasBoard && readonly" (click)="OnDownloadSvg()">
            <i class="fa-solid fa-bezier-curve" aria-hidden="true"></i> SVG
          </button>
          <button type="button" class="wb-tool-btn" title="Print board" [disabled]="!HasBoard && readonly" (click)="OnPrint()">
            <i class="fa-solid fa-print" aria-hidden="true"></i> Print
          </button>
        </div>
      </div>
      @if (!readonly && EditableBoardState) {
        <mj-realtime-whiteboard-host
          class="wb-artifact-board wb-artifact-board--interactive"
          [State]="EditableBoardState"
          [ShowFocusToggle]="false"
        />
      } @else {
        <mj-whiteboard-snapshot class="wb-artifact-board" [StateJson]="ContentJson" />
      }
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
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      flex-shrink: 0;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
    }
    .wb-toolbar-mode-badge {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wb-mode-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: var(--mj-radius-sm, 4px);
      color: var(--mj-text-secondary);
      background: var(--mj-bg-surface-sunken);
    }
    .wb-mode-pill--live {
      color: var(--mj-brand-primary);
      background: var(--mj-bg-surface-hover);
      border: 1px solid var(--mj-brand-primary);
    }
    .wb-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
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
    .wb-tool-btn--primary {
      color: var(--mj-text-inverse);
      background: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
      font-weight: 600;
    }
    .wb-tool-btn--primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
      border-color: var(--mj-brand-primary-hover);
      color: var(--mj-text-inverse);
    }
    .wb-tool-btn:disabled {
      color: var(--mj-text-disabled);
      cursor: default;
    }
    .wb-artifact-board {
      flex: 1;
      min-height: 0;
    }
    .wb-artifact-board--interactive {
      min-height: 420px;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'WhiteboardArtifactViewerPlugin')
export class WhiteboardArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnDestroy {
  /** Memoized parse — keyed by the raw content string so version switches re-parse. */
  private parsedForJson: string | null = null;
  private parsedState: WhiteboardState | null = null;
  private editableState: WhiteboardState | null = null;
  private stateChangeSub: Subscription | null = null;
  private hasUncommittedChanges = false;
  private suppressStateChangeTracking = false;

  /** Whether the inline editable board has unsaved changes waiting to be committed. */
  public get IsDirty(): boolean {
    return this.hasUncommittedChanges;
  }

  /** Declares that WhiteboardArtifactViewerComponent supports inline OLE canvas editing when `[readonly]="false"`. */
  public override get SupportsInlineEdit(): boolean {
    return true;
  }

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
      this.syncEditableState(this.parsedState);
    }
    return this.parsedState;
  }

  /**
   * Always-non-null {@link WhiteboardState} used when `[readonly]="false"` so even a brand-new
   * inline Whiteboard can be drawn on immediately.
   */
  public get EditableBoardState(): WhiteboardState {
    const current = this.BoardState;
    if (!this.editableState) {
      this.syncEditableState(current);
    }
    return this.editableState!;
  }

  public get HasBoard(): boolean {
    return this.BoardState !== null;
  }

  public override get hasDisplayContent(): boolean {
    return this.HasBoard || !this.readonly;
  }

  public ngOnDestroy(): void {
    this.teardownStateSub();
  }

  /**
   * Emits the current serialized `WhiteboardState.ToJSON()` payload on `ContentCommitted`
   * so the host (OLE block host or artifact viewer panel) persists a new `MJ: Artifact Versions` record.
   * Keeps `parsedForJson` synchronized with the committed JSON so the host's updated version input
   * does not recreate `editableState` mid-session.
   */
  public CommitCurrentState(): void {
    const state = this.editableState ?? this.BoardState;
    if (!state) {
      return;
    }
    this.hasUncommittedChanges = false;
    const serialized = state.ToJSON();
    this.parsedForJson = serialized;
    this.parsedState = state;
    this.ContentCommitted.emit(serialized);
  }

  /**
   * Emits the current serialized `WhiteboardState.ToJSON()` payload on `ContentCommitted`
   * so the host (OLE block host or artifact viewer panel) persists a new `MJ: Artifact Versions` record.
   */
  public OnCommitInlineChanges(): void {
    this.CommitCurrentState();
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const state = !this.readonly && this.editableState ? this.editableState : this.BoardState;
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
    const state = !this.readonly && this.editableState ? this.editableState : this.BoardState;
    if (!state) {
      return;
    }
    this.downloadBlob(this.buildExportHtml(state), 'text/html', `whiteboard-${WhiteboardArtifactViewerComponent.exportDateStamp()}.html`);
  }

  /** Download the board as a standalone SVG document. */
  public OnDownloadSvg(): void {
    const state = !this.readonly && this.editableState ? this.editableState : this.BoardState;
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
    const state = !this.readonly && this.editableState ? this.editableState : this.BoardState;
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
    setTimeout(() => printWindow.print(), 250);
  }

  private syncEditableState(parsed: WhiteboardState | null): void {
    this.teardownStateSub();
    this.suppressStateChangeTracking = true;
    this.editableState = parsed ?? new WhiteboardState();
    this.hasUncommittedChanges = false;
    this.stateChangeSub = this.editableState.Changed$.subscribe(() => {
      if (this.suppressStateChangeTracking || this.readonly) {
        return;
      }
      this.hasUncommittedChanges = true;
    });
    this.suppressStateChangeTracking = false;
  }

  private teardownStateSub(): void {
    if (this.stateChangeSub) {
      this.stateChangeSub.unsubscribe();
      this.stateChangeSub = null;
    }
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
