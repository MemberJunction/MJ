import { describe, it, expect, beforeEach } from 'vitest';
import { MJPageSearchComponent } from '../lib/page-search/page-search.component';

/**
 * Tests for MJPageSearchComponent's onInput → ValueChange contract.
 * Pages bind `[Value]="searchTerm" (ValueChange)="onSearch($event)"` and rely on
 * the component to (a) keep Value in sync internally and (b) emit the new value.
 */
describe('MJPageSearchComponent', () => {
  let cmp: MJPageSearchComponent;

  beforeEach(() => {
    cmp = new MJPageSearchComponent();
  });

  describe('defaults', () => {
    it('should default Placeholder to "Search..."', () => {
      expect(cmp.Placeholder).toBe('Search...');
    });
    it('should default Value to empty string', () => {
      expect(cmp.Value).toBe('');
    });
    it('should default Icon to fa-solid fa-search', () => {
      expect(cmp.Icon).toBe('fa-solid fa-search');
    });
    it('should default focused state to false', () => {
      expect(cmp.focused).toBe(false);
    });
  });

  describe('onInput', () => {
    function mkInputEvent(value: string): Event {
      // Build a minimal Event-shaped object whose target.value matches the input.
      // We use `as Event` rather than `as any` so we still get type checking on the call.
      return { target: { value } as HTMLInputElement } as unknown as Event;
    }

    it('should update internal Value when the input changes', () => {
      cmp.onInput(mkInputEvent('agents'));
      expect(cmp.Value).toBe('agents');
    });

    it('should emit ValueChange with the new value', () => {
      const emitted: string[] = [];
      cmp.ValueChange.subscribe((v: string) => emitted.push(v));
      cmp.onInput(mkInputEvent('logs'));
      expect(emitted).toEqual(['logs']);
    });

    it('should emit empty string when input is cleared', () => {
      cmp.Value = 'previous';
      const emitted: string[] = [];
      cmp.ValueChange.subscribe((v: string) => emitted.push(v));
      cmp.onInput(mkInputEvent(''));
      expect(cmp.Value).toBe('');
      expect(emitted).toEqual(['']);
    });

    it('should fire ValueChange for every keystroke (no debounce)', () => {
      // Pages that want debouncing apply it themselves — the component must
      // emit synchronously so RxJS/Angular operators upstream can choose.
      const emitted: string[] = [];
      cmp.ValueChange.subscribe((v: string) => emitted.push(v));
      cmp.onInput(mkInputEvent('a'));
      cmp.onInput(mkInputEvent('ag'));
      cmp.onInput(mkInputEvent('age'));
      expect(emitted).toEqual(['a', 'ag', 'age']);
    });
  });
});
