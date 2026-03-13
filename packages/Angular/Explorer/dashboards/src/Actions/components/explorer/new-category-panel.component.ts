import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Metadata, LogError } from '@memberjunction/core';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { ActionExplorerStateService } from '../../services/action-explorer-state.service';
import { UUIDsEqual } from '@memberjunction/global';

@Component({
  standalone: false,
  selector: 'mj-new-category-panel',
  templateUrl: './new-category-panel.component.html',
  styleUrls: ['./new-category-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('250ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class NewCategoryPanelComponent implements OnInit, OnDestroy {
  @Input() Categories: MJActionCategoryEntity[] = [];
  @Input() PreselectedParentId: string | null = null;
  @Output() CategoryCreated = new EventEmitter<MJActionCategoryEntity>();
  @Output() Close = new EventEmitter<void>();

  public IsOpen = false;
  public IsSaving = false;

  // Form fields
  public Name = '';
  public Description = '';
  public ParentID: string | null = null;

  // Validation
  public Errors: { [key: string]: string } = {};

  private destroy$ = new Subject<void>();

  constructor(
    public StateService: ActionExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.StateService.NewCategoryPanelOpen$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isOpen => {
      this.IsOpen = isOpen;
      if (isOpen) {
        this.resetForm();
        if (this.PreselectedParentId) {
          this.ParentID = this.PreselectedParentId;
        }
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private resetForm(): void {
    this.Name = '';
    this.Description = '';
    this.ParentID = this.PreselectedParentId;
    this.Errors = {};
    this.IsSaving = false;
  }

  public onClose(): void {
    this.StateService.closeNewCategoryPanel();
    this.Close.emit();
  }

  public onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
      this.onClose();
    }
  }

  public validate(): boolean {
    this.Errors = {};

    if (!this.Name || this.Name.trim().length === 0) {
      this.Errors['name'] = 'Category name is required';
    } else if (this.Name.trim().length < 2) {
      this.Errors['name'] = 'Category name must be at least 2 characters';
    } else if (this.Name.trim().length > 200) {
      this.Errors['name'] = 'Category name must be less than 200 characters';
    }

    // Check for duplicate names within same parent
    const existingCategory = this.Categories.find(c =>
      c.Name.toLowerCase() === this.Name.trim().toLowerCase() &&
      (c.ParentID || null) === (this.ParentID || null)
    );
    if (existingCategory) {
      this.Errors['name'] = 'A category with this name already exists at this level';
    }

    return Object.keys(this.Errors).length === 0;
  }

  public async onSave(): Promise<void> {
    if (!this.validate()) {
      this.cdr.markForCheck();
      return;
    }

    this.IsSaving = true;
    this.cdr.markForCheck();

    try {
      const md = new Metadata();
      const category = await md.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories');

      category.Name = this.Name.trim();
      category.Description = this.Description.trim() || null;
      category.ParentID = this.ParentID || null;

      const saved = await category.Save();

      if (saved) {
        this.CategoryCreated.emit(category);
        this.StateService.closeNewCategoryPanel();
      } else {
        this.Errors['general'] = 'Failed to save category. Please try again.';
      }
    } catch (error) {
      LogError('Failed to create category', undefined, error);
      this.Errors['general'] = 'An error occurred while creating the category.';
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  public getParentOptions(): Array<{ text: string; value: string | null }> {
    const options: Array<{ text: string; value: string | null }> = [
      { text: '(No Parent - Root Category)', value: null }
    ];

    // Sort categories by name for easier selection
    const sortedCategories = [...this.Categories].sort((a, b) =>
      a.Name.localeCompare(b.Name)
    );

    sortedCategories.forEach(category => {
      options.push({
        text: this.getCategoryPath(category),
        value: category.ID
      });
    });

    return options;
  }

  private getCategoryPath(category: MJActionCategoryEntity): string {
    const path: string[] = [category.Name];
    let currentParentId = category.ParentID;

    while (currentParentId) {
      const parent = this.Categories.find(c => UUIDsEqual(c.ID, currentParentId));
      if (parent) {
        path.unshift(parent.Name);
        currentParentId = parent.ParentID || null;
      } else {
        break;
      }
    }

    return path.join(' / ');
  }
}
