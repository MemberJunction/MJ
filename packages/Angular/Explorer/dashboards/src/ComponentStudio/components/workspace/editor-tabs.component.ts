import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

@Component({
  selector: 'mj-editor-tabs',
  template: `
    <div class="editor-tabs-container">
      <kendo-tabstrip (tabSelect)="OnTabSelect($event)">
        <kendo-tabstrip-tab [title]="'Spec'" [selected]="state.ActiveTab === 0">
          <ng-template kendoTabContent>
            <div class="tab-content-wrapper">
              <mj-spec-editor></mj-spec-editor>
            </div>
          </ng-template>
        </kendo-tabstrip-tab>

        <kendo-tabstrip-tab [title]="'Code'" [selected]="state.ActiveTab === 1">
          <ng-template kendoTabContent>
            <div class="tab-content-wrapper">
              <mj-code-editor-panel></mj-code-editor-panel>
            </div>
          </ng-template>
        </kendo-tabstrip-tab>

        <kendo-tabstrip-tab [title]="'Requirements'" [selected]="state.ActiveTab === 2">
          <ng-template kendoTabContent>
            <div class="tab-content-wrapper">
              <mj-requirements-editor [Field]="'functionalRequirements'" [Title]="'Functional Requirements'"></mj-requirements-editor>
            </div>
          </ng-template>
        </kendo-tabstrip-tab>

        <kendo-tabstrip-tab [title]="'Design'" [selected]="state.ActiveTab === 3">
          <ng-template kendoTabContent>
            <div class="tab-content-wrapper">
              <mj-requirements-editor [Field]="'technicalDesign'" [Title]="'Technical Design'"></mj-requirements-editor>
            </div>
          </ng-template>
        </kendo-tabstrip-tab>

        <kendo-tabstrip-tab [title]="'Data'" [selected]="state.ActiveTab === 4">
          <ng-template kendoTabContent>
            <div class="tab-content-wrapper">
              <mj-data-requirements-editor></mj-data-requirements-editor>
            </div>
          </ng-template>
        </kendo-tabstrip-tab>
      </kendo-tabstrip>

      @if (state.IsRunning) {
        <div class="refresh-button-container">
          <button kendoButton (click)="OnRefreshComponent()" [look]="'flat'" title="Refresh running component">
            <i class="fa-solid fa-sync-alt"></i> Refresh Component
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .editor-tabs-container {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    :host {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    :host ::ng-deep kendo-tabstrip {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    :host ::ng-deep kendo-tabstrip .k-content {
      flex: 1;
      overflow: auto;
      padding: 0;
    }

    :host ::ng-deep kendo-tabstrip .k-tabstrip-items-wrapper {
      flex-shrink: 0;
    }

    .tab-content-wrapper {
      height: 100%;
      overflow: auto;
      padding: 8px;
    }

    .refresh-button-container {
      position: absolute;
      top: 4px;
      right: 8px;
      z-index: 10;
    }

    .refresh-button-container button {
      font-size: 12px;
    }

    .refresh-button-container i {
      margin-right: 4px;
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

  OnTabSelect(event: { index: number }): void {
    this.state.ActiveTab = event.index;
  }

  OnRefreshComponent(): void {
    this.state.RefreshComponent.emit();
  }
}
