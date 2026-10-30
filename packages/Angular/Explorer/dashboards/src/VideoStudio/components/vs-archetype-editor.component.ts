import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LogError, RunView } from '@memberjunction/core';
import {
  MJVideoArchetypeEntity,
  MJVideoArchetypeEntity_VideoBeatTemplate,
  MJVideoArchetypeEntity_VideoPacing,
  VideoStudioEngine,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  ArtifactsModule,
  FormatVideoTime,
  VideoBeatStripItem,
} from '@memberjunction/ng-artifacts';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  MJButtonDirective,
  MJDropdownComponent,
  MJNumericInputComponent,
  MJSwitchComponent,
} from '@memberjunction/ng-ui-components';
import {
  ARCHETYPE_CATEGORIES,
  ArchetypeBeatTemplateInput,
  ArchetypeCategory,
  BuildArchetypeBeatStripItems,
  DeriveBeatKeyFromLabel,
  ParseArchetypeDefaultFormats,
  STUDIO_VIDEO_FORMATS,
  StudioVideoFormat,
} from '../video-studio-agent-context';

export interface ArchetypeEditorCompanyOption {
  ID: string;
  Name: string;
}

export interface ArchetypeEditorSourceBeat {
  Key?: string | null;
  Label?: string | null;
  Purpose?: string | null;
  MinDurationSeconds?: number | null;
  MaxDurationSeconds?: number | null;
  DefaultDurationSeconds?: number | null;
  ComputedDurationSeconds?: number | null;
  Guidance?: string | null;
  RequiresDataBinding?: boolean | null;
}

export interface ArchetypeEditorSourcePacing {
  AvgSecondsBetweenChanges?: number | null;
  HoldRules?: string | null;
  MinBeatDurationSeconds?: number | null;
  MaxBeatDurationSeconds?: number | null;
}

export interface ArchetypeEditorSourceItem {
  ID: string;
  Name: string;
  Description?: string | null;
  Category?: ArchetypeCategory | string | null;
  CompanyID?: string | null;
  CompanyName?: string | null;
  Company?: string | null;
  IsShipped?: boolean;
  DefaultDurationSeconds?: number | null;
  MinDurationSeconds?: number | null;
  MaxDurationSeconds?: number | null;
  DefaultFormats?: string | null;
  DefaultInteractionMode?: string | null;
  Guidance?: string | null;
  BeatTemplate?: string | null;
  BeatTemplateRaw?: string | null;
  BeatTemplateObject?: ReadonlyArray<ArchetypeEditorSourceBeat> | null;
  Beats?: ReadonlyArray<ArchetypeEditorSourceBeat> | null;
  Pacing?: ArchetypeEditorSourcePacing | string | null;
  PacingRaw?: string | null;
  PacingObject?: ArchetypeEditorSourcePacing | null;
}

export interface ArchetypeEditorBeatRow {
  TrackId: number;
  Label: string;
  Purpose: string;
  Seconds: number;
  MinDurationSeconds: number;
  MaxDurationSeconds: number;
  Guidance: string;
  RequiresDataBinding: boolean;
}

export type ArchetypeEditorMode = 'copy' | 'edit';

export interface ArchetypeStartFromOption {
  ID: string;
  Label: string;
}

export interface ArchetypeCategoryDropdownOption {
  Value: ArchetypeCategory;
  Text: string;
}

/**
 * Dialog body component (`<vs-archetype-editor>`) for creating a company copy of any
 * video archetype or editing an existing company archetype.
 *
 * Plan rules (§4.3, §12): shipped archetypes (`CompanyID === null`) are read-only
 * templates; a company makes its own by copying one. `Name` is unique per company
 * scope; `Category` is one of the 7 CHECK values; beats are persisted as a valid
 * `VideoBeatTemplate[]` (`Key`, `Label`, `Purpose`, `MinDurationSeconds`,
 * `MaxDurationSeconds`, `DefaultDurationSeconds`, optional `Guidance` and
 * `RequiresDataBinding`); `Pacing` is `VideoPacing`. Saves go through the
 * `MJ: Video Archetypes` entity object and refresh `VideoStudioEngine`.
 */
