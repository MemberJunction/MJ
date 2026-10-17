import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_BRAND_GENERATION_POLICY,
  MJBrandKitEntity,
  MJBrandKitEntity_IBrandGenerationPolicy,
} from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

export const SYNTHETIC_PEOPLE_POLICY_WARNING =
  'A generated person may never be presented as a member, customer, employee or speaker.';

/**
 * Reusable editor for `MJBrandKitEntity.GenerationPolicyObject`.
 *
 * Edits `AllowGeneratedImages`, `AllowGeneratedVideo`, `AllowSyntheticPeople` (defaulting to `false`
 * and displaying the §3.4 synthetic-people disclosure warning when enabled), `AvoidSubjects` chip list,
 * `StylePrompt`, and `MaxGenerationCostPerRun`. Saves via `BrandKit.Save()` and surfaces
 * `BrandKit.LatestResult` errors if `Save()` returns `false`.
 */
@Component({
  standalone: true,
  selector: 'mj-brand-kit-generation-policy-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './brand-kit-generation-policy-editor.component.html',
  styleUrls: ['./brand-kit-generation-policy-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandKitGenerationPolicyEditorComponent extends BaseAngularComponent implements OnChanges {
  private _brandKit: MJBrandKitEntity | null = null;

  @Input()
  get BrandKit(): MJBrandKitEntity | null {
    return this._brandKit;
  }
  set BrandKit(value: MJBrandKitEntity | null) {
    this._brandKit = value;
  }

  @Input() Readonly = false;
  @Input() ShowSaveButton = true;

  @Output() PolicySaved = new EventEmitter<MJBrandKitEntity_IBrandGenerationPolicy>();
  @Output() PolicyChanged = new EventEmitter<MJBrandKitEntity_IBrandGenerationPolicy>();

  public AllowGeneratedImages = DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedImages;
  public AllowGeneratedVideo = DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedVideo;
  public AllowSyntheticPeople = DEFAULT_BRAND_GENERATION_POLICY.AllowSyntheticPeople;
  public AvoidSubjects: string[] = [];
  public NewSubjectInput = '';
  public StylePrompt: string = DEFAULT_BRAND_GENERATION_POLICY.StylePrompt ?? '';
  public MaxGenerationCostPerRun: number = DEFAULT_BRAND_GENERATION_POLICY.MaxGenerationCostPerRun ?? 10;

  public Saving = false;
  public SaveError: string | null = null;
  public SaveSuccess = false;
  public readonly SyntheticPeopleWarning = SYNTHETIC_PEOPLE_POLICY_WARNING;

  private readonly cdr = inject(ChangeDetectorRef);

  ngOnChanges(changes: SimpleChanges): void {
    if ('BrandKit' in changes) {
      this.HydrateFromBrandKit();
    }
  }

  public HydrateFromBrandKit(): void {
    this.SaveError = null;
    this.SaveSuccess = false;
    const raw: MJBrandKitEntity_IBrandGenerationPolicy | null = this._brandKit?.GenerationPolicyObject ?? null;
    this.AllowGeneratedImages =
      typeof raw?.AllowGeneratedImages === 'boolean'
        ? raw.AllowGeneratedImages
        : DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedImages;
    this.AllowGeneratedVideo =
      typeof raw?.AllowGeneratedVideo === 'boolean'
        ? raw.AllowGeneratedVideo
        : DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedVideo;
    this.AllowSyntheticPeople =
      typeof raw?.AllowSyntheticPeople === 'boolean'
        ? raw.AllowSyntheticPeople
        : DEFAULT_BRAND_GENERATION_POLICY.AllowSyntheticPeople;
    this.AvoidSubjects = Array.isArray(raw?.AvoidSubjects)
      ? raw.AvoidSubjects.filter((s) => typeof s === 'string' && s.trim().length > 0)
      : [...DEFAULT_BRAND_GENERATION_POLICY.AvoidSubjects];
    this.StylePrompt =
      typeof raw?.StylePrompt === 'string'
        ? raw.StylePrompt
        : (DEFAULT_BRAND_GENERATION_POLICY.StylePrompt ?? '');
    this.MaxGenerationCostPerRun =
      typeof raw?.MaxGenerationCostPerRun === 'number' && Number.isFinite(raw.MaxGenerationCostPerRun) && raw.MaxGenerationCostPerRun >= 0
        ? raw.MaxGenerationCostPerRun
        : (DEFAULT_BRAND_GENERATION_POLICY.MaxGenerationCostPerRun ?? 10);
    this.cdr.markForCheck();
  }

  public BuildPolicyObject(): MJBrandKitEntity_IBrandGenerationPolicy {
    const cost =
      typeof this.MaxGenerationCostPerRun === 'number' &&
      Number.isFinite(this.MaxGenerationCostPerRun) &&
      this.MaxGenerationCostPerRun >= 0
        ? this.MaxGenerationCostPerRun
        : (DEFAULT_BRAND_GENERATION_POLICY.MaxGenerationCostPerRun ?? 10);
    return {
      AllowGeneratedImages: Boolean(this.AllowGeneratedImages),
      AllowGeneratedVideo: Boolean(this.AllowGeneratedVideo),
      AllowSyntheticPeople: Boolean(this.AllowSyntheticPeople),
      AvoidSubjects: [...this.AvoidSubjects],
      StylePrompt: this.StylePrompt,
      MaxGenerationCostPerRun: cost,
    };
  }

  public OnFieldChange(): void {
    this.SaveSuccess = false;
    const policy = this.BuildPolicyObject();
    if (this._brandKit) {
      this._brandKit.GenerationPolicyObject = policy;
    }
    this.PolicyChanged.emit(policy);
    this.cdr.markForCheck();
  }

  public AddAvoidSubject(): void {
    if (this.Readonly) {
      return;
    }
    const trimmed = this.NewSubjectInput.trim();
    if (!trimmed) {
      return;
    }
    if (!this.AvoidSubjects.includes(trimmed)) {
      this.AvoidSubjects = [...this.AvoidSubjects, trimmed];
    }
    this.NewSubjectInput = '';
    this.OnFieldChange();
  }

  public RemoveAvoidSubject(subject: string): void {
    if (this.Readonly) {
      return;
    }
    this.AvoidSubjects = this.AvoidSubjects.filter((s) => s !== subject);
    this.OnFieldChange();
  }

  public OnSubjectKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.AddAvoidSubject();
    }
  }

  public async SavePolicy(): Promise<boolean> {
    if (!this._brandKit || this.Readonly) {
      return false;
    }
    this.SaveError = null;
    this.SaveSuccess = false;
    this.Saving = true;
    const policy = this.BuildPolicyObject();
    this._brandKit.GenerationPolicyObject = policy;
    this.cdr.markForCheck();

    try {
      const saved = await this._brandKit.Save();
      if (!saved) {
        this.SaveError =
          this._brandKit.LatestResult?.CompleteMessage ||
          this._brandKit.LatestResult?.Message ||
          'Failed to save Brand Kit generation policy.';
        return false;
      }
      this.SaveSuccess = true;
      this.PolicySaved.emit(policy);
      return true;
    } catch (err) {
      this.SaveError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.Saving = false;
      this.cdr.markForCheck();
    }
  }
}
