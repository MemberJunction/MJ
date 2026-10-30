import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { VideoCaptionMode } from '@memberjunction/video-studio-core';
import { VSProductionBriefStateSnapshot } from '../components/vs-production-brief.component';
import {
  ArchetypeCardSnapshot,
  BrandKitCardSnapshot,
  BuildStudioAppContext,
  BuildStudioBriefClientTools,
  StudioAppContextPayload,
  StudioBriefClientToolDefinition,
  StudioBriefComponentHandle,
  StudioVideoFormat,
} from '../video-studio-agent-context';

export interface VSStudioSlideInStateSnapshot {
  IsOpen: boolean;
  ConversationId: string | null;
  PendingArtifactId: string | null;
  PendingArtifactVersionNumber: number | null;
  BriefArchetypes: ArchetypeCardSnapshot[];
  BriefBrandKits: BrandKitCardSnapshot[];
  BriefSelectedArchetype: ArchetypeCardSnapshot | null;
  BriefSelectedBrandKit: BrandKitCardSnapshot | null;
  BriefSelectedFormats: string[];
  BriefDurationSeconds: number;
  BriefTopic: string;
  NarrationEnabled: boolean;
  CaptionsMode: VideoCaptionMode;
}

export interface VSStudioBriefToolsOptions {
  GetBriefComponent?: () => StudioBriefComponentHandle | null | undefined;
  GetFallbackArchetypes?: () => readonly ArchetypeCardSnapshot[];
  GetFallbackBrandKits?: () => readonly BrandKitCardSnapshot[];
  OnBriefMutated?: () => void;
}

/**
 * Root-provided UI-state service for the shared Video Studio right slide-in.
 *
 * Holds open/closed state, the active conversation ID, pending iteration artifact
 * metadata, and the in-memory production brief selections so the slide-in state
 * and active conversation survive moving between Productions, Brand Kits, and
 * Archetypes (UI state only: no data access, no `localStorage`).
 */
@Injectable({ providedIn: 'root' })
export class VSStudioSlideInStateService {
  public IsOpen = false;
  public ConversationId: string | null = null;
  public PendingArtifactId: string | null = null;
  public PendingArtifactVersionNumber: number | null = null;

  public BriefArchetypes: ArchetypeCardSnapshot[] = [];
  public BriefBrandKits: BrandKitCardSnapshot[] = [];
  public BriefSelectedArchetype: ArchetypeCardSnapshot | null = null;
  public BriefSelectedBrandKit: BrandKitCardSnapshot | null = null;
  public BriefSelectedFormats: string[] = ['16:9'];
  public BriefDurationSeconds = 30;
  public BriefTopic = '';
  public NarrationEnabled = true;
  public CaptionsMode: VideoCaptionMode = 'Burned';

  private readonly stateSubject = new BehaviorSubject<VSStudioSlideInStateSnapshot>(
    this.snapshot(),
  );

  public readonly State$: Observable<VSStudioSlideInStateSnapshot> =
    this.stateSubject.asObservable();

  public get IsBriefShowing(): boolean {
    return (this.ConversationId ?? '').trim().length === 0;
  }

  /**
   * Opens the slide-in on a brand-new conversation (`ConversationId = null`),
   * displaying `<vs-production-brief>` in the chat area's `emptyState` slot.
   */
  public OpenNewProduction(): void {
    this.ConversationId = null;
    this.PendingArtifactId = null;
    this.PendingArtifactVersionNumber = null;
    this.IsOpen = true;
    this.emitState();
  }

  /**
   * Reopens the slide-in from the right-edge strip, preserving any active
   * conversation or showing the brief when `ConversationId` is `null`.
   */
  public Reopen(): void {
    this.IsOpen = true;
    this.emitState();
  }

  /**
   * Closes the slide-in while preserving `ConversationId` so reopening from
   * the edge strip on any Video Studio page restores the active conversation.
   */
  public Close(): void {
    this.IsOpen = false;
    this.PendingArtifactId = null;
    this.PendingArtifactVersionNumber = null;
    this.emitState();
  }

  public Toggle(): void {
    if (this.IsOpen) {
      this.Close();
    } else {
      this.Reopen();
    }
  }

  /**
   * Opens the slide-in on an existing production's conversation with the
   * artifact queued for iteration.
   */
  public OpenIterate(
    conversationId: string,
    artifactId: string,
    versionNumber: number,
  ): void {
    this.ConversationId = conversationId;
    this.PendingArtifactId = artifactId;
    this.PendingArtifactVersionNumber = versionNumber;
    this.IsOpen = true;
    this.emitState();
  }

  public SetConversationId(conversationId: string | null): void {
    this.ConversationId = conversationId;
    this.emitState();
  }

  public ClearPendingArtifact(): void {
    this.PendingArtifactId = null;
    this.PendingArtifactVersionNumber = null;
    this.emitState();
  }

  public SetNarrationEnabled(enabled: boolean): void {
    this.NarrationEnabled = enabled;
    this.emitState();
  }

  public SetCaptionsMode(mode: VideoCaptionMode): void {
    this.CaptionsMode = mode;
    this.emitState();
  }

