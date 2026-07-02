import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

/**
 * Tab index constants. The Form Builder tab is conditional — it only shows
 * up for form-role components — so we key tabs by stable index rather than
 * position-in-array. State service stores ActiveTab as the numeric index.
 */
const TAB_SPEC = 0;
const TAB_CODE = 1;
const TAB_REQUIREMENTS = 2;
const TAB_DESIGN = 3;
const TAB_DATA = 4;
const TAB_FORM_BUILDER = 5;

@Component({
  standalone: false,
  selector: 'mj-editor-tabs',
  template: `
    <div class="editor-tabs-container">
      <div class="tab-bar">
        @if (IsFormRoleComponent) {
          <button class="tab-pill" [class.active]="state.ActiveTab === ${TAB_FORM_BUILDER}" (click)="SelectTab(${TAB_FORM_BUILDER})">
            <i class="fa-solid fa-table-list"></i> Form Builder
          </button>
        }
        <button class="tab-pill" [class.active]="state.ActiveTab === ${TAB_SPEC}" (click)="SelectTab(${TAB_SPEC})">
          <i class="fa-solid fa-file-code"></i> Spec
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === ${TAB_CODE}" (click)="SelectTab(${TAB_CODE})">
          <i class="fa-solid fa-code"></i> Code
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === ${TAB_REQUIREMENTS}" (click)="SelectTab(${TAB_REQUIREMENTS})">
          <i class="fa-solid fa-clipboard-list"></i> Requirements
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === ${TAB_DESIGN}" (click)="SelectTab(${TAB_DESIGN})">
          <i class="fa-solid fa-drafting-compass"></i> Design
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === ${TAB_DATA}" (click)="SelectTab(${TAB_DATA})">
          <i class="fa-solid fa-database"></i> Data
        </button>
        <span class="tab-spacer"></span>
      </div>

      <div class="tab-content">
        @switch (state.ActiveTab) {
          @case (${TAB_SPEC}) {
            <mj-spec-editor></mj-spec-editor>
          }
          @case (${TAB_CODE}) {
            <mj-code-editor-panel></mj-code-editor-panel>
          }
          @case (${TAB_REQUIREMENTS}) {
            <mj-requirements-editor [Field]="'functionalRequirements'" [Title]="'Functional Requirements'"></mj-requirements-editor>
          }
          @case (${TAB_DESIGN}) {
            <mj-requirements-editor [Field]="'technicalDesign'" [Title]="'Technical Design'"></mj-requirements-editor>
          }
          @case (${TAB_DATA}) {
            <mj-data-requirements-editor></mj-data-requirements-editor>
          }
          @case (${TAB_FORM_BUILDER}) {
            <mj-form-builder-tab (RequestCodeTab)="SelectTab(${TAB_CODE})"></mj-form-builder-tab>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .editor-tabs-container {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .tab-bar {
      display: flex;
      align-items: center;
      padding: 0 8px;
      height: 38px;
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
      gap: 2px;
    }

    .tab-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      font-family: inherit;
    }

    .tab-pill:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }

    .tab-pill.active {
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .tab-pill i {
      font-size: 11px;
    }

    .tab-spacer {
      flex: 1;
    }

    .tab-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .tab-content > * {
      flex: 1;
      overflow: hidden;
    }
  `]
})
export class EditorTabsComponent implements OnInit, OnDestroy {

  private stateChangedSub: Subscription | null = null;
  /** Tracked so we can default to the Form Builder tab the first time a form-role component loads. */
  private lastFormRole = false;

  constructor(
    public state: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.lastFormRole = this.IsFormRoleComponent;
    this.maybeAutoSelectFormBuilder();
    this.stateChangedSub = this.state.StateChanged.subscribe(() => {
      this.maybeAutoSelectFormBuilder();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.stateChangedSub) {
      this.stateChangedSub.unsubscribe();
      this.stateChangedSub = null;
    }
  }

  SelectTab(index: number): void {
    this.state.ActiveTab = index;
    this.cdr.detectChanges();
  }

  /** True iff the current spec declares itself form-role. */
  public get IsFormRoleComponent(): boolean {
    const spec: ComponentSpec | null = this.state.GetCurrentSpec();
    return spec?.componentRole === 'form' || spec?.type === 'form';
  }

  /**
   * Auto-select the Form Builder tab the first time a form-role component
   * appears in state. Don't fight the user after that — if they switched
   * to Code or Spec, leave them there on subsequent state updates.
   */
  private maybeAutoSelectFormBuilder(): void {
    const isForm = this.IsFormRoleComponent;
    if (isForm && !this.lastFormRole) {
      this.state.ActiveTab = TAB_FORM_BUILDER;
    } else if (!isForm && this.lastFormRole) {
      // If we leave a form-role component, drop back to Spec.
      if (this.state.ActiveTab === TAB_FORM_BUILDER) {
        this.state.ActiveTab = TAB_SPEC;
      }
    }
    this.lastFormRole = isForm;
  }

}
