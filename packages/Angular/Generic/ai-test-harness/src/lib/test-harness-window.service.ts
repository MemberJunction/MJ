import { Injectable } from '@angular/core';

export interface TestResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime?: number;
  tokensUsed?: number;
  cost?: number;
}

/**
 * @deprecated Use TestHarnessWindowManagerService instead.
 * This service opens test harness windows.
 * It is retained only because the TestResult interface is exported from here
 * and consumed by other services.
 */
@Injectable({
    providedIn: 'root'
})
export class TestHarnessWindowService {
}
