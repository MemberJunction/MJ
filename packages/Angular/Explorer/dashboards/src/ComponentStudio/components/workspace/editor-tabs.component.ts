import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

@Component({
  selector: 'mj-editor-tabs',
  template: `
    <div class="editor-tabs-container">
      <div class="tab-bar">
        <button class="tab-pill" [class.active]="state.ActiveTab === 0" (click)="SelectTab(0)">
          <i class="fa-solid fa-file-code"></i> Spec
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === 1" (click)="SelectTab(1)">
          <i class="fa-solid fa-code"></i> Code
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === 2" (click)="SelectTab(2)">
          <i class="fa-solid fa-clipboard-list"></i> Requirements
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === 3" (click)="SelectTab(3)">
          <i class="fa-solid fa-drafting-compass"></i> Design
        </button>
        <button class="tab-pill" [class.active]="state.ActiveTab === 4" (click)="SelectTab(4)">
          <i class="fa-solid fa-database"></i> Data
        </button>
        <span class="tab-spacer"></span>
      </div>

      <div class="tab-content">
        @switch (state.ActiveTab) {
          @case (0) {
            <mj-spec-editor></mj-spec-editor>
          }
          @case (1) {
            <mj-code-editor-panel></mj-code-editor-panel>
          }
          @case (2) {
            <mj-requirements-editor [Field]="'functionalRequirements'" [Title]="'Functional Requirements'"></mj-requirements-editor>
          }
          @case (3) {
            <mj-requirements-editor [Field]="'technicalDesign'" [Title]="'Technical Design'"></mj-requirements-editor>
          }
          @case (4) {
            <mj-data-requirements-editor></mj-data-requirements-editor>
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
      background: var(--mat-sys-surface-container-low);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
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
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      font-family: inherit;
    }

    .tab-pill:hover {
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
    }

    .tab-pill.active {
      background: var(--mat-sys-surface);
      color: var(--mat-sys-primary);
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

  constructor(
    public state: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.stateChangedSub = this.state.StateChanged.subscribe(() => {
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

}
