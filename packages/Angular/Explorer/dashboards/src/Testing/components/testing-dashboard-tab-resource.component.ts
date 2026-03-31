import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { TestingDialogService } from '@memberjunction/ng-testing';

/**
 * Testing Dashboard Tab Resource - displays the main dashboard overview
 */
@RegisterClass(BaseResourceComponent, 'TestingDashboardTabResource')
@Component({
  standalone: false,
  selector: 'mj-testing-dashboard-tab-resource',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="resource-container">
      <app-testing-dashboard-tab></app-testing-dashboard-tab>
    </div>

    <!-- Slide Panel for Test Execution -->
    @if (testingDialogService.IsPanelOpen) {
      <mj-slide-panel
        Mode="slide"
        [Title]="testingDialogService.PanelOptions?.testId ? 'Test Execution' : 'Run Test'"
        [Resizable]="true"
        (Closed)="OnPanelClosed()">
        <app-test-run-dialog
          [PanelMode]="true"
          [selectedTestId]="testingDialogService.PanelOptions?.testId ?? null"
          [selectedSuiteId]="testingDialogService.PanelOptions?.suiteId ?? null"
          [runMode]="testingDialogService.PanelOptions?.mode ?? 'test'"
          (PanelClose)="OnPanelClosed()">
        </app-test-run-dialog>
      </mj-slide-panel>
    }
  `,
  styles: [`
    .resource-container {
      width: 100%;
      height: 100%;
      overflow: auto;
    }
  `]
})
export class TestingDashboardTabResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    public testingDialogService: TestingDialogService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.testingDialogService.PanelStateChanged$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.cdr.detectChanges();
    });

    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public OnPanelClosed(): void {
    this.testingDialogService.ClosePanel();
    this.cdr.markForCheck();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-gauge-high';
  }
}
