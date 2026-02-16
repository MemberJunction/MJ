import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { ViewConfigSummary, QuickSaveEvent } from '../types';

/**
 * QuickSaveDialogComponent - Focused modal for saving views quickly
 *
 * Replaces the 7+ click "create new view" flow with a focused 2-3 click dialog.
 * Shows essential fields (name, description, share) plus a summary preview
 * of what the view configuration includes.
 *
 * Footer buttons determine the action:
 * - No existing view: "Create View" button
 * - Existing view: "Update" (primary) + "Save As New" (secondary) buttons
 *
 * @example
 * ```html
 * <mj-quick-save-dialog
 *   [IsOpen]="showQuickSave"
 *   [ViewEntity]="currentView"
 *   [EntityName]="entity.Name"
 *   [Summary]="configSummary"
 *   [IsSaving]="isSaving"
 *   (Save)="onQuickSave($event)"
 *   (Close)="showQuickSave = false"
 *   (OpenAdvanced)="openConfigPanel()">
 * </mj-quick-save-dialog>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-quick-save-dialog',
  templateUrl: './quick-save-dialog.component.html',
  styleUrls: ['./quick-save-dialog.component.css']
})
export class QuickSaveDialogComponent implements OnChanges {
  /**
   * Whether the dialog is open
   */
  @Input() IsOpen: boolean = false;

  /**
   * The existing view entity (null = creating new)
   */
  @Input() ViewEntity: UserViewEntityExtended | null = null;

  /**
   * Display name of the entity being viewed
   */
  @Input() EntityName: string = '';

  /**
   * Summary of what the current view configuration includes
   */
  @Input() Summary: ViewConfigSummary | null = null;

  /**
   * Whether a save is in progress
   */
  @Input() IsSaving: boolean = false;

  /**
   * Whether to default to Save As New mode (no longer used for toggle, kept for API compat)
   */
  @Input() DefaultSaveAsNew: boolean = false;

  /**
   * Emitted when the user saves
   */
  @Output() Save = new EventEmitter<QuickSaveEvent>();

  /**
   * Emitted when the dialog should close
   */
  @Output() Close = new EventEmitter<void>();

  /**
   * Emitted when user wants to open the full config panel
   */
  @Output() OpenAdvanced = new EventEmitter<void>();

  // Form state
  public Name: string = '';
  public Description: string = '';
  public IsShared: boolean = false;
  public NameTouched: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.initializeForm();
    }
  }

  /**
   * Initialize form from view entity or defaults
   */
  private initializeForm(): void {
    this.NameTouched = false;
    if (this.ViewEntity) {
      this.Name = this.ViewEntity.Name;
      this.Description = this.ViewEntity.Description || '';
      this.IsShared = this.ViewEntity.IsShared;
    } else {
      this.Name = '';
      this.Description = '';
      this.IsShared = false;
    }
    this.cdr.detectChanges();
  }

  /**
   * Handle save button click
   * @param saveAsNew - true to create a new view, false to update existing
   */
  OnSave(saveAsNew: boolean): void {
    if (!this.Name.trim() || this.IsSaving) return;

    this.Save.emit({
      Name: this.Name.trim(),
      Description: this.Description,
      IsShared: this.IsShared,
      SaveAsNew: saveAsNew
    });
  }

  /**
   * Handle close/cancel
   */
  OnClose(): void {
    this.Close.emit();
  }

  /**
   * Open advanced configuration panel
   */
  OnOpenAdvanced(): void {
    this.OpenAdvanced.emit();
  }
}
