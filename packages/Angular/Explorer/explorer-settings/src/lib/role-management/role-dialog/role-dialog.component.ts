import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ViewEncapsulation, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { RoleEntity } from '@memberjunction/core-entities';

export interface RoleDialogData {
  role?: RoleEntity;
  mode: 'create' | 'edit';
}

export interface RoleDialogResult {
  action: 'save' | 'cancel';
  role?: RoleEntity;
}

@Component({
  standalone: false,
  selector: 'mj-role-dialog',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './role-dialog.component.html',
  styleUrls: ['./role-dialog.component.css']
})
export class RoleDialogComponent implements OnInit, OnDestroy, OnChanges {
  @Input() data: RoleDialogData | null = null;
  @Input() visible = false;
  @Output() result = new EventEmitter<RoleDialogResult>();

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private metadata = new Metadata();

  public roleForm: FormGroup;
  public isLoading = false;
  public error: string | null = null;

  constructor() {
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      description: [''],
      directoryId: ['']
    });
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data?.role && this.isEditMode) {
      this.loadRoleData();
    }
    
    // Reset form if switching to create mode or dialog becomes visible
    if (changes['visible'] && this.visible && !this.isEditMode) {
      this.resetForm();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private resetForm(): void {
    this.roleForm.reset({
      name: '',
      description: '',
      directoryId: ''
    });
    this.error = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.visible) {
      this.onCancel();
    }
  }

  public get windowTitle(): string {
    return this.isEditMode ? 'Edit Role' : 'Create New Role';
  }

  public get isEditMode(): boolean {
    return this.data?.mode === 'edit';
  }

  public get isSystemRole(): boolean {
    if (!this.data?.role) return false;
    const systemRoleNames = ['Administrator', 'User', 'Guest', 'Developer'];
    return systemRoleNames.includes(this.data.role.Name || '');
  }

  private loadRoleData(): void {
    if (!this.data?.role) return;

    const role = this.data.role;
    this.roleForm.patchValue({
      name: role.Name,
      description: role.Description,
      directoryId: role.DirectoryID
    });

    // Disable name editing for system roles
    if (this.isSystemRole) {
      this.roleForm.get('name')?.disable();
    }
  }

  public async onSubmit(): Promise<void> {
    if (this.roleForm.invalid) {
      this.markFormGroupTouched(this.roleForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let role: RoleEntity;

      if (this.isEditMode && this.data?.role) {
        // Edit existing role
        role = this.data.role;
      } else {
        // Create new role
        role = await this.metadata.GetEntityObject<RoleEntity>('Roles');
        role.NewRecord();
      }

      // Update role properties
      const formValue = this.roleForm.value;
      
      // Only update name if not a system role
      if (!this.isSystemRole) {
        role.Name = formValue.name;
      }
      
      role.Description = formValue.description;
      role.DirectoryID = formValue.directoryId || null;

      // Save role
      const saveResult = await role.Save();
      if (!saveResult) {
        throw new Error(role.LatestResult?.Message || 'Failed to save role');
      }

      this.result.emit({ action: 'save', role });

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

  public onCancel(): void {
    this.result.emit({ action: 'cancel' });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}