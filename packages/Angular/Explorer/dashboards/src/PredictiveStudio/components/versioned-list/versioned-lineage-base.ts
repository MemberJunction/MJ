/**
 * The shared behaviour of the versioned-lineage widgets (Evaluation Protocol and Prediction Unit versions): load every
 * version of one lineage (a newer load supersedes an older one), select one, and save the next version as a new row
 * after a cancelable `BeforeVersionSaved`, reporting the outcome in `AfterVersionSaved`. Each widget supplies its
 * entity name, how its versions are read and parsed, and how a draft is written into a new row.
 */
import { ChangeDetectorRef, Directive, EventEmitter, inject, OnInit, Output } from '@angular/core';
import type { BaseEntity } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { Actor } from '@memberjunction/predictive-studio-core';
import { AfterVersionSavedEventArgs, BeforeVersionSavedEventArgs } from '../ps-widget-events';
import type { LineageRead, VersionedEntityName, VersionIdentity } from './lineage-reads';

/** A version to write: its draft and the version number the new row carries. */
export interface VersionWrite<TDraft> {
  readonly Draft: TDraft;
  readonly Meta: { readonly Version: number };
}

/**
 * Base of the versioned-lineage widgets.
 * @typeParam TVersion - one parsed version of the lineage
 * @typeParam TDraft - the authored content of a version
 * @typeParam TWrite - a version to write
 * @typeParam TEntity - the entity row a version is written to
 * @typeParam TRelated - what the widget reads beside the versions (nothing by default)
 */
@Directive()
export abstract class PSVersionedLineageBase<
  TVersion extends { readonly Row: VersionIdentity },
  TDraft,
  TWrite extends VersionWrite<TDraft>,
  TEntity extends BaseEntity & { readonly ID: string },
  TRelated = never,
> extends BaseAngularComponent implements OnInit {
  protected readonly cdr = inject(ChangeDetectorRef);
  /** Any version row of the lineage the widget shows. */
  protected lineageId: string | null = null;
  private isInitialized = false;
  /** Increments on every load; a load whose number is no longer current drops its result. */
  private loadSeq = 0;

  /** Fired before a version row is saved; a host may cancel it. */
  @Output() BeforeVersionSaved = new EventEmitter<BeforeVersionSavedEventArgs<TDraft>>();
  /** Fired after a save was attempted: the saved row's ID (for version 1, the ID the server gave it) or the error. */
  @Output() AfterVersionSaved = new EventEmitter<AfterVersionSavedEventArgs>();

  public Versions: readonly TVersion[] = [];
  public Selected: TVersion | null = null;
  public Editing = false;
  public IsLoading = false;
  public Error: string | null = null;

  /** The versioned entity the widget reads and writes. */
  protected abstract readonly EntityName: VersionedEntityName;

  /** The parsed versions of the lineage `anyVersionId` belongs to, or why they cannot be shown. */
  protected abstract readVersions(anyVersionId: string): Promise<LineageRead<TVersion>>;

  /** Writes `version` into the new, empty `row`. */
  protected abstract applyDraftToRow(row: TEntity, version: TWrite): void;

  public ngOnInit(): void {
    this.isInitialized = true;
    void this.Load();
  }

  public get Latest(): TVersion | null {
    return this.Versions[this.Versions.length - 1] || null;
  }

  /** The current user, who authors any version saved here. */
  public get Author(): Actor {
    return { kind: 'human', userId: this.ProviderToUse.CurrentUser.ID };
  }

  public Select(v: TVersion): void {
    this.Selected = v;
    this.Editing = false;
  }

  /** Loads every version of the lineage and what the widget shows beside it; a newer load supersedes it. */
  public async Load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.resetState();
    const id = this.lineageId;
    if (id !== null) {
      this.IsLoading = true;
      this.cdr.detectChanges();
      const versions = await this.readVersions(id);
      const related = versions.Ok ? await this.readRelated(versions.Rows) : null;
      if (seq !== this.loadSeq) return;
      this.applyVersions(versions, id);
      if (versions.Ok) this.applyRelated(related);
      this.IsLoading = false;
    }
    this.cdr.detectChanges();
  }

  /** Rebinds the widget to another lineage; loads it once the widget is initialized. */
  protected setLineageId(value: string | null): void {
    if (UUIDsEqual(value, this.lineageId)) return;
    this.lineageId = value;
    // Before init the Provider input may not be bound yet; ngOnInit performs the first load.
    if (this.isInitialized) void this.Load();
  }

  /** Reads what the widget shows beside the versions; the base reads nothing. */
  protected async readRelated(_versions: readonly TVersion[]): Promise<TRelated | null> {
    return null;
  }

  /** Shows what `readRelated` returned; the base shows nothing. */
  protected applyRelated(_related: TRelated | null): void {
    // nothing is read beside the versions by default
  }

  /** Clears what the previous record showed, so a failed or empty load never shows it next to the new state. */
  protected resetState(): void {
    this.Error = null;
    this.Versions = [];
    this.Selected = null;
    this.Editing = false;
    this.IsLoading = false;
  }

  /** Saves `version` as a new row after a cancelable `BeforeVersionSaved`, then reloads on the saved row. */
  protected async saveVersion(version: TWrite): Promise<void> {
    const before = new BeforeVersionSavedEventArgs<TDraft>(this.EntityName, version.Meta.Version, version.Draft);
    this.BeforeVersionSaved.emit(before);
    if (before.Cancel) {
      this.Error = before.CancelReason || null;
      this.cdr.detectChanges();
      return;
    }
    const savedId = await this.writeRow(version);
    this.AfterVersionSaved.emit(new AfterVersionSavedEventArgs(this.EntityName, version.Meta.Version, savedId, savedId !== null, savedId === null ? this.Error : null));
    if (savedId === null) {
      this.cdr.detectChanges();
      return;
    }
    this.lineageId = savedId;
    await this.Load();
  }

  /** Writes and saves the row; its ID after the save, or null with `Error` set. */
  private async writeRow(version: TWrite): Promise<string | null> {
    const p = this.ProviderToUse;
    const row = await p.GetEntityObject<TEntity>(this.EntityName, p.CurrentUser);
    row.NewRecord();
    this.applyDraftToRow(row, version);
    if (await row.Save()) return row.ID;
    this.Error = row.LatestResult?.CompleteMessage || 'The new version could not be saved.';
    return null;
  }

  private applyVersions(versions: LineageRead<TVersion>, anyVersionId: string): void {
    if (!versions.Ok) {
      this.Error = versions.Error;
      return;
    }
    this.Versions = versions.Rows;
    this.Selected = versions.Rows.find((v) => UUIDsEqual(v.Row.ID, anyVersionId)) || this.Latest;
  }
}
