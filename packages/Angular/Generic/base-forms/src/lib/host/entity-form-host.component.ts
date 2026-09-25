import {
  Component, Input, Output, EventEmitter, ViewChild, ViewContainerRef, ElementRef,
  ComponentRef, ChangeDetectorRef, inject, AfterViewInit, OnDestroy, Type
} from '@angular/core';
import {
  CompositeKey, BaseEntity, BaseEntityEvent, FieldValueCollection, EntityFieldTSType, LogError
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { BaseFormComponent } from '../base-form-component';
import { BaseFormSectionComponent } from '../base-form-section-component';
import { InteractiveFormComponent } from '../interactive-form/interactive-form.component';
import {
  EntityFormMode, FormResolution, FormResolverService,
  HasStandardFormAlternative as hasStandardFormAlternative
} from '../resolver/form-resolver.service';
import { EntityFormConfig } from '../types/entity-form-config';
import { FormNavigationEvent } from '../types/navigation-events';
import {
  FormNotificationEvent, RecordSavedEvent, RecordDeletedEvent,
  RecordSaveFailedEvent, ValidationFailedEvent
} from '../types/form-types';

/**
 * Presentation-agnostic host that renders ANY MemberJunction entity form —
 * generated (`@RegisterClass` / CodeGen), custom (`*Extended`), or interactive
 * (`EntityFormOverride`) — for a given record.
 *
 * This is the shared core extracted from Explorer's `SingleRecordComponent`. It
 * encapsulates the full lifecycle: **resolve** which form to use (via
 * {@link FormResolverService}, honoring variant overrides) → **load** the
 * record (or accept a pre-loaded one) → **create** the form component
 * dynamically → **bind** record / EditMode / Config / variants → **re-emit**
 * the form's events → **tear down** cleanly.
 *
 * It has ZERO routing and ZERO Explorer dependencies — it only emits events.
 * The surrounding surface (a full-page tab in Explorer, a dialog, or a
 * slide-in) decides what to do with `Navigate`, `Notification`, etc.
 *
 * @example Explorer tab (thin wrapper subscribes + maps to NavigationService)
 * ```html
 * <mj-entity-form-host [EntityName]="entityName" [PrimaryKey]="pk"
 *   (Navigate)="handleNavigation($event)" (Saved)="onSaved($event)">
 * </mj-entity-form-host>
 * ```
 *
 * @example Bind a pre-loaded record (dialog/slide-in)
 * ```html
 * <mj-entity-form-host [Record]="myEntity" [Config]="DIALOG_FORM_CONFIG"></mj-entity-form-host>
 * ```
 *
 * **Standard-form switch.** When a custom form (a higher-priority class form or
 * an interactive override) hides the CodeGen-generated form, the host renders a
 * one-line strip above it offering "Open standard form" — every field, same
 * permissions — and back. It lives here rather than in `<mj-form-toolbar>`
 * because a fully custom form may not render the toolbar at all, which would
 * leave the generated form unreachable. Surfaces drive/persist the choice via
 * {@link FormMode} / {@link FormModeChange}; hosts that must not offer it set
 * {@link ShowFormModeSwitch} to false.
 */
@Component({
  standalone: false,
  selector: 'mj-entity-form-host',
  templateUrl: './entity-form-host.component.html',
  styleUrls: ['./entity-form-host.component.css'],
})
export class MjEntityFormHostComponent extends BaseAngularComponent implements AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private formResolver = inject(FormResolverService);

  /** Anchor for the dynamically-created form component. Always present in the DOM. */
  @ViewChild('anchor', { read: ViewContainerRef, static: true }) private anchor!: ViewContainerRef;
  /** The strip's switch button — present only while the strip renders. */
  @ViewChild('modeSwitch') private modeSwitchButton?: ElementRef<HTMLButtonElement>;

  // ── Inputs ──────────────────────────────────────────────────────────────

  private _entityName: string | null = null;
  /** Entity name to load a record for. Ignored when {@link Record} is supplied. */
  @Input()
  set EntityName(value: string | null) {
    const changed = this._entityName !== value;
    this._entityName = value;
    if (changed && this._viewInitialized) this.reload();
  }
  get EntityName(): string | null { return this._entityName; }

  private _primaryKey: CompositeKey = new CompositeKey();
  /** Primary key of the record to load. Empty key → new record. */
  @Input()
  set PrimaryKey(value: CompositeKey) {
    const changed = !this.compositeKeysEqual(this._primaryKey, value);
    this._primaryKey = value ?? new CompositeKey();
    if (!changed || !this._viewInitialized) return;
    // Skip reload when the incoming key just reflects the current record's now-saved PK
    // (post new-record save rebind). Genuine external swaps still reload.
    if (this._currentRecord && this.compositeKeysEqual(value, this._currentRecord.PrimaryKey)) return;
    this.reload();
  }
  get PrimaryKey(): CompositeKey { return this._primaryKey; }

  private _record: BaseEntity | null = null;
  /**
   * Pre-loaded record to bind directly. When supplied, the host skips the
   * load step entirely and mounts the resolved form against this instance —
   * `EntityName`/`PrimaryKey` are not required.
   */
  @Input()
  set Record(value: BaseEntity | null) {
    const changed = this._record !== value;
    this._record = value;
    if (changed && this._viewInitialized) this.reload();
  }
  get Record(): BaseEntity | null { return this._record; }

  /** New-record default values: URL-segment string or a plain object. */
  @Input() NewRecordValues: string | Record<string, unknown> | null = null;

  /**
   * Render a single registered form **section** (a `BaseFormSectionComponent`
   * registered as `'<EntityName>.<SectionName>'`) instead of the full form.
   * When set, the full-form resolver / variant picker / toolbar container are
   * bypassed — the section component renders its own fields and the host saves
   * the record directly. Used for compact, focused editors (e.g. a quick-edit
   * grid row). Leave null for the normal full-form behavior.
   */
  @Input() SectionName: string | null = null;

  private _editMode: boolean | null = null;
  /** Force edit mode. When omitted, new records start in edit, existing in read. */
  @Input()
  set EditMode(value: boolean | null) { this._editMode = value; }
  get EditMode(): boolean | null { return this._editMode; }

  /** Per-instance form presentation config (toolbar, sections, width, links). */
  @Input() Config: EntityFormConfig | null = null;

  private _formMode: EntityFormMode = 'default';
  /**
   * Which form to mount: `'default'` = the resolver's normal pick; `'standard'`
   * = the CodeGen-generated form, even when a custom form outranks it. Falls
   * back to the default (and logs) when the entity has no standard form.
   * A change after the view initializes reloads the form.
   */
  @Input()
  set FormMode(value: EntityFormMode) {
    const next = value ?? 'default';
    const changed = this._formMode !== next;
    this._formMode = next;
    if (changed && this._viewInitialized) this.reload();
  }
  get FormMode(): EntityFormMode { return this._formMode; }

  /** Offer the standard-form strip when a custom form hides the generated one. Set false to suppress it. */
  @Input() ShowFormModeSwitch = true;

  // ── Outputs ─────────────────────────────────────────────────────────────

  /** Form navigation request (record link, new record, hierarchy, email, external, dismiss). */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();
  /** User-facing notification request (success/error/warning/info). */
  @Output() Notification = new EventEmitter<FormNotificationEvent>();
  /** Emitted after the record is successfully saved (carries the live entity). */
  @Output() Saved = new EventEmitter<BaseEntity>();
  /** Re-emitted form `RecordSaved` (richer payload). */
  @Output() RecordSaved = new EventEmitter<RecordSavedEvent>();
  /** Re-emitted form `RecordRefreshed`. */
  @Output() RecordRefreshed = new EventEmitter<BaseEntity>();
  /** Re-emitted form `RecordDeleted`. */
  @Output() RecordDeleted = new EventEmitter<RecordDeletedEvent>();
  /** Re-emitted form `RecordSaveFailed`. */
  @Output() RecordSaveFailed = new EventEmitter<RecordSaveFailedEvent>();
  /** Re-emitted form `ValidationFailed`. */
  @Output() ValidationFailed = new EventEmitter<ValidationFailedEvent>();
  /** Re-emitted form `RecordReady` (record fully initialized). */
  @Output() RecordReady = new EventEmitter<BaseEntity>();
  /** Form asked to be dismissed (e.g. Discard on a brand-new record). */
  @Output() Dismissed = new EventEmitter<void>();
  /** Initial load + mount finished (success path). */
  @Output() LoadComplete = new EventEmitter<void>();
  /** Load failed; carries a user-facing title + detail. */
  @Output() LoadError = new EventEmitter<{ title: string; detail: string }>();
  /** The live form instance, emitted right after it's created (for power-user wiring). */
  @Output() FormCreated = new EventEmitter<BaseFormComponent>();
  /** The user switched between the custom and the standard form (so the surface can persist it, e.g. in the URL). */
  @Output() FormModeChange = new EventEmitter<EntityFormMode>();

  // ── State ───────────────────────────────────────────────────────────────

  public Loading = true;

  /** @deprecated Use {@link Loading}. */
  public get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value) {
    this.Loading = value;
  }
  public ErrorTitle: string | null = null;

  /** @deprecated Use {@link ErrorTitle}. */
  public get errorTitle(): string | null {
    return this.ErrorTitle;
  }
  /** @deprecated Use {@link ErrorTitle}. */
  public set errorTitle(value: string | null) {
    this.ErrorTitle = value;
  }
  public errorDetail: string | null = null;

  /**
   * True when a custom form is hiding the standard (CodeGen) form — so the
   * switch strip has somewhere to go. Stays true while the standard form is
   * the one mounted, so the strip can offer the way back.
   */
  public HasStandardFormAlternative = false;

  private _formComponentRef: ComponentRef<BaseFormComponent> | null = null;
  private _sectionRef: ComponentRef<BaseFormSectionComponent> | null = null;
  private _isSection = false;
  private _currentRecord: BaseEntity | null = null;
  private _saveHandlerSub: Subscription | null = null;
  private _formEventSubs: Subscription[] = [];
  private _viewInitialized = false;
  /**
   * An unsaved new record carried across a form switch. A brand-new record is
   * always `Dirty` (never saved), so the dirty guard can't protect it; instead
   * the switch re-binds the same live instance rather than creating a fresh one,
   * so whatever the user typed survives. Consumed by the next {@link obtainRecord}.
   */
  private _carryNewRecord: BaseEntity | null = null;
  /**
   * Set when the strip's own button started a switch. The reload unmounts the
   * strip (and the focused button with it), so focus is handed to the new
   * button once the mount completes instead of falling to `<body>`.
   */
  private _refocusModeSwitch = false;

  /** The live form component instance, or null before mount / after teardown. */
  get Form(): BaseFormComponent | null {
    return this._formComponentRef?.instance ?? null;
  }

  /** Whether the bound record has unsaved changes. */
  get Dirty(): boolean {
    return this._currentRecord?.Dirty ?? false;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this._viewInitialized = true;
    this.reload();
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  // ── Public API (driven by dialog/slide-in chrome) ─────────────────────────

  /**
   * Save the bound record. In full-form mode this runs the form's save
   * pipeline (validation, pending records, notifications); in section mode the
   * section component has no pipeline, so we save the record directly (the
   * record's own save event still drives the `Saved` output).
   */
  async Save(): Promise<boolean> {
    if (this._isSection) {
      return this._currentRecord ? this._currentRecord.Save() : false;
    }
    const f = this.Form;
    if (!f) return false;
    return f.SaveRecord(true);
  }

  /** Cancel edits (revert). Full-form mode uses the form's cancel pipeline. */
  Cancel(): void {
    if (this._isSection) {
      if (this._currentRecord?.Dirty) this._currentRecord.Revert();
      return;
    }
    this.Form?.CancelEdit();
  }

  /** Refresh the bound record from the database. Full-form mode uses the form's refresh pipeline. */
  async Refresh(): Promise<boolean> {
    if (this._isSection) {
      return this._currentRecord?.IsSaved ? this._currentRecord.Refresh() : false;
    }
    const f = this.Form;
    if (!f) return false;
    return f.RefreshRecord();
  }

  /**
   * Switch between the custom (`'default'`) and the standard form. Refuses —
   * returning false and emitting a `warning` Notification — when remounting
   * would silently discard unsaved work (see {@link hasUnsavedWorkToLose}).
   * A brand-new record is carried across instead (see {@link _carryNewRecord}).
   * With a form mounted but no standard alternative (the generated form is
   * the only one), both modes mount the same form: the mode is recorded and
   * emitted, with no reload and so nothing for the unsaved-work guard to
   * protect. The error state is excluded: `fail()` also clears
   * `HasStandardFormAlternative` and `Loading`, and there the switch must
   * still reload — it is the retry of the failed load.
   */
  public SwitchFormMode(mode: EntityFormMode): boolean {
    if (mode === this._formMode) return true;
    if (!this.HasStandardFormAlternative && !this.Loading && !this.ErrorTitle) {
      this._formMode = mode;
      this.FormModeChange.emit(mode);
      return true;
    }
    if (this.hasUnsavedWorkToLose()) {
      this.Notification.emit({ Message: 'Save or discard your changes before switching forms.', Type: 'warning', Duration: 4000 });
      return false;
    }
    const record = this._currentRecord;
    // A bound Record input is reused by every reload anyway; only a host-created new record needs carrying.
    if (record && !record.IsSaved && !this._record) this._carryNewRecord = record;
    this._formMode = mode;
    this.FormModeChange.emit(mode);
    this.reload();
    return true;
  }

  /** Template handler for the strip's button: switch, and keep keyboard focus on the button. */
  public OnModeSwitchClick(): void {
    this._refocusModeSwitch = true;
    const next: EntityFormMode = this._formMode === 'standard' ? 'default' : 'standard';
    if (!this.SwitchFormMode(next)) this._refocusModeSwitch = false; // refused: the button never left
  }

  /**
   * Whether tearing the mounted form down would lose unsaved work. A saved
   * record's field edits count; a brand-new record's don't, because its live
   * instance is carried across the switch. Work the form holds outside the
   * record (pending related records, designer/canvas state) always counts —
   * it lives in the form component, which the switch destroys.
   */
  private hasUnsavedWorkToLose(): boolean {
    const record = this._currentRecord;
    if (record?.IsSaved && record.Dirty) return true;
    return this.Form?.HasUnsavedChangesBeyondRecord ?? false;
  }

  // ── Core: resolve → load → create → bind → wire ──────────────────────────

  private reload(): void {
    this.teardown();
    this.Loading = true;
    this.HasStandardFormAlternative = false;
    this.ErrorTitle = null;
    this.errorDetail = null;
    void this.loadAndMount();
  }

  private async loadAndMount(): Promise<void> {
    const md = this.ProviderToUse;
    // When a pre-loaded record is supplied, derive the entity from it.
    const entityName = this._record?.EntityInfo?.Name ?? this._entityName;

    if (!entityName || entityName.trim().length === 0) {
      // Nothing to load yet — a caller will re-invoke once an entity is known.
      return;
    }

    try {
      const entity = md.EntityByName(entityName);
      if (!entity) {
        this.fail(`Entity not found: "${entityName}"`,
          `This MemberJunction instance has no metadata for entity "${entityName}".`);
        return;
      }
      const permissions = entity.GetUserPermisions(md.CurrentUser);

      // Section mode short-circuits the full-form resolver / container.
      if (this.SectionName) {
        await this.mountSection(entityName, permissions);
        return;
      }

      const resolution = await this.formResolver.ResolveFormForEntity(entity, md.CurrentUser, md);
      this.HasStandardFormAlternative = hasStandardFormAlternative(resolution);
      if (resolution.kind === 'none') {
        this.fail(`No form is registered for "${entityName}".`,
          `No EntityFormOverride or class-based form (@RegisterClass(BaseFormComponent, '${entityName}')) was found. Run CodeGen or register a custom form.`);
        return;
      }

      const record = await this.obtainRecord(entityName, md);
      if (!record) return; // fail() already called

      // Emit Saved on the record's own save event (covers all save paths).
      this._saveHandlerSub = record.RegisterEventHandler((e: BaseEntityEvent) => {
        if (e.type === 'save') this.Saved.emit(record);
      });

      const standardForm = this.standardFormToMount(resolution, entityName);

      this.anchor.clear();
      let componentRef: ComponentRef<BaseFormComponent>;
      if (standardForm) {
        componentRef = this.anchor.createComponent(standardForm);
      } else if (resolution.kind === 'interactive') {
        const interactiveRef = this.anchor.createComponent(InteractiveFormComponent);
        interactiveRef.instance.ComponentID = resolution.override.ComponentID;
        componentRef = interactiveRef;
      } else {
        componentRef = this.anchor.createComponent(resolution.subClass);
      }

      this._formComponentRef = componentRef;
      this._currentRecord = record;

      const instance = componentRef.instance as BaseFormComponent & { userPermissions?: unknown };
      instance.record = record;
      instance.userPermissions = permissions;
      instance.Config = this.effectiveConfigFor(record);
      instance.EditMode = this._editMode ?? this.Config?.StartInEditMode ?? !record.IsSaved;

      this.applyVariants(instance, resolution, entityName);
      // The picker's "current" row describes the resolver's pick; the standard form is none of them.
      if (standardForm) instance.CurrentVariantID = null;
      this.subscribeToFormEvents(instance);

      this.FormCreated.emit(instance);
      this.ErrorTitle = null;
      this.errorDetail = null;
      this.LoadComplete.emit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.fail(`Failed to load ${entityName} record.`, `An unexpected error occurred: ${msg}`);
    } finally {
      this.Loading = false;
      this.cdr.detectChanges();
      this.restoreModeSwitchFocus();
    }
  }

  /** After a strip-initiated switch, hand focus to the re-rendered switch button (if the strip is back). */
  private restoreModeSwitchFocus(): void {
    if (!this._refocusModeSwitch) return;
    this._refocusModeSwitch = false;
    this.modeSwitchButton?.nativeElement.focus();
  }

  /**
   * The standard form class to mount instead of the resolver's pick, or null
   * to mount the pick. Only non-null in `'standard'` mode when a custom form is
   * actually hiding the standard one; when the pick already IS the standard
   * form there is nothing to swap. A `'standard'` request for an entity with
   * no standard form falls back to the pick and logs, so a stale deep link
   * can't break the record.
   */
  private standardFormToMount(resolution: FormResolution, entityName: string): Type<BaseFormComponent> | null {
    if (this._formMode !== 'standard') return null;
    if (!resolution.standard) {
      this.logMissingStandardFormOnce(entityName);
      return null;
    }
    return hasStandardFormAlternative(resolution) ? resolution.standard : null;
  }

  /** Entities this host has already logged a missing standard form for (lowercased names). */
  private readonly _missingStandardLogged = new Set<string>();

  /**
   * Log the "standard requested, none registered" fallback once per entity per
   * host. A stale `?form=standard` would otherwise log on every reload (each
   * variant pick, switch or input change).
   */
  private logMissingStandardFormOnce(entityName: string): void {
    const key = entityName.trim().toLowerCase();
    if (this._missingStandardLogged.has(key)) return;
    this._missingStandardLogged.add(key);
    LogError(`MjEntityFormHost: standard form requested for "${entityName}" but none is registered; showing the default form`);
  }

  /**
   * The config to bind for a given record. For brand-new (unsaved) records we hide the
   * `systemMetadata` section by default — its fields (audit timestamps, IDs, etc.) are
   * empty and irrelevant until the record exists. Doesn't mutate the consumer's config,
   * and defers entirely to a consumer that uses an explicit `VisibleSectionKeys` allowlist.
   */
  private effectiveConfigFor(record: BaseEntity): EntityFormConfig | null {
    if (record.IsSaved) return this.Config;
    if (this.Config?.VisibleSectionKeys?.length) return this.Config; // consumer owns visibility
    const SYSTEM_METADATA_KEY = 'systemMetadata';
    const hidden = this.Config?.HiddenSectionKeys ?? [];
    if (hidden.includes(SYSTEM_METADATA_KEY)) return this.Config;
    return { ...(this.Config ?? {}), HiddenSectionKeys: [...hidden, SYSTEM_METADATA_KEY] };
  }

  /**
   * Section mode: resolve a `BaseFormSectionComponent` registered as
   * `'<entity>.<section>'`, mount it, and bind the record. No resolver,
   * variants, container, or form-event surface — section components are bare
   * field editors; the host saves the record directly (see {@link Save}).
   */
  private async mountSection(entityName: string, permissions: unknown): Promise<void> {
    const key = `${entityName}.${this.SectionName}`;
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent, key);
    if (!reg?.SubClass) {
      this.fail(`No form section "${this.SectionName}" is registered for "${entityName}".`,
        `Expected a @RegisterClass(BaseFormSectionComponent, '${key}'). Check the section name.`);
      return;
    }

    const record = await this.obtainRecord(entityName);
    if (!record) return;

    this._saveHandlerSub = record.RegisterEventHandler((e: BaseEntityEvent) => {
      if (e.type === 'save') this.Saved.emit(record);
    });

    this.anchor.clear();
    const ref = this.anchor.createComponent(reg.SubClass as Type<BaseFormSectionComponent>);
    this._sectionRef = ref;
    this._currentRecord = record;
    this._isSection = true;

    const instance = ref.instance as BaseFormSectionComponent & { userPermissions?: unknown };
    instance.record = record;
    instance.userPermissions = permissions;
    instance.EditMode = this._editMode ?? this.Config?.StartInEditMode ?? !record.IsSaved;

    this.RecordReady.emit(record);
    this.LoadComplete.emit();
  }

  /** Resolve the BaseEntity to bind: the supplied instance, or a freshly loaded/new one. */
  private async obtainRecord(entityName: string, md = this.ProviderToUse): Promise<BaseEntity | null> {
    if (this._record) return this._record;
    const carried = this._carryNewRecord;
    this._carryNewRecord = null;
    // Only honor the carry for the same new record — an input swap since the switch loads normally.
    if (carried && carried.EntityInfo.Name === entityName && !this._primaryKey.HasValue) return carried;

    const record = await md.GetEntityObject<BaseEntity>(entityName, md.CurrentUser);
    if (!record) {
      this.fail(`Failed to load ${entityName} record.`, `Unable to instantiate entity "${entityName}".`);
      return null;
    }

    if (this._primaryKey.HasValue) {
      const loadOk = await record.InnerLoad(this._primaryKey);
      if (!loadOk) {
        this.fail(`Could not load ${entityName} record.`,
          record.LatestResult?.Message
            ? `Server error: ${record.LatestResult.Message}`
            : `InnerLoad returned false for key ${this._primaryKey.ToString()}.`);
        return null;
      }
    } else {
      record.NewRecord();
      this.applyNewRecordValues(record);
    }
    return record;
  }

  /** Push variant list + active selection and wire the variant-switch handler. */
  private applyVariants(
    instance: BaseFormComponent,
    resolution: FormResolution,
    entityName: string,
  ): void {
    instance.Variants = (resolution.variants ?? [])
      .filter(v => v.Status === 'Active')
      .map(v => ({ ID: v.ID, Label: v.Name ?? `Override ${v.ID.substring(0, 8)}`, Scope: v.Scope, Status: v.Status }));
    instance.CurrentVariantID = resolution.kind === 'interactive' ? resolution.override.ID : null;
    instance.OnVariantChanged = (variantID: string | null) => {
      if (variantID === null) {
        this.formResolver.SetExplicitDefault(entityName);
      } else {
        this.formResolver.SetSelectedVariant(entityName, variantID);
      }
      // Picking a variant means "show me that one" — leave the standard form.
      if (this._formMode === 'standard') {
        this._formMode = 'default';
        this.FormModeChange.emit('default');
      }
      // Reload via the resolver so tier/priority + the new selection apply.
      this._record = null; // force a fresh load against the new variant
      this.reload();
    };
  }

  /** Subscribe to the form's outputs and re-emit them through the host. */
  private subscribeToFormEvents(form: BaseFormComponent): void {
    this.cleanupFormSubs();
    this._formEventSubs.push(
      form.Navigate.subscribe(e => this.Navigate.emit(e)),
      form.Notification.subscribe(e => this.Notification.emit(e)),
      form.RecordSaved.subscribe(e => this.RecordSaved.emit(e)),
      form.RecordRefreshed.subscribe(e => this.RecordRefreshed.emit(e.Record)),
      form.RecordDeleted.subscribe(e => this.RecordDeleted.emit(e)),
      form.RecordSaveFailed.subscribe(e => this.RecordSaveFailed.emit(e)),
      form.ValidationFailed.subscribe(e => this.ValidationFailed.emit(e)),
      form.RecordReady.subscribe(e => this.RecordReady.emit(e)),
    );
    // Surface 'dismiss' navigation as a first-class Dismissed event too.
    this._formEventSubs.push(
      form.Navigate.subscribe(e => { if (e.Kind === 'dismiss') this.Dismissed.emit(); }),
    );
  }

  // ── New-record value application (URL segment or object) ──────────────────

  private applyNewRecordValues(record: BaseEntity): void {
    if (!this.NewRecordValues) return;
    if (typeof this.NewRecordValues === 'string') {
      if (this.NewRecordValues.length === 0) return;
      const fv = new FieldValueCollection();
      fv.SimpleLoadFromURLSegment(this.NewRecordValues);
      fv.KeyValuePairs
        .filter(kvp => kvp.Value !== null && kvp.Value !== undefined)
        .forEach(kvp => this.setTypedField(record, kvp.FieldName, kvp.Value));
    } else {
      const values = this.NewRecordValues as Record<string, unknown>;
      Object.keys(values)
        .filter(key => values[key] !== null && values[key] !== undefined)
        .forEach(key => this.setTypedField(record, key, values[key]));
    }
  }

  /** Set a field with TSType-aware coercion (shared by string + object paths). */
  private setTypedField(record: BaseEntity, fieldName: string, value: unknown): void {
    const f = record.Fields.find(x => x.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
    if (!f) return;
    switch (f.EntityFieldInfo.TSType) {
      case EntityFieldTSType.String:
        record.Set(fieldName, value?.toString() ?? '');
        break;
      case EntityFieldTSType.Number:
        record.Set(fieldName, typeof value === 'number' ? value : parseFloat(value?.toString() ?? '0'));
        break;
      case EntityFieldTSType.Boolean:
        if (typeof value === 'boolean') record.Set(fieldName, value);
        else if (typeof value === 'string') record.Set(fieldName, value !== 'false' && value !== '0' && value.trim().length > 0);
        else record.Set(fieldName, !!value);
        break;
      case EntityFieldTSType.Date:
        record.Set(fieldName, value instanceof Date ? value : new Date(value?.toString() ?? ''));
        break;
      default:
        record.Set(fieldName, value);
        break;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private fail(title: string, detail: string): void {
    this.ErrorTitle = title;
    this.errorDetail = detail;
    this.Loading = false;
    this.HasStandardFormAlternative = false; // no form mounted → nothing to switch between
    if (this._formComponentRef) {
      try { this._formComponentRef.destroy(); } catch { /* noop */ }
      this._formComponentRef = null;
    }
    this.anchor?.clear();
    this.LoadError.emit({ title, detail });
    this.cdr.detectChanges();
  }

  private compositeKeysEqual(a: CompositeKey | null | undefined, b: CompositeKey | null | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const aKvps = (a.KeyValuePairs || []).filter(kvp => String(kvp.Value ?? '').length > 0);
    const bKvps = (b.KeyValuePairs || []).filter(kvp => String(kvp.Value ?? '').length > 0);
    if (aKvps.length !== bKvps.length) return false;
    for (let i = 0; i < aKvps.length; i++) {
      if (aKvps[i].FieldName !== bKvps[i].FieldName) return false;
      if (String(aKvps[i].Value ?? '') !== String(bKvps[i].Value ?? '')) return false;
    }
    return true;
  }

  private cleanupFormSubs(): void {
    for (const sub of this._formEventSubs) sub.unsubscribe();
    this._formEventSubs = [];
  }

  private teardown(): void {
    this.cleanupFormSubs();
    if (this._saveHandlerSub) {
      this._saveHandlerSub.unsubscribe();
      this._saveHandlerSub = null;
    }
    if (this._formComponentRef) {
      try { this._formComponentRef.destroy(); } catch { /* noop */ }
      this._formComponentRef = null;
    }
    if (this._sectionRef) {
      try { this._sectionRef.destroy(); } catch { /* noop */ }
      this._sectionRef = null;
    }
    this._isSection = false;
    this._currentRecord = null;
    this.anchor?.clear();
  }
}
