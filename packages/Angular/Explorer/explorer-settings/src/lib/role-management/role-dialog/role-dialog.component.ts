import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ViewEncapsulation, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { MJRoleEntity } from '@memberjunction/core-entities';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface RoleDialogData {
  role?: MJRoleEntity;
  mode: 'create' | 'edit';
}

export interface RoleDialogResult {
  action: 'save' | 'cancel';
  role?: MJRoleEntity;
}

@Component({
  standalone: false,
  selector: 'mj-role-dialog',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './role-dialog.component.html',
  styleUrls: ['./role-dialog.component.css']
})
export class RoleDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges {
  @Input() Data: RoleDialogData | null = null;

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: RoleDialogData | null) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): RoleDialogData | null {
    return this.Data;
  }
  @Input() Visible = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: RoleDialogComponent['Visible']) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): RoleDialogComponent['Visible'] {
    return this.Visible;
  }
  @Output() Result = new EventEmitter<RoleDialogResult>();

  /**
   * @deprecated Use {@link Result}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (result) keeps working. Must stay AFTER Result: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() result = this.Result;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private get metadata() { return this.ProviderToUse; }
  public RoleForm: FormGroup;

  /** @deprecated Use {@link RoleForm}. */
  public get roleForm(): FormGroup {
    return this.RoleForm;
  }
  /** @deprecated Use {@link RoleForm}. */
  public set roleForm(value: FormGroup) {
    this.RoleForm = value;
  }
  public isLoading = false;
  public error: string | null = null;

  constructor() {
    super();
    this.RoleForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      description: [''],
      directoryId: ['']
    });
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.Data?.role && this.IsEditMode) {
      this.loadRoleData();
    }
    
    // Reset form if switching to create mode or dialog becomes visible
    if (changes['visible'] && this.Visible && !this.IsEditMode) {
      this.resetForm();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private resetForm(): void {
    this.RoleForm.reset({
      name: '',
      description: '',
      directoryId: ''
    });
    this.error = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.Visible) {
      this.onCancel();
    }
  }

  public get WindowTitle(): string {
    return this.IsEditMode ? 'Edit Role' : 'Create New Role';
  }

  /** @deprecated Use {@link WindowTitle}. */
  public get windowTitle(): string {
    return this.WindowTitle;
  }

  public get IsEditMode(): boolean {
    return this.Data?.mode === 'edit';
  }

  /** @deprecated Use {@link IsEditMode}. */
  public get isEditMode(): boolean {
    return this.IsEditMode;
  }

  public get IsSystemRole(): boolean {
    if (!this.Data?.role) return false;
    const systemRoleNames = ['Administrator', 'User', 'Guest', 'Developer'];
    return systemRoleNames.includes(this.Data.role.Name || '');
  }

  /** @deprecated Use {@link IsSystemRole}. */
  public get isSystemRole(): boolean {
    return this.IsSystemRole;
  }

  private loadRoleData(): void {
    if (!this.Data?.role) return;

    const role = this.Data.role;
    this.RoleForm.patchValue({
      name: role.Name,
      description: role.Description,
      directoryId: role.DirectoryID
    });

    // Disable name editing for system roles
    if (this.IsSystemRole) {
      this.RoleForm.get('name')?.disable();
    }
  }

  public async OnSubmit(): Promise<void> {
    if (this.RoleForm.invalid) {
      this.markFormGroupTouched(this.RoleForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let role: MJRoleEntity;

      if (this.IsEditMode && this.Data?.role) {
        // Edit existing role
        role = this.Data.role;
      } else {
        // Create new role
        role = await this.metadata.GetEntityObject<MJRoleEntity>('MJ: Roles');
        role.NewRecord();
      }

      // Update role properties
      const formValue = this.RoleForm.value;
      
      // Only update name if not a system role
      if (!this.IsSystemRole) {
        role.Name = formValue.name;
      }
      
      role.Description = formValue.description;
      role.DirectoryID = formValue.directoryId || null;

      // Save role
      const saveResult = await role.Save();
      if (!saveResult) {
        throw new Error(role.LatestResult?.Message || 'Failed to save role');
      }

      this.Result.emit({ action: 'save', role });

    } catch (error: unknown) {
      console.error('Error saving role:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'An unexpected error occurred';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link OnSubmit}. */
  public async onSubmit(): Promise<void> {
    return this.OnSubmit();
  }

  public onCancel(): void {
    this.Result.emit({ action: 'cancel' });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}