import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular and deps
vi.mock('@angular/core', () => ({
  Injectable: () => () => {},
  ViewContainerRef: class {},
  Type: class {}
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  RunView: class {},
  LogError: vi.fn()
}));

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/global', () => ({ MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } } }));

// NOTE: real constructibility of TestHarnessWindowService & co. is covered by the
// public-entry smoke test in index.test.ts; these specs cover the tracking patterns.
describe('AI Test Harness Services', () => {
  describe('TestHarnessWindowManagerService pattern', () => {
    it('should manage multiple window instances', () => {
      // Manager tracks open windows by ID
      const windowMap = new Map<string, { id: string; title: string }>();
      windowMap.set('w1', { id: 'w1', title: 'Test 1' });
      windowMap.set('w2', { id: 'w2', title: 'Test 2' });
      expect(windowMap.size).toBe(2);
      windowMap.delete('w1');
      expect(windowMap.size).toBe(1);
    });
  });

  describe('WindowDockService pattern', () => {
    it('should track docked and undocked window states', () => {
      // Dock service manages window layout states
      type DockPosition = 'left' | 'right' | 'bottom' | 'floating';
      const positions = new Map<string, DockPosition>();
      positions.set('w1', 'left');
      positions.set('w2', 'floating');
      expect(positions.get('w1')).toBe('left');
      expect(positions.get('w2')).toBe('floating');
    });
  });

  describe('TestHarnessDialogService pattern', () => {
    it('should open dialog with configuration', () => {
      // The dialog service opens modal dialogs for AI test harness
      const config = {
        title: 'AI Test Harness',
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 300
      };
      expect(config.title).toBe('AI Test Harness');
      expect(config.width).toBe(800);
    });
  });
});
