import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
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
  @Input() CurrentUser: UserInfo | null = null;
  @Input() EnvironmentId: string = MJEnvironmentEntityExtended.DefaultEnvironmentID;
  @Input() ApplicationId = '';
  @Input() PageSource: BaseResourceComponent | null = null;
  @Input() PageContext: Record<string, unknown> | null = null;
  @Input() AppContext: Record<string, unknown> | null = null;
  @Input() PageTools: StudioBriefClientToolDefinition[] = [];
  @Input() FallbackBrandKitId: string | null = null;
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
  private readonly navigationService = inject(NavigationService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private stateSub: Subscription | null = null;
  private lastBriefShowingState: boolean | null = null;

  ngOnInit(): void {
    this.lastBriefShowingState = this.SlideInState.IsBriefShowing;
    this.registerCombinedClientTools();
    this.stateSub = this.SlideInState.State$.subscribe(() => {
      if (this.lastBriefShowingState !== this.SlideInState.IsBriefShowing) {
        this.lastBriefShowingState = this.SlideInState.IsBriefShowing;
        this.registerCombinedClientTools();
      }
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['PageTools'] && !changes['PageTools'].firstChange) {
      this.registerCombinedClientTools();
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

  public get EffectiveAppContext(): Record<string, unknown> {
    return this.SlideInState.BuildCombinedAppContext(
      this.PageContext ?? this.AppContext,
      this.FallbackBrandKitId,
    );
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

  @HostListener('document:keydown.escape', ['$event'])
  public OnEscapeKeydown(event: Event): void {
    if (!this.IsOpen || event.defaultPrevented) {
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

  private registerCombinedClientTools(): void {
    if (!this.navigationService || !this.PageSource) {
      return;
    }
    const briefTools = this.SlideInState.BuildBriefClientTools({
      Provider: this.ProviderToUse,
      GetBriefComponent: () => this.CopilotPanel?.BriefComponent,
      OnBriefMutated: () => {
        this.cdr.markForCheck();
      },
    });
    this.navigationService.SetAgentClientTools(this.PageSource, [
      ...this.PageTools,
      ...briefTools,
    ]);
  }
}
