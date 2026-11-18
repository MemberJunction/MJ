import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { VSStudioSlideInStateService } from '../services/vs-studio-slide-in-state.service';
import { StudioBriefClientToolDefinition } from '../video-studio-agent-context';
import {
  VSCopilotConversationCreatedEvent,
  VSCopilotPanelComponent,
} from './vs-copilot-panel.component';
import {
  VSProductionBriefStartEvent,
  VSProductionBriefStateSnapshot,
} from './vs-production-brief.component';

/**
 * Shared right-side Video Studio slide-in host (`vs-studio-slide-in`).
 *
 * Renders the collapsed right-edge reopen strip (`button.vs-copilot-strip`) when closed
 * and the `<aside class="vs-copilot-slidein">` wrapping `<vs-copilot-panel>` when open.
 * Backed by the root-provided {@link VSStudioSlideInStateService} so open/closed state
 * and the active conversation ID survive navigation across Productions, Brand Kits,
 * and Archetypes. Also combines the hosting resource page's `[PageContext]` and `[PageTools]`
 * with the Video Studio brief context and brief form-fill client tools.
 */
@Component({
  standalone: true,
  selector: 'vs-studio-slide-in',
  imports: [CommonModule, VSCopilotPanelComponent],
  templateUrl: './vs-studio-slide-in.component.html',
  styleUrls: ['./vs-studio-slide-in.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'vs-studio-slide-in',
    '[class.vs-studio-slide-in--open]': 'IsOpen',
  },
})
export class VSStudioSlideInComponent
  extends BaseAngularComponent
  implements OnInit, OnChanges, OnDestroy
{
  private _pageContext: Record<string, unknown> | null = null;
  private _appContext: Record<string, unknown> | null = null;
  private _fallbackBrandKitId: string | null = null;

  @Input() CurrentUser: UserInfo | null = null;
  @Input() EnvironmentId: string = MJEnvironmentEntityExtended.DefaultEnvironmentID;
  @Input() ApplicationId = '';
  @Input() PageSource: BaseResourceComponent | null = null;
  @Input()
  set PageContext(value: Record<string, unknown> | null) {
    this._pageContext = value;
    this.rebuildEffectiveAppContext();
  }
  get PageContext(): Record<string, unknown> | null {
    return this._pageContext;
  }
  @Input()
  set AppContext(value: Record<string, unknown> | null) {
    this._appContext = value;
    this.rebuildEffectiveAppContext();
  }
  get AppContext(): Record<string, unknown> | null {
    return this._appContext;
  }
  @Input() PageTools: StudioBriefClientToolDefinition[] = [];
  @Input()
  set FallbackBrandKitId(value: string | null) {
    this._fallbackBrandKitId = value;
    this.rebuildEffectiveAppContext();
  }
  get FallbackBrandKitId(): string | null {
    return this._fallbackBrandKitId;
  }
  @Input() HeaderTitle = 'Video Studio';

  @Output() OpenChange = new EventEmitter<boolean>();
  @Output() ConversationCreated = new EventEmitter<VSCopilotConversationCreatedEvent>();
  @Output() PendingArtifactConsumed = new EventEmitter<void>();
  @Output() BriefStateChange = new EventEmitter<VSProductionBriefStateSnapshot>();
  @Output() BriefStartRequested = new EventEmitter<VSProductionBriefStartEvent>();
  @Output() NavigationRequest = new EventEmitter<NavigationRequest>();

  @ViewChild('copilotPanel')
  public CopilotPanel?: VSCopilotPanelComponent;

  public readonly SlideInState = inject(VSStudioSlideInStateService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly navigationService = inject(NavigationService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private stateSub: Subscription | null = null;
  private lastBriefShowingState: boolean | null = null;

  public EffectiveAppContext: Record<string, unknown> =
    this.SlideInState.BuildCombinedAppContext(null, null);

  ngOnInit(): void {
    this.lastBriefShowingState = this.SlideInState.IsBriefShowing;
    this.rebuildEffectiveAppContext();
    this.registerCombinedClientTools();
    this.stateSub = this.SlideInState.State$.subscribe((snapshot) => {
      this.rebuildEffectiveAppContext();
      if (this.lastBriefShowingState !== this.SlideInState.IsBriefShowing) {
        this.lastBriefShowingState = this.SlideInState.IsBriefShowing;
        this.registerCombinedClientTools();
      }
      if (
        snapshot.PendingArtifactId &&
        snapshot.ConversationId &&
        this.CopilotPanel &&
        UUIDsEqual(snapshot.ConversationId, this.CopilotPanel.ConversationId)
      ) {
        this.CopilotPanel.OpenIterateArtifact(
          snapshot.PendingArtifactId,
          snapshot.PendingArtifactVersionNumber,
        );
      }
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['PageTools'] && !changes['PageTools'].firstChange) {
      this.registerCombinedClientTools();
    }
    if (
      changes['PageContext'] ||
      changes['AppContext'] ||
      changes['FallbackBrandKitId']
    ) {
      this.rebuildEffectiveAppContext();
    }
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
    this.stateSub = null;
  }

  public get IsOpen(): boolean {
    return this.SlideInState.IsOpen;
  }

  public get ConversationId(): string | null {
    return this.SlideInState.ConversationId;
  }

  public get PendingArtifactId(): string | null {
    return this.SlideInState.PendingArtifactId;
  }

  public get PendingArtifactVersionNumber(): number | null {
    return this.SlideInState.PendingArtifactVersionNumber;
  }

  public get EffectiveCurrentUser(): UserInfo | null {
    return this.CurrentUser ?? this.ProviderToUse?.CurrentUser ?? null;
  }

  public OpenNewProduction(): void {
    this.SlideInState.OpenNewProduction();
    this.OpenChange.emit(true);
    this.cdr.markForCheck();
  }

  public Reopen(): void {
    this.SlideInState.Reopen();
    this.OpenChange.emit(true);
    this.cdr.markForCheck();
  }

  public Close(): void {
    this.SlideInState.Close();
    this.OpenChange.emit(false);
    this.cdr.markForCheck();
  }

  @HostListener('keydown.escape', ['$event'])
  public OnEscapeKeydown(event: Event): void {
    if (!this.IsOpen || event.defaultPrevented) {
      return;
    }
    const target = event.target instanceof Node ? event.target : null;
    if (!target || !this.elementRef.nativeElement.contains(target)) {
      return;
    }
    if (
      target instanceof Element &&
      target.closest(
        'mj-image-viewer, .image-viewer-backdrop, mj-dialog, [role="dialog"], .mj-calendar',
      )
    ) {
      return;
    }
    if (
      this.CopilotPanel?.IsImageViewerOpen ||
      this.CopilotPanel?.IsCreatingConversation
    ) {
      return;
    }
    this.Close();
  }

  public OnConversationCreated(event: VSCopilotConversationCreatedEvent): void {
    this.SlideInState.SetConversationId(event.conversation.ID);
    this.ConversationCreated.emit(event);
    this.cdr.markForCheck();
  }

  public OnPendingArtifactConsumed(): void {
    this.SlideInState.ClearPendingArtifact();
    this.PendingArtifactConsumed.emit();
    this.cdr.markForCheck();
  }

  public OnBriefStateChange(snapshot: VSProductionBriefStateSnapshot): void {
    this.SlideInState.ApplyBriefSnapshot(snapshot);
    this.BriefStateChange.emit(snapshot);
    this.cdr.markForCheck();
  }

  public OnBriefStartRequested(event: VSProductionBriefStartEvent): void {
    this.BriefStartRequested.emit(event);
    this.cdr.markForCheck();
  }

  public OnNavigationRequest(event: NavigationRequest): void {
    this.NavigationRequest.emit(event);
  }

  private rebuildEffectiveAppContext(): void {
    this.EffectiveAppContext = this.SlideInState.BuildCombinedAppContext(
      this._pageContext ?? this._appContext,
      this._fallbackBrandKitId,
    );
  }

  private registerCombinedClientTools(): void {
    if (!this.navigationService || !this.PageSource) {
      return;
    }
    const briefTools = this.SlideInState.BuildBriefClientTools({
      Provider: this.ProviderToUse,
      GetBriefComponent: () => this.CopilotPanel?.BriefComponent,
      OnBriefMutated: () => {
        this.rebuildEffectiveAppContext();
        this.cdr.markForCheck();
      },
    });
    this.navigationService.SetAgentClientTools(this.PageSource, [
      ...this.PageTools,
      ...briefTools,
    ]);
  }
}