  public ApplyBriefSnapshot(snapshot: VSProductionBriefStateSnapshot): void {
    this.BriefArchetypes = [...snapshot.AllArchetypes];
    this.BriefBrandKits = [...snapshot.AllBrandKits];
    this.BriefSelectedArchetype = snapshot.SelectedArchetype;
    this.BriefSelectedBrandKit = snapshot.SelectedBrandKit;
    this.BriefSelectedFormats = [...snapshot.SelectedFormats];
    this.BriefDurationSeconds = snapshot.DurationSeconds;
    this.BriefTopic = snapshot.Topic;
    this.NarrationEnabled = snapshot.NarrationEnabled;
    this.CaptionsMode = snapshot.CaptionsMode;
    this.emitState();
  }

  public BuildStudioAppContextPayload(
    fallbackBrandKitId: string | null = null,
  ): { VideoStudio: StudioAppContextPayload } {
    return BuildStudioAppContext({
      ArchetypeID: this.BriefSelectedArchetype?.ID ?? null,
      BrandKitID: this.BriefSelectedBrandKit?.ID ?? fallbackBrandKitId,
      Formats:
        this.BriefSelectedFormats.length > 0 ? this.BriefSelectedFormats : ['16:9'],
      DurationSeconds: this.BriefDurationSeconds,
      QueryIDs: [],
      NarrationEnabled: this.NarrationEnabled ? undefined : false,
      CaptionsMode: this.CaptionsMode === 'Burned' ? undefined : this.CaptionsMode,
    });
  }

  /**
   * Combines the current page's agent context (`Surface`, counts, filters, selection)
   * with the `VideoStudio` brief context payload so the slide-in agent knows both
   * which page the user is viewing and the current brief selections.
   */
  public BuildCombinedAppContext(
    pageContext: Record<string, unknown> | null | undefined,
    fallbackBrandKitId: string | null = null,
  ): Record<string, unknown> {
    return {
      ...(pageContext ?? {}),
      ...this.BuildStudioAppContextPayload(fallbackBrandKitId),
    };
  }

  /**
   * Builds the four Studio brief client tools (`SelectStudioArchetype`,
   * `SelectStudioBrandKit`, `SetStudioFormats`, `SetStudioTopic`) when the brief
   * is showing (`ConversationId === null`), or returns `[]` when an active
   * conversation is open in the slide-in.
   */
  public BuildBriefClientTools(
    options: VSStudioBriefToolsOptions = {},
  ): StudioBriefClientToolDefinition[] {
    if (!this.IsBriefShowing) {
      return [];
    }
    return BuildStudioBriefClientTools({
      GetBriefComponent: options.GetBriefComponent,
      GetArchetypes: () =>
        this.BriefArchetypes.length > 0
          ? this.BriefArchetypes
          : (options.GetFallbackArchetypes?.() ?? []),
      GetBrandKits: () =>
        this.BriefBrandKits.length > 0
          ? this.BriefBrandKits
          : (options.GetFallbackBrandKits?.() ?? []),
      OnArchetypeSelected: (
        archetype: ArchetypeCardSnapshot,
        formats: StudioVideoFormat[],
        durationSeconds: number,
      ) => {
        this.BriefSelectedArchetype = archetype;
        this.BriefSelectedFormats = [...formats];
        this.BriefDurationSeconds = durationSeconds;
        this.emitState();
        options.OnBriefMutated?.();
      },
      OnBrandKitSelected: (brandKit: BrandKitCardSnapshot | null) => {
        this.BriefSelectedBrandKit = brandKit;
        this.emitState();
        options.OnBriefMutated?.();
      },
      OnFormatsSelected: (formats: StudioVideoFormat[]) => {
        this.BriefSelectedFormats = [...formats];
        this.emitState();
        options.OnBriefMutated?.();
      },
      OnTopicChanged: (topic: string) => {
        this.BriefTopic = topic;
        this.emitState();
        options.OnBriefMutated?.();
      },
    });
  }

  public Reset(): void {
    this.IsOpen = false;
    this.ConversationId = null;
    this.PendingArtifactId = null;
    this.PendingArtifactVersionNumber = null;
    this.BriefArchetypes = [];
    this.BriefBrandKits = [];
    this.BriefSelectedArchetype = null;
    this.BriefSelectedBrandKit = null;
    this.BriefSelectedFormats = ['16:9'];
    this.BriefDurationSeconds = 30;
    this.BriefTopic = '';
    this.NarrationEnabled = true;
    this.CaptionsMode = 'Burned';
    this.emitState();
  }

  private snapshot(): VSStudioSlideInStateSnapshot {
    return {
      IsOpen: this.IsOpen,
      ConversationId: this.ConversationId,
      PendingArtifactId: this.PendingArtifactId,
      PendingArtifactVersionNumber: this.PendingArtifactVersionNumber,
      BriefArchetypes: [...this.BriefArchetypes],
      BriefBrandKits: [...this.BriefBrandKits],
      BriefSelectedArchetype: this.BriefSelectedArchetype,
      BriefSelectedBrandKit: this.BriefSelectedBrandKit,
      BriefSelectedFormats: [...this.BriefSelectedFormats],
      BriefDurationSeconds: this.BriefDurationSeconds,
      BriefTopic: this.BriefTopic,
      NarrationEnabled: this.NarrationEnabled,
      CaptionsMode: this.CaptionsMode,
    };
  }

  private emitState(): void {
    this.stateSubject.next(this.snapshot());
  }
}