@Component({
  standalone: true,
  selector: 'vs-archetype-editor',
  imports: [
    CommonModule,
    FormsModule,
    ArtifactsModule,
    MJButtonDirective,
    MJDropdownComponent,
    MJNumericInputComponent,
    MJSwitchComponent,
  ],
  templateUrl: './vs-archetype-editor.component.html',
  styleUrls: ['./vs-archetype-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VSArchetypeEditorComponent extends BaseAngularComponent implements OnInit {
  @Input() Mode: ArchetypeEditorMode = 'copy';
  @Input() SourceArchetypeId: string | null = null;
  @Input() EditingArchetypeId: string | null = null;
  @Input() Archetypes: ReadonlyArray<ArchetypeEditorSourceItem> | null = null;
  @Input() Companies: ReadonlyArray<ArchetypeEditorCompanyOption> | null = null;
  @Input() InitialCompanyId: string | null = null;

  @Output() Saved = new EventEmitter<string>();
  @Output() Cancelled = new EventEmitter<void>();

  public AvailableArchetypes: ArchetypeEditorSourceItem[] = [];
  public AvailableCompanies: ArchetypeEditorCompanyOption[] = [];
  public StartFromOptions: ArchetypeStartFromOption[] = [];
  public readonly CategoryOptions: ReadonlyArray<ArchetypeCategoryDropdownOption> =
    ARCHETYPE_CATEGORIES.map((cat) => ({
      Value: cat,
      Text: cat === 'DataStory' ? 'Data Story' : cat,
    }));
  public readonly AvailableFormats: ReadonlyArray<StudioVideoFormat> = STUDIO_VIDEO_FORMATS;

  public SelectedSourceId = '';
  public Name = '';
  public Category: ArchetypeCategory = 'Explainer';
  public CompanyID = '';
  public Description = '';

  public DefaultDurationSeconds = 60;
  public MinDurationSeconds = 30;
  public MaxDurationSeconds = 120;
  public SelectedFormats: StudioVideoFormat[] = ['16:9'];
  public DefaultInteractionMode = 'Autonomous';

  public Beats: ArchetypeEditorBeatRow[] = [];

  public IsAdvancedOpen = false;
  public Guidance = '';
  public PacingAvgSeconds = 5;
  public PacingHoldRules = '';

  public IsSaving = false;
  public SaveError: string | null = null;

  private nextBeatTrackId = 1;
  private lastAutoSuggestedName = '';
  private companiesLoadError: string | null = null;
  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    await this.initializeEditor();
  }

  public get IsEditingExistingCompanyArchetype(): boolean {
    if (this.Mode !== 'edit' || !this.EditingArchetypeId) {
      return false;
    }
    const target = this.findArchetypeById(this.EditingArchetypeId);
    if (!target) {
      return true;
    }
    return Boolean(target.CompanyID && target.CompanyID.trim().length > 0);
  }

  public get BeatsTotalSeconds(): number {
    return this.Beats.reduce(
      (sum, beat) => sum + Math.max(1, Math.round(Number(beat.Seconds) || 1)),
      0,
    );
  }

  public get BeatsSumSeconds(): number {
    return this.BeatsTotalSeconds;
  }

  public get HasBeatsDurationMismatch(): boolean {
    return (
      this.Beats.length > 0 &&
      this.BeatsTotalSeconds !== Math.max(1, Math.round(Number(this.DefaultDurationSeconds) || 1))
    );
  }

  public get HasDurationMismatch(): boolean {
    return this.HasBeatsDurationMismatch;
  }

  public get LiveBeatStripItems(): VideoBeatStripItem[] {
    const usedKeys = new Set<string>();
    return this.Beats.map((beat, idx) => {
      const label = (beat.Label ?? '').trim() || `Beat ${idx + 1}`;
      const key = DeriveBeatKeyFromLabel(label, idx + 1, usedKeys);
      const seconds = Math.max(1, Math.round(Number(beat.Seconds) || 1));
      const detail = (beat.Purpose ?? '').trim();
      return {
        Key: key,
        Label: label,
        Seconds: seconds,
        ...(detail ? { Detail: detail } : {}),
      };
    });
  }

  public FormatTime(seconds: number): string {
    const safe = Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : 0;
    return FormatVideoTime(safe);
  }

  public OnStartFromChange(sourceId: string | null): void {
    const trimmed = (sourceId ?? '').trim();
    if (!trimmed) {
      return;
    }
    this.SelectedSourceId = trimmed;
    const source = this.findArchetypeById(trimmed);
    if (!source) {
      return;
    }
    this.applySourceArchetype(source, false);
    this.cdr.markForCheck();
  }

  public OnDefaultDurationChange(value: number | string | null): void {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      this.DefaultDurationSeconds = Math.max(1, Math.round(numeric));
      if (this.MinDurationSeconds > this.DefaultDurationSeconds) {
        this.MinDurationSeconds = this.DefaultDurationSeconds;
      }
      if (this.MaxDurationSeconds < this.DefaultDurationSeconds) {
        this.MaxDurationSeconds = this.DefaultDurationSeconds;
      }
    }
    this.cdr.markForCheck();
  }

  public OnMinDurationChange(value: number | string | null): void {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      this.MinDurationSeconds = Math.max(1, Math.round(numeric));
    }
    this.cdr.markForCheck();
  }

  public OnMaxDurationChange(value: number | string | null): void {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      this.MaxDurationSeconds = Math.max(1, Math.round(numeric));
    }
    this.cdr.markForCheck();
  }

  public IsFormatSelected(format: string): boolean {
    return this.SelectedFormats.includes(format as StudioVideoFormat);
  }

  public ToggleFormat(format: StudioVideoFormat): void {
    if (this.SelectedFormats.includes(format)) {
      if (this.SelectedFormats.length > 1) {
        this.SelectedFormats = this.SelectedFormats.filter((f) => f !== format);
      }
    } else {
      this.SelectedFormats = [...this.SelectedFormats, format];
    }
    this.cdr.markForCheck();
  }

  public OnBeatLabelChange(index: number, label: string): void {
    const beat = this.Beats[index];
    if (!beat) {
      return;
    }
    beat.Label = label ?? '';
    this.Beats = [...this.Beats];
    this.cdr.markForCheck();
  }

  public OnBeatPurposeChange(index: number, purpose: string): void {
    const beat = this.Beats[index];
    if (!beat) {
      return;
    }
    beat.Purpose = purpose ?? '';
    this.Beats = [...this.Beats];
    this.cdr.markForCheck();
  }

  public OnBeatSecondsChange(index: number, value: number | string | null): void {
    const beat = this.Beats[index];
    if (!beat) {
      return;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    const seconds = Number.isFinite(numeric) && numeric >= 1 ? Math.round(numeric) : 1;
    beat.Seconds = seconds;
    beat.MinDurationSeconds = Math.max(1, Math.min(beat.MinDurationSeconds || seconds, seconds));
    beat.MaxDurationSeconds = Math.max(seconds, beat.MaxDurationSeconds || seconds);
    this.Beats = [...this.Beats];
    this.cdr.markForCheck();
  }

  public MoveBeatUp(index: number): void {
    if (index <= 0 || index >= this.Beats.length) {
      return;
    }
    const next = [...this.Beats];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    this.Beats = next;
    this.cdr.markForCheck();
  }

  public MoveBeatDown(index: number): void {
    if (index < 0 || index >= this.Beats.length - 1) {
      return;
    }
    const next = [...this.Beats];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    this.Beats = next;
    this.cdr.markForCheck();
  }

  public RemoveBeat(index: number): void {
    if (this.Beats.length <= 1 || index < 0 || index >= this.Beats.length) {
      return;
    }
    this.Beats = this.Beats.filter((_, idx) => idx !== index);
    this.cdr.markForCheck();
  }

  public AddBeat(): void {
    const nextIdx = this.Beats.length + 1;
    this.Beats = [
      ...this.Beats,
      {
        TrackId: this.nextBeatTrackId++,
        Label: `Beat ${nextIdx}`,
        Purpose: 'Advance the story with a clear visual focus.',
        Seconds: 5,
        MinDurationSeconds: 3,
        MaxDurationSeconds: 10,
        Guidance: '',
        RequiresDataBinding: false,
      },
    ];
    this.cdr.markForCheck();
  }

  /**
   * Scales all beat durations with {@link BuildArchetypeBeatStripItems} so their
   * integer `Seconds` sum to `DefaultDurationSeconds`.
   */
  public FitBeatsToLength(): void {
    if (this.Beats.length === 0) {
      return;
    }
    const targetDuration = Math.max(
      this.Beats.length,
      Math.round(Number(this.DefaultDurationSeconds) || 30),
    );
    this.DefaultDurationSeconds = targetDuration;
    if (this.MinDurationSeconds > targetDuration) {
      this.MinDurationSeconds = targetDuration;
    }
    if (this.MaxDurationSeconds < targetDuration) {
      this.MaxDurationSeconds = targetDuration;
    }

    const inputs: ArchetypeBeatTemplateInput[] = this.Beats.map((b, idx) => ({
      Key: DeriveBeatKeyFromLabel(b.Label, idx + 1),
      Label: b.Label,
      Purpose: b.Purpose,
      DefaultDurationSeconds: Math.max(1, Math.round(Number(b.Seconds) || 1)),
      MinDurationSeconds: b.MinDurationSeconds,
      MaxDurationSeconds: b.MaxDurationSeconds,
    }));

    const scaled = BuildArchetypeBeatStripItems(inputs, targetDuration);
    this.Beats = this.Beats.map((beat, idx) => {
      const nextSeconds = scaled[idx]?.Seconds ?? beat.Seconds;
      return {
        ...beat,
        Seconds: nextSeconds,
        MinDurationSeconds: Math.max(1, Math.min(beat.MinDurationSeconds, nextSeconds)),
        MaxDurationSeconds: Math.max(nextSeconds, beat.MaxDurationSeconds),
      };
    });
    this.cdr.markForCheck();
  }

  public ToggleAdvanced(): void {
    this.IsAdvancedOpen = !this.IsAdvancedOpen;
    this.cdr.markForCheck();
  }

  public BuildBeatTemplatePayload(): MJVideoArchetypeEntity_VideoBeatTemplate[] {
    const usedKeys = new Set<string>();
    return this.Beats.map((beat, idx) => {
      const label = (beat.Label ?? '').trim() || `Beat ${idx + 1}`;
      const key = DeriveBeatKeyFromLabel(label, idx + 1, usedKeys);
      const purpose = (beat.Purpose ?? '').trim() || label;
      const defaultDur = Math.max(1, Math.round(Number(beat.Seconds) || 1));
      const minDur = Math.max(
        1,
        Math.min(
          defaultDur,
          Math.round(
            Number(beat.MinDurationSeconds) > 0
              ? Number(beat.MinDurationSeconds)
              : Math.max(1, Math.floor(defaultDur * 0.6)),
          ),
        ),
      );
      const maxDur = Math.max(
        defaultDur,
        Math.round(
          Number(beat.MaxDurationSeconds) >= defaultDur
            ? Number(beat.MaxDurationSeconds)
            : Math.ceil(defaultDur * 1.5),
        ),
      );
      const guidance = (beat.Guidance ?? '').trim();

      return {
        Key: key,
        Label: label,
        Purpose: purpose,
        MinDurationSeconds: minDur,
        MaxDurationSeconds: maxDur,
        DefaultDurationSeconds: defaultDur,
        ...(guidance ? { Guidance: guidance } : {}),
        ...(beat.RequiresDataBinding ? { RequiresDataBinding: true } : {}),
      };
    });
  }

  public BuildPacingPayload(): MJVideoArchetypeEntity_VideoPacing {
    const avg =
      Number.isFinite(Number(this.PacingAvgSeconds)) && Number(this.PacingAvgSeconds) > 0
        ? Math.round(Number(this.PacingAvgSeconds))
        : 5;
    return {
      AvgSecondsBetweenChanges: avg,
      HoldRules: (this.PacingHoldRules ?? '').trim(),
    };
  }

  public Cancel(): void {
    this.Cancelled.emit();
  }

  public async Save(): Promise<void> {
    if (this.IsSaving) {
      return;
    }

    const trimmedName = (this.Name ?? '').trim();
    if (!trimmedName) {
      this.SaveError = 'Please enter a name for the archetype.';
      this.cdr.markForCheck();
      return;
    }

    const companyId = (this.CompanyID ?? '').trim();
    if (!companyId) {
      this.SaveError =
        this.companiesLoadError || 'Please select a company for this archetype.';
      this.cdr.markForCheck();
      return;
    }

    if (this.Beats.length === 0) {
      this.SaveError = 'Add at least one beat to the archetype.';
      this.cdr.markForCheck();
      return;
    }

    const isEditing = this.IsEditingExistingCompanyArchetype;
    const duplicate = this.AvailableArchetypes.find((arch) => {
      if (!arch.CompanyID || !UUIDsEqual(arch.CompanyID, companyId)) {
        return false;
      }
      if (isEditing && this.EditingArchetypeId && UUIDsEqual(arch.ID, this.EditingArchetypeId)) {
        return false;
      }
      return (arch.Name ?? '').trim().toLowerCase() === trimmedName.toLowerCase();
    });
    if (duplicate) {
      this.SaveError = `An archetype named "${trimmedName}" already exists for this company.`;
      this.cdr.markForCheck();
      return;
    }

    this.IsSaving = true;
    this.SaveError = null;
    this.cdr.markForCheck();

    try {
      const entity = await this.ProviderToUse.GetEntityObject<MJVideoArchetypeEntity>(
        'MJ: Video Archetypes',
        this.ProviderToUse.CurrentUser,
      );

      if (isEditing && this.EditingArchetypeId && typeof entity.Load === 'function') {
        const loaded = await entity.Load(this.EditingArchetypeId);
        if (!loaded) {
          this.SaveError = 'Unable to load the company archetype for editing.';
          return;
        }
      }

      const defaultDur = Math.max(1, Math.round(Number(this.DefaultDurationSeconds) || 60));
      const minDur = Math.max(
        1,
        Math.min(defaultDur, Math.round(Number(this.MinDurationSeconds) || defaultDur)),
      );
      const maxDur = Math.max(
        defaultDur,
        Math.round(Number(this.MaxDurationSeconds) || defaultDur),
      );
      const beatTemplates = this.BuildBeatTemplatePayload();
      const pacingPayload = this.BuildPacingPayload();
      const formatsList =
        this.SelectedFormats.length > 0 ? this.SelectedFormats : (['16:9'] as StudioVideoFormat[]);

      entity.Name = trimmedName;
      entity.Description = (this.Description ?? '').trim();
      entity.Category = this.Category;
      entity.CompanyID = companyId;
      entity.DefaultDurationSeconds = defaultDur;
      entity.MinDurationSeconds = minDur;
      entity.MaxDurationSeconds = maxDur;
      entity.DefaultFormats = formatsList.join(',');
      entity.DefaultInteractionMode = (this.DefaultInteractionMode ||
        'Autonomous') as MJVideoArchetypeEntity['DefaultInteractionMode'];
      entity.Guidance = (this.Guidance ?? '').trim() || null;
      entity.Status = 'Active';

      entity.BeatTemplate = JSON.stringify(beatTemplates);
      try {
        entity.BeatTemplateObject = beatTemplates;
      } catch {
        // Test doubles that do not implement BaseEntity JSON accessors still keep BeatTemplate.
      }

      entity.Pacing = JSON.stringify(pacingPayload);
      try {
        entity.PacingObject = pacingPayload;
      } catch {
        // Test doubles that do not implement BaseEntity JSON accessors still keep Pacing.
      }

      const saved = await entity.Save();
      if (!saved) {
        this.SaveError =
          entity.LatestResult?.CompleteMessage || 'Failed to save archetype.';
        return;
      }

      try {
        const engine = VideoStudioEngine.GetProviderInstance<VideoStudioEngine>(
          this.ProviderToUse,
          VideoStudioEngine,
        ) as VideoStudioEngine;
        await engine.Config(true, this.ProviderToUse?.CurrentUser, this.ProviderToUse);
      } catch {
        // Non-fatal in isolated component tests.
      }

      this.Saved.emit(entity.ID);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(msg);
      this.SaveError = msg;
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  private async initializeEditor(): Promise<void> {
    if (Array.isArray(this.Archetypes) && this.Archetypes.length > 0) {
      this.AvailableArchetypes = [...this.Archetypes];
    } else {
      await this.loadEngineArchetypes();
    }

    if (Array.isArray(this.Companies) && this.Companies.length > 0) {
      this.AvailableCompanies = [...this.Companies];
    } else {
      await this.loadAvailableCompanies();
    }

    if (this.companiesLoadError) {
      this.SaveError = this.companiesLoadError;
    }

    this.StartFromOptions = this.AvailableArchetypes.map((arch) => {
      const isShipped =
        arch.IsShipped !== undefined ? arch.IsShipped : arch.CompanyID == null;
      const scopeSuffix = isShipped
        ? 'Shipped'
        : (arch.CompanyName ?? arch.Company ?? 'Company');
      return {
        ID: arch.ID,
        Label: `${arch.Name} (${scopeSuffix})`,
      };
    });

    const initialId =
      (this.Mode === 'edit' && this.EditingArchetypeId
        ? this.EditingArchetypeId
        : this.SourceArchetypeId) ??
      this.AvailableArchetypes[0]?.ID ??
      '';

    const initialSource = this.findArchetypeById(initialId) ?? this.AvailableArchetypes[0] ?? null;
    if (initialSource) {
      this.SelectedSourceId = initialSource.ID;
      this.applySourceArchetype(initialSource, true);
    } else {
      this.CompanyID = this.resolveInitialCompanyId(null);
      this.Beats = [
        {
          TrackId: this.nextBeatTrackId++,
          Label: 'Hook',
          Purpose: 'Open with the core takeaway.',
          Seconds: 10,
          MinDurationSeconds: 5,
          MaxDurationSeconds: 15,
          Guidance: '',
          RequiresDataBinding: false,
        },
        {
          TrackId: this.nextBeatTrackId++,
          Label: 'Walkthrough',
          Purpose: 'Show the main mechanism or story.',
          Seconds: 20,
          MinDurationSeconds: 10,
          MaxDurationSeconds: 30,
          Guidance: '',
          RequiresDataBinding: false,
        },
      ];
      this.DefaultDurationSeconds = 30;
      this.MinDurationSeconds = 15;
      this.MaxDurationSeconds = 60;
    }

    this.cdr.markForCheck();
  }

  private applySourceArchetype(
    source: ArchetypeEditorSourceItem,
    isInitialLoad: boolean,
  ): void {
    const isEditingTarget =
      isInitialLoad &&
      this.IsEditingExistingCompanyArchetype &&
      this.EditingArchetypeId !== null &&
      UUIDsEqual(source.ID, this.EditingArchetypeId);

    if (isEditingTarget) {
      this.Name = source.Name ?? '';
      this.lastAutoSuggestedName = '';
    } else {
      const copyName = `${source.Name} (Copy)`;
      if (isInitialLoad || !this.Name.trim() || this.Name === this.lastAutoSuggestedName) {
        this.Name = copyName;
        this.lastAutoSuggestedName = copyName;
      }
    }

    const rawCategory = (source.Category ?? 'Explainer').trim();
    this.Category = (ARCHETYPE_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as ArchetypeCategory)
      : 'Explainer';

    this.Description = source.Description ?? '';
    if (isInitialLoad) {
      this.CompanyID = this.resolveInitialCompanyId(source.CompanyID ?? null);
    }

    const defaultDur =
      typeof source.DefaultDurationSeconds === 'number' &&
      Number.isFinite(source.DefaultDurationSeconds) &&
      source.DefaultDurationSeconds > 0
        ? Math.round(source.DefaultDurationSeconds)
        : 60;
    const minDur =
      typeof source.MinDurationSeconds === 'number' &&
      Number.isFinite(source.MinDurationSeconds) &&
      source.MinDurationSeconds > 0
        ? Math.round(source.MinDurationSeconds)
        : 30;
    const maxDur =
      typeof source.MaxDurationSeconds === 'number' &&
      Number.isFinite(source.MaxDurationSeconds) &&
      source.MaxDurationSeconds >= minDur
        ? Math.round(source.MaxDurationSeconds)
        : Math.max(defaultDur, 120);

    this.DefaultDurationSeconds = defaultDur;
    this.MinDurationSeconds = minDur;
    this.MaxDurationSeconds = maxDur;
    this.SelectedFormats = ParseArchetypeDefaultFormats(source.DefaultFormats);
    this.DefaultInteractionMode = source.DefaultInteractionMode ?? 'Autonomous';
    this.Guidance = source.Guidance ?? '';

    const rawBeats = this.extractSourceBeats(source);
    const scaledItems = BuildArchetypeBeatStripItems(rawBeats, defaultDur);
    const allHaveExplicitDefault =
      rawBeats.length > 0 &&
      rawBeats.every(
        (b) => typeof b.DefaultDurationSeconds === 'number' && b.DefaultDurationSeconds > 0,
      );
    const rawExplicitSum = allHaveExplicitDefault
      ? rawBeats.reduce((sum, b) => sum + (b.DefaultDurationSeconds ?? 0), 0)
      : defaultDur;
    const useScaledIntegerBeats =
      !allHaveExplicitDefault || Math.abs(rawExplicitSum - defaultDur) < 0.5;

    if (rawBeats.length > 0) {
      this.Beats = rawBeats.map((b, idx) => {
        const seconds = useScaledIntegerBeats
          ? (scaledItems[idx]?.Seconds ?? 5)
          : Math.max(1, Math.round(b.DefaultDurationSeconds ?? 5));
        return {
          TrackId: this.nextBeatTrackId++,
          Label: (b.Label ?? b.Key ?? '').trim() || `Beat ${idx + 1}`,
          Purpose: (b.Purpose ?? '').trim(),
          Seconds: seconds,
          MinDurationSeconds:
            typeof b.MinDurationSeconds === 'number' && b.MinDurationSeconds > 0
              ? Math.round(b.MinDurationSeconds)
              : Math.max(1, Math.floor(seconds * 0.6)),
          MaxDurationSeconds:
            typeof b.MaxDurationSeconds === 'number' && b.MaxDurationSeconds >= seconds
              ? Math.round(b.MaxDurationSeconds)
              : Math.max(seconds, Math.ceil(seconds * 1.5)),
          Guidance: (b.Guidance ?? '').trim(),
          RequiresDataBinding: Boolean(b.RequiresDataBinding),
        };
      });
    } else {
      this.Beats = [
        {
          TrackId: this.nextBeatTrackId++,
          Label: 'Hook',
          Purpose: 'Open with the core takeaway.',
          Seconds: defaultDur,
          MinDurationSeconds: minDur,
          MaxDurationSeconds: maxDur,
          Guidance: '',
          RequiresDataBinding: false,
        },
      ];
    }

    const pacing = this.extractSourcePacing(source);
    this.PacingAvgSeconds =
      pacing &&
      typeof pacing.AvgSecondsBetweenChanges === 'number' &&
      pacing.AvgSecondsBetweenChanges > 0
        ? Math.round(pacing.AvgSecondsBetweenChanges)
        : 5;
    this.PacingHoldRules = pacing?.HoldRules ?? '';
  }

  private extractSourceBeats(
    source: ArchetypeEditorSourceItem,
  ): ReadonlyArray<ArchetypeEditorSourceBeat> {
    if (Array.isArray(source.Beats) && source.Beats.length > 0) {
      return source.Beats;
    }
    if (Array.isArray(source.BeatTemplateObject) && source.BeatTemplateObject.length > 0) {
      return source.BeatTemplateObject;
    }
    const rawJson = source.BeatTemplateRaw ?? source.BeatTemplate ?? null;
    if (typeof rawJson === 'string' && rawJson.trim().startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          return parsed as ArchetypeEditorSourceBeat[];
        }
      } catch {
        return [];
      }
    }
    return [];
  }

  private extractSourcePacing(
    source: ArchetypeEditorSourceItem,
  ): ArchetypeEditorSourcePacing | null {
    if (source.PacingObject && typeof source.PacingObject === 'object') {
      return source.PacingObject;
    }
    if (source.Pacing && typeof source.Pacing === 'object') {
      return source.Pacing;
    }
    const rawJson =
      source.PacingRaw ?? (typeof source.Pacing === 'string' ? source.Pacing : null);
    if (typeof rawJson === 'string' && rawJson.trim().startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') {
          return parsed as ArchetypeEditorSourcePacing;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  private resolveInitialCompanyId(sourceCompanyId: string | null): string {
    if (
      this.InitialCompanyId &&
      this.InitialCompanyId.trim().length > 0 &&
      this.InitialCompanyId !== 'all'
    ) {
      return this.InitialCompanyId.trim();
    }
    if (sourceCompanyId && sourceCompanyId.trim().length > 0) {
      return sourceCompanyId.trim();
    }
    return this.AvailableCompanies[0]?.ID ?? '';
  }

  private findArchetypeById(id: string | null | undefined): ArchetypeEditorSourceItem | null {
    const trimmed = (id ?? '').trim();
    if (!trimmed) {
      return null;
    }
    return (
      this.AvailableArchetypes.find((a) => UUIDsEqual(a.ID, trimmed)) ?? null
    );
  }

  private async loadEngineArchetypes(): Promise<void> {
    try {
      const engine = VideoStudioEngine.GetProviderInstance<VideoStudioEngine>(
        this.ProviderToUse,
        VideoStudioEngine,
      ) as VideoStudioEngine;
      await engine.Config(false, this.ProviderToUse?.CurrentUser, this.ProviderToUse);
      this.AvailableArchetypes = [...(engine.Archetypes ?? [])];
    } catch {
      this.AvailableArchetypes = [];
    }
  }

  private async loadAvailableCompanies(): Promise<void> {
    this.companiesLoadError = null;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: Companies',
        Fields: ['ID', 'Name'],
        OrderBy: 'Name ASC',
        ResultType: 'simple',
      });
      if (!res.Success) {
        const msg = res.ErrorMessage || 'Failed to load companies.';
        LogError(msg);
        this.companiesLoadError = `Couldn't load companies: ${msg}`;
        return;
      }
      if (Array.isArray(res.Results)) {
        this.AvailableCompanies = res.Results.map((r) => ({
          ID: r.ID,
          Name: r.Name,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(msg);
      this.companiesLoadError = `Couldn't load companies: ${msg}`;
    }
  }
}
