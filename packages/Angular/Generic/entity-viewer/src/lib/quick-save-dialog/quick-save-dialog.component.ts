import { Component, Input, Output, EventEmitter, OnChanges, AfterViewInit, SimpleChanges, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { ViewConfigSummary, QuickSaveEvent, QuickSaveAdvancedEvent } from '../types';

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
export class QuickSaveDialogComponent implements OnChanges, AfterViewInit {
  /**
   * Whether the dialog is open
   */
  @Input() IsOpen: boolean = false;

  /**
   * The existing view entity (null = creating new)
   */
  @Input() ViewEntity: MJUserViewEntityExtended | null = null;

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
   * Name to pre-fill when creating a NEW view, so the user can accept it with a single click.
   * The field is focused and its text selected on open, so typing replaces it outright.
   *
   * Ignored when {@link ViewEntity} is set — an existing view's own name always wins.
   */
  @Input() SuggestedName: string = '';

  /**
   * Emitted when the user saves
   */
  @Output() Save = new EventEmitter<QuickSaveEvent>();

  /**
   * Emitted when the dialog should close
   */
  @Output() Close = new EventEmitter<void>();

  /**
   * Emitted when user wants to open the full config panel.
   * Carries the partially-filled form data so the config panel can continue the flow.
   */
  @Output() OpenAdvanced = new EventEmitter<QuickSaveAdvancedEvent>();

  /** The name input, focused and selected whenever the dialog opens. */
  @ViewChild('nameInput') private nameInput?: ElementRef<HTMLInputElement>;

  // Form state
  public Name: string = '';
  public Description: string = '';
  public IsShared: boolean = false;
  public NameTouched: boolean = false;

  /**
   * True when the dialog opened before the view existed, so the focus has to wait for
   * `ngAfterViewInit`. The panel is always in the DOM (only `[class.open]` toggles), so after
   * the first render the ViewChild is resolved and opening can focus synchronously.
   */
  private focusPending: boolean = false;
  private viewReady: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen) {
      this.initializeForm();
      if (this.viewReady) {
        this.focusNameField();
      } else {
        this.focusPending = true;
      }
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.focusPending) {
      this.focusPending = false;
      this.focusNameField();
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
      this.Name = this.SuggestedName || '';
      this.Description = '';
      this.IsShared = false;
    }
    this.cdr.detectChanges();
  }

  /**
   * Put the cursor in the name field with its text selected: one click accepts a suggested
   * name, one keystroke replaces it.
   *
   * Deferred by a microtask because `ngModel` writes the seeded value to the element on one of
   * its own — selecting first would select an empty field and leave the caret at the end once
   * the value landed.
   */
  private focusNameField(): void {
    queueMicrotask(() => {
      const input = this.nameInput?.nativeElement;
      if (!input || !this.IsOpen) {
        return;
      }
      input.focus();
      input.select();
    });
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
   * Open advanced configuration panel, carrying partially-filled form data
   */
  OnOpenAdvanced(): void {
    this.OpenAdvanced.emit({
      Name: this.Name.trim(),
      Description: this.Description,
      IsShared: this.IsShared
    });
  }
}
