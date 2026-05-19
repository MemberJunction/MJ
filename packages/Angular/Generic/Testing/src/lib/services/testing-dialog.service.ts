import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface TestDialogOptions {
  testId?: string;
  suiteId?: string;
  mode?: 'test' | 'suite' | 'monitor';
}

@Injectable({
  providedIn: 'root'
})
export class TestingDialogService {
  // Slide panel state (used by dashboard template)
  IsPanelOpen = false;
  PanelOptions: TestDialogOptions | null = null;

  // Emits whenever panel state changes so OnPush components can detect it
  readonly PanelStateChanged$ = new Subject<boolean>();

  OpenAsPanel(options?: TestDialogOptions): void {
    this.PanelOptions = options ?? null;
    this.IsPanelOpen = true;
    this.PanelStateChanged$.next(true);
  }

  ClosePanel(): void {
    this.IsPanelOpen = false;
    this.PanelOptions = null;
    this.PanelStateChanged$.next(false);
  }

  OpenTestPanel(testId: string): void {
    this.OpenAsPanel({ testId, mode: 'test' });
  }

  /** Open the panel in monitor mode to view a running test's progress */
  OpenTestMonitor(testId: string): void {
    this.OpenAsPanel({ testId, mode: 'monitor' });
  }

  OpenSuitePanel(suiteId: string): void {
    this.OpenAsPanel({ suiteId, mode: 'suite' });
  }

  /** @deprecated Use OpenTestPanel instead - opens as slide panel */
  OpenTestDialog(testId: string, _viewContainerRef?: unknown): void {
    this.OpenTestPanel(testId);
  }

  /** @deprecated Use OpenSuitePanel instead - opens as slide panel */
  OpenSuiteDialog(suiteId: string, _viewContainerRef?: unknown): void {
    this.OpenSuitePanel(suiteId);
  }

  /** @deprecated Use OpenAsPanel instead - opens as slide panel */
  OpenTestRunDialog(options?: TestDialogOptions): void {
    this.OpenAsPanel(options);
  }
}
