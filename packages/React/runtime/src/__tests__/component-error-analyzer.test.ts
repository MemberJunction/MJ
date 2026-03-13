import { describe, it, expect } from 'vitest';

import { ComponentErrorAnalyzer } from '../utilities/component-error-analyzer';

describe('ComponentErrorAnalyzer', () => {
  describe('identifyFailedComponents', () => {
    it('should return empty array for empty errors', () => {
      expect(ComponentErrorAnalyzer.identifyFailedComponents([])).toEqual([]);
    });

    it('should identify component from ReferenceError', () => {
      const errors = ['ReferenceError: MyComponent is not defined'];
      const result = ComponentErrorAnalyzer.identifyFailedComponents(errors);
      expect(result).toContain('MyComponent');
    });

    it('should identify component from render error', () => {
      const errors = ['MyWidget(...): Nothing was returned from render'];
      const result = ComponentErrorAnalyzer.identifyFailedComponents(errors);
      expect(result).toContain('MyWidget');
    });

    it('should identify component from not-a-function error', () => {
      const errors = ['SomeComponent is not a function'];
      const result = ComponentErrorAnalyzer.identifyFailedComponents(errors);
      expect(result).toContain('SomeComponent');
    });

    it('should not identify JavaScript builtins as components', () => {
      const errors = ['ReferenceError: Object is not defined'];
      const result = ComponentErrorAnalyzer.identifyFailedComponents(errors);
      expect(result).not.toContain('Object');
    });

    it('should not identify hooks as components', () => {
      const errors = ['ReferenceError: useState is not defined'];
      const result = ComponentErrorAnalyzer.identifyFailedComponents(errors);
      expect(result).not.toContain('useState');
    });

    it('should deduplicate component names', () => {
      const errors = [
        'ReferenceError: MyComponent is not defined',
        'MyComponent is not a function',
      ];
      const result = ComponentErrorAnalyzer.identifyFailedComponents(errors);
      const uniqueCount = result.filter(c => c === 'MyComponent').length;
      expect(uniqueCount).toBe(1);
    });
  });

  describe('analyzeComponentErrors', () => {
    it('should return empty array for no errors', () => {
      expect(ComponentErrorAnalyzer.analyzeComponentErrors([])).toEqual([]);
    });

    it('should return detailed failure info for ReferenceError', () => {
      const errors = ['ReferenceError: DashboardPanel is not defined'];
      const failures = ComponentErrorAnalyzer.analyzeComponentErrors(errors);
      expect(failures.length).toBeGreaterThan(0);
      const panelFailure = failures.find(f => f.componentName === 'DashboardPanel');
      expect(panelFailure).toBeDefined();
      expect(panelFailure!.errorType).toBe('not_defined');
    });

    it('should extract line numbers from errors', () => {
      const errors = ['ReferenceError: MyComp is not defined at main.js:42:10'];
      const failures = ComponentErrorAnalyzer.analyzeComponentErrors(errors);
      const compFailure = failures.find(f => f.componentName === 'MyComp');
      expect(compFailure).toBeDefined();
      expect(compFailure!.lineNumber).toBe(42);
    });

    it('should deduplicate failures by component name and error type', () => {
      const errors = [
        'ReferenceError: Widget is not defined',
        'ReferenceError: Widget is not defined at line 42',
      ];
      const failures = ComponentErrorAnalyzer.analyzeComponentErrors(errors);
      const widgetFailures = failures.filter(f => f.componentName === 'Widget' && f.errorType === 'not_defined');
      expect(widgetFailures.length).toBe(1);
    });
  });

  describe('formatAnalysisResults', () => {
    it('should format empty results message', () => {
      const result = ComponentErrorAnalyzer.formatAnalysisResults([]);
      expect(result).toBe('No component failures detected');
    });

    it('should format failure details', () => {
      const failures = [{
        componentName: 'TestComponent',
        errorType: 'not_defined',
        errorMessage: 'ReferenceError: TestComponent is not defined',
        lineNumber: 10,
      }];
      const result = ComponentErrorAnalyzer.formatAnalysisResults(failures);
      expect(result).toContain('1 component failure(s)');
      expect(result).toContain('TestComponent');
      expect(result).toContain('not_defined');
      expect(result).toContain('Line: 10');
    });

    it('should truncate long error messages', () => {
      const longMessage = 'A'.repeat(300);
      const failures = [{
        componentName: 'BigError',
        errorType: 'unknown',
        errorMessage: longMessage,
      }];
      const result = ComponentErrorAnalyzer.formatAnalysisResults(failures);
      expect(result).toContain('...');
    });
  });
});
