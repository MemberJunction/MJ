import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import type { UserInfo } from '@memberjunction/core';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { ArtifactWorkspaceEngine } from './artifact-workspace-engine';
import type { ArtifactWorkspaceRecord } from './artifact-workspace-types';

/**
 * Live tab-managed workspace surface for the `ArtifactWorkspace` realtime channel.
 * Hosts collaborative Docs, Spreadsheets, Slide Decks, and Whiteboards side-by-side
 * with a live voice/co-agent session via `<mj-artifact-viewer-panel>`.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-artifact-workspace-surface',
  imports: [ArtifactsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="aw-surface" data-testid="artifact-workspace-surface">
      @if (Instances.length === 0) {
        <div class="aw-empty">
          <i class="fa-solid fa-file-lines aw-empty__icon" aria-hidden="true"></i>
          <p class="aw-empty__title">No workspace document open</p>
          <p class="aw-empty__hint">
            {{ AgentName }} can open or build Docs, Spreadsheets, and Slide Decks here for live collaboration.
          </p>
        </div>
      } @else {
        <div class="aw-tabbar">
          <div class="aw-tabs" role="tablist" aria-label="Open workspace artifacts">
            @for (record of Instances; track record.InstanceID) {
              <button
                type="button"
                class="aw-tab"
                role="tab"
                [id]="'aw-tab-' + record.InstanceID"
                [class.aw-tab--active]="record.InstanceID === ActiveID"
                [attr.aria-selected]="record.InstanceID === ActiveID"
                [attr.aria-controls]="'aw-panel-' + record.InstanceID"
                [attr.tabindex]="record.InstanceID === ActiveID ? 0 : -1"
                [attr.data-instance]="record.InstanceID"
                [title]="record.Name"
                (click)="SelectTab(record.InstanceID)"
              >
                <i [class]="IconForType(record)" aria-hidden="true"></i>
                <span class="aw-tab__name">{{ record.Name }}</span>
                @if (record.VersionNumber) {
                  <span class="aw-tab__version">v{{ record.VersionNumber }}</span>
                }
              </button>
            }
          </div>
          @if (ActiveRecord; as active) {
            <button
              type="button"
              class="aw-close"
              [attr.aria-label]="'Close ' + active.Name"
              [title]="'Close ' + active.Name"
              (click)="CloseTab(active.InstanceID)"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          }
        </div>
        <div class="aw-panes">
          @if (ActiveRecord; as active) {
            <div
              class="aw-pane"
              role="tabpanel"
              [id]="'aw-panel-' + active.InstanceID"
              [attr.aria-labelledby]="'aw-tab-' + active.InstanceID"
              [attr.data-instance]="active.InstanceID"
            >
              @if (CurrentUser; as user) {
                <mj-artifact-viewer-panel
                  [artifactId]="active.ArtifactID"
                  [versionNumber]="active.VersionNumber"
                  [currentUser]="user"
                  [Provider]="Provider"
                  [environmentId]="EnvironmentID"
                  [refreshTrigger]="RefreshTrigger$"
                  [canEdit]="active.CanEdit ?? false"
                  [showHeader]="false"
                  [showTabs]="false"
                  [showSaveToCollection]="false"
                  [showCloseButton]="false"
                  [showMaximizeButton]="false"
                ></mj-artifact-viewer-panel>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        min-height: 0;
      }
      .aw-surface {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        min-height: 0;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
      }
      .aw-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        color: var(--mj-text-secondary);
      }
      .aw-empty__icon {
        font-size: 28px;
        color: var(--mj-brand-primary);
        opacity: 0.75;
      }
      .aw-empty__title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .aw-empty__hint {
        margin: 0;
        font-size: 12px;
        max-width: 320px;
      }
      .aw-tabbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 10px;
        background: var(--mj-bg-surface-sunken);
        border-bottom: 1px solid var(--mj-border-default);
        flex-shrink: 0;
      }
      .aw-tabs {
        display: flex;
        align-items: center;
        gap: 4px;
        overflow-x: auto;
        min-width: 0;
      }
      .aw-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--mj-text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }
      .aw-tab:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }
      .aw-tab--active {
        background: var(--mj-bg-surface);
        border-color: var(--mj-border-default);
        color: var(--mj-text-primary);
        font-weight: 600;
      }
      .aw-tab__name {
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .aw-tab__version {
        font-size: 11px;
        color: var(--mj-text-muted);
      }
      .aw-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-subtle);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
        flex-shrink: 0;
      }
      .aw-close:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }
      .aw-panes {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .aw-pane {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .aw-pane > mj-artifact-viewer-panel {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class RealtimeArtifactWorkspaceSurfaceComponent
  extends BaseAngularComponent
  implements OnInit, OnDestroy
{
  private _engine: ArtifactWorkspaceEngine | null = null;
  private subscription: Subscription | null = null;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() public AgentName = 'The agent';
  @Input() public CurrentUser: UserInfo | null = null;
  @Input() public EnvironmentID = '';

  @Input()
  public set Engine(value: ArtifactWorkspaceEngine | null) {
    if (value === this._engine) {
      return;
    }
    this._engine = value;
    this.resubscribe();
  }
  public get Engine(): ArtifactWorkspaceEngine | null {
    return this._engine;
  }

  public Instances: readonly ArtifactWorkspaceRecord[] = [];
  public ActiveID: string | null = null;
  public OnUserSelected: ((instanceId: string) => void) | null = null;
  public OnUserClosed: ((instanceId: string) => void) | null = null;

  public get RefreshTrigger$() {
    return this._engine?.RefreshTrigger$;
  }

  public get ActiveRecord(): ArtifactWorkspaceRecord | null {
    return this.Instances.find((r) => r.InstanceID === this.ActiveID) ?? null;
  }

  public ngOnInit(): void {
    this.resubscribe();
  }

  public ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  public SelectTab(instanceId: string): void {
    this._engine?.SetActive(instanceId);
    this.OnUserSelected?.(instanceId);
  }

  public CloseTab(instanceId: string): void {
    this._engine?.Remove(instanceId);
    this.OnUserClosed?.(instanceId);
  }

  public GetActiveElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector<HTMLElement>('.aw-pane');
  }

  public IconForType(record: ArtifactWorkspaceRecord): string {
    const t = record.ArtifactTypeName?.trim().toLowerCase() ?? '';
    if (t.includes('spreadsheet') || t.includes('excel')) {
      return 'fa-solid fa-table';
    }
    if (t.includes('presentation') || t.includes('slide')) {
      return 'fa-solid fa-display';
    }
    if (t.includes('whiteboard')) {
      return 'fa-solid fa-diagram-project';
    }
    return 'fa-solid fa-file-lines';
  }

  private resubscribe(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (!this._engine) {
      this.Instances = [];
      this.ActiveID = null;
      return;
    }
    this.syncFromEngine();
    this.subscription = this._engine.Changed$.subscribe(() => {
      this.syncFromEngine();
      this.cdr.markForCheck();
    });
  }

  private syncFromEngine(): void {
    if (!this._engine) {
      return;
    }
    this.Instances = this._engine.Instances;
    this.ActiveID = this._engine.ActiveID;
  }
}
