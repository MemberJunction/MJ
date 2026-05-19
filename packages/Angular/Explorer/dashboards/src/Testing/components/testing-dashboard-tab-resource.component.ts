import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { TestingDialogService } from '@memberjunction/ng-testing';

/**
 * Testing Dashboard Tab Resource — thin shim that renders the inner component.
 * The inner owns its own <mj-page-layout> + <mj-page-header> when used standalone.
 */
@RegisterClass(BaseResourceComponent, 'TestingDashboardTabResource')
@Component({
  standalone: false,
  selector: 'mj-testing-dashboard-tab-resource',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-testing-dashboard-tab></app-testing-dashboard-tab>

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
  styles: [`:host { display: block; width: 100%; height: 100%; }`]
})
export class TestingDashboardTabResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  protected override destroy$ = new Subject<void>();

  constructor(
    public testingDialogService: TestingDialogService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.testingDialogService.PanelStateChanged$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.cdr.detectChanges();
    });

    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
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
