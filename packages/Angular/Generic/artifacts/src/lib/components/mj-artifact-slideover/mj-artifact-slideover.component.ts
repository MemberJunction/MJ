import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ArtifactVersionSavedEvent } from '../artifact-viewer-panel.component';
import {
  ArtifactSlideoverNavigateLinkPayload,
  ArtifactSlideoverState,
  MJArtifactSlideoverService,
} from '../../services/mj-artifact-slideover.service';

/**
 * Reusable slideover drawer wrapping `<mj-artifact-viewer-panel>` driven by {@link MJArtifactSlideoverService}.
 *
 * Supports Escape-to-close keyboard handling, maximize toggle persisted via `UserInfoEngine.Instance`,
 * `NavigateToLink` artifact chaining with back navigation, and read-only / edit permission forwarding.
 */
@Component({
  standalone: false,
  selector: 'mj-artifact-slideover',
  templateUrl: './mj-artifact-slideover.component.html',
  styleUrls: ['./mj-artifact-slideover.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJArtifactSlideoverComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private readonly slideoverService = inject(MJArtifactSlideoverService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  /** Whether clicking the backdrop closes the slideover drawer. */
  @Input() public CloseOnBackdropClick = true;

  /** Fallback `UserInfo` used when an open request omits `CurrentUser`. */
  @Input() public FallbackCurrentUser: UserInfo | null = null;

  /** Fallback `EnvironmentId` used when an open request omits `EnvironmentId`. */
  @Input() public FallbackEnvironmentId = '';

  /** Emitted when the slideover closes (via close button, backdrop click, or Escape key). */
  @Output() public Closed = new EventEmitter<void>();

  /** Emitted when a non-artifact entity record link is clicked inside the slideover. */
  @Output() public OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();

  /** Emitted when `NavigateToLink` resolves to an external conversation, collection, or non-artifact record. */
  @Output() public ExternalNavigate = new EventEmitter<ArtifactSlideoverNavigateLinkPayload>();

  /** Emitted whenever the displayed artifact saves a new version. */
  @Output() public VersionSaved = new EventEmitter<ArtifactVersionSavedEvent>();

  public State: ArtifactSlideoverState = this.slideoverService.CurrentState;

  public get EffectiveProvider(): IMetadataProvider | null {
    return this.State.CurrentRequest?.Provider ?? this.Provider;
  }

  public get EffectiveCurrentUser(): UserInfo | undefined {
    return this.State.CurrentRequest?.CurrentUser ?? this.FallbackCurrentUser ?? this.ProviderToUse?.CurrentUser;
  }

  public get EffectiveEnvironmentId(): string {
    return this.State.CurrentRequest?.EnvironmentId ?? this.FallbackEnvironmentId;
  }

  public get CanGoBack(): boolean {
    return this.State.HistoryStack.length > 0;
  }

  public ngOnInit(): void {
    this.slideoverService.State$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
      this.State = state;
      this.cdr.markForCheck();
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Closes the active slideover when the user presses `Escape`. */
  @HostListener('document:keydown.escape', ['$event'])
  public OnEscapeKey(event: Event): void {
    if (!this.State.IsOpen) {
      return;
    }
    event.preventDefault();
    this.OnClose();
  }

  public OnBackdropClick(): void {
    if (this.CloseOnBackdropClick && this.State.IsOpen) {
      this.OnClose();
    }
  }

  public OnClose(): void {
    this.slideoverService.Close();
    this.Closed.emit();
  }

  public OnToggleMaximize(): void {
    this.slideoverService.ToggleMaximize();
  }

  public OnGoBack(): void {
    this.slideoverService.GoBack();
  }

  public OnPanelVersionSaved(event: ArtifactVersionSavedEvent): void {
    this.slideoverService.NotifyVersionSaved(event);
    this.VersionSaved.emit(event);
  }

  public OnPanelNavigateToLink(link: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
    versionId?: string;
  }): void {
    const payload: ArtifactSlideoverNavigateLinkPayload = link.artifactId
      ? {
          Type: 'artifact',
          ArtifactID: link.artifactId,
          VersionNumber: link.versionNumber,
          ID: link.id,
        }
      : {
          Type: link.type,
          ID: link.id,
          VersionNumber: link.versionNumber,
        };

    const handledInternally = this.slideoverService.NavigateToLink(payload);
    if (!handledInternally) {
      this.ExternalNavigate.emit(payload);
    }
  }

  public OnPanelOpenArtifactRequested(artifactId: string): void {
    if (!artifactId?.trim()) {
      return;
    }
    this.slideoverService.NavigateToLink({
      Type: 'artifact',
      ArtifactID: artifactId.trim(),
    });
  }

  public OnPanelOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
    if (event.entityName?.trim().toLowerCase() === 'mj: artifacts') {
      const idVal = event.compositeKey?.GetValueByFieldName('ID');
      if (idVal) {
        this.slideoverService.NavigateToLink({
          Type: 'artifact',
          ArtifactID: String(idVal),
        });
        return;
      }
    }
    this.OpenEntityRecord.emit(event);
  }
}
