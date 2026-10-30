import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitEntity,
  MJVideoArchetypeEntity,
  VideoStudioEngine,
} from '@memberjunction/core-entities';
import { BehaviorSubject, Observable } from 'rxjs';
import { VideoCaptionMode } from '@memberjunction/video-studio-core';
import { VSProductionBriefStateSnapshot } from '../components/vs-production-brief.component';
import {
  ArchetypeCardSnapshot,
  ArchetypeCategory,
  BrandKitCardSnapshot,
  BuildArchetypeBeatStripItems,
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
  BriefSelectedArchetype: ArchetypeCardSnapshot | null;
  BriefSelectedBrandKit: BrandKitCardSnapshot | null;
  BriefSelectedFormats: string[];
  BriefDurationSeconds: number;
  BriefTopic: string;
  NarrationEnabled: boolean;
  CaptionsMode: VideoCaptionMode;
}

export interface VSStudioBriefToolsOptions {
  Provider?: IMetadataProvider | null;
  GetBriefComponent?: () => StudioBriefComponentHandle | null | undefined;
  OnBriefMutated?: () => void;
}

/**
 * Root-provided UI-state service for the shared Video Studio right slide-in.
 *
 * Holds open/closed state, the active conversation ID, pending iteration artifact
 * metadata, and the in-memory production brief selections so the slide-in state
 * and active conversation survive moving between Productions, Brand Kits, and
 * Archetypes (UI state only: no data arrays, no data access, no `localStorage`).
 */
@Injectable({ providedIn: 'root' })
export class VSStudioSlideInStateService {
  public IsOpen = false;
  public ConversationId: string | null = null;
  public PendingArtifactId: string | null = null;
  public PendingArtifactVersionNumber: number | null = null;

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
      GetArchetypes: () => this.resolveEngineArchetypes(options.Provider),
      GetBrandKits: () => this.resolveEngineBrandKits(options.Provider),
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
    this.BriefSelectedArchetype = null;
    this.BriefSelectedBrandKit = null;
    this.BriefSelectedFormats = ['16:9'];
    this.BriefDurationSeconds = 30;
    this.BriefTopic = '';
    this.NarrationEnabled = true;
    this.CaptionsMode = 'Burned';
    this.emitState();
  }

  private resolveEngineArchetypes(
    provider?: IMetadataProvider | null,
  ): ArchetypeCardSnapshot[] {
    try {
      const engine = VideoStudioEngine.GetProviderInstance<VideoStudioEngine>(
        provider ?? Metadata.Provider,
        VideoStudioEngine,
      ) as VideoStudioEngine | undefined;
      const archetypes = (engine?.Archetypes ?? []).filter(
        (a: MJVideoArchetypeEntity) => a.Status === 'Active' || !a.Status,
      );
      return archetypes.map((arch: MJVideoArchetypeEntity) => {
        const defaultDur = arch.DefaultDurationSeconds ?? 30;
        const rawBeats = Array.isArray(arch.BeatTemplateObject) ? arch.BeatTemplateObject : [];
        const beatItems = BuildArchetypeBeatStripItems(rawBeats, defaultDur);
        const companyId = arch.CompanyID ?? null;
        return {
          ID: arch.ID,
          Name: arch.Name,
          Description: arch.Description ?? '',
          Category: (arch.Category ?? 'Explainer') as ArchetypeCategory,
          Status: arch.Status === 'Inactive' ? 'Inactive' : 'Active',
          CompanyID: companyId,
          CompanyName: arch.Company ?? null,
          IsShipped: companyId === null,
          DefaultDurationSeconds: defaultDur,
          MinDurationSeconds: arch.MinDurationSeconds ?? 15,
          MaxDurationSeconds: arch.MaxDurationSeconds ?? 120,
          DefaultFormats: arch.DefaultFormats ?? '16:9',
          BeatCount: beatItems.length,
          BeatLabels: beatItems.map((b) => b.Label),
          BeatItems: beatItems,
        };
      });
    } catch {
      return [];
    }
  }

  private resolveEngineBrandKits(
    provider?: IMetadataProvider | null,
  ): BrandKitCardSnapshot[] {
    try {
      const engine = BrandKitEngine.GetProviderInstance<BrandKitEngine>(
        provider ?? Metadata.Provider,
        BrandKitEngine,
      ) as BrandKitEngine | undefined;
      const kits = (engine?.BrandKits ?? []).filter(
        (k: MJBrandKitEntity) => k.Status === 'Active' || !k.Status,
      );
      return kits.map((kit: MJBrandKitEntity) => ({
        ID: kit.ID,
        Name: kit.Name,
        Description: kit.Description ?? '',
        CompanyID: kit.CompanyID ?? null,
        CompanyName: kit.Company ?? null,
        IsDefault: Boolean(kit.IsDefault),
        Status: kit.Status === 'Inactive' ? 'Inactive' : 'Active',
        Swatches: [],
        PrimaryLogoFileID: null,
        PrimaryLogoUrl: null,
        AssetCount: 0,
      }));
    } catch {
      return [];
    }
  }

  private snapshot(): VSStudioSlideInStateSnapshot {
    return {
      IsOpen: this.IsOpen,
      ConversationId: this.ConversationId,
      PendingArtifactId: this.PendingArtifactId,
      PendingArtifactVersionNumber: this.PendingArtifactVersionNumber,
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
