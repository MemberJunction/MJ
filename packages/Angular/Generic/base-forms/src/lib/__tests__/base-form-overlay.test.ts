/**
 * Tests for BaseFormOverlay — the shared logic behind the dialog / slide-in /
 * window shells. Focuses on the behavior that isn't obvious and is easy to
 * regress: the close-state machine (fire Closed exactly once per open),
 * cancel guarding, save→close, primary-key resolution, and title derivation.
 *
 * The overlay is an Angular @Directive but its logic is plain TS, so we mock
 * @angular/core (decorators + a real-enough EventEmitter) and instantiate a
 * concrete subclass directly — no TestBed needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----- Module mocks -------------------------------------------------------

// Note: defined inside the factory — vi.mock is hoisted above module scope.
vi.mock('@angular/core', () => ({
  Directive: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  ViewChild: () => () => {},
  EventEmitter: class {
    private subs: Array<(v: unknown) => void> = [];
    emit(v: unknown): void { this.subs.forEach(f => f(v)); }
    subscribe(f: (v: unknown) => void): { unsubscribe: () => void } {
      this.subs.push(f);
      return { unsubscribe: () => { /* noop */ } };
    }
  },
}));

vi.mock('@memberjunction/ng-base-types', () => ({
  BaseAngularComponent: class { Provider: unknown = null; },
}));

vi.mock('@memberjunction/core', () => ({
  CompositeKey: class {
    static FromID(id: string) { return { __fromId: id }; }
  },
  BaseEntity: class {},
}));

// Type-only in the overlay, but mock defensively so nothing real loads.
vi.mock('../host/entity-form-host.component', () => ({ MjEntityFormHostComponent: class {} }));
vi.mock('../base-form-component', () => ({ BaseFormComponent: class {} }));

// ----- Test setup ---------------------------------------------------------

import { BaseFormOverlay } from '../overlays/base-form-overlay';

// Concrete subclass — BaseFormOverlay is abstract (@Directive, no template).
class TestOverlay extends BaseFormOverlay {}

let overlay: TestOverlay;
let closedEvents: string[];
let savedEvents: unknown[];
let visibleEvents: boolean[];

beforeEach(() => {
  overlay = new TestOverlay();
  closedEvents = [];
  savedEvents = [];
  visibleEvents = [];
  overlay.Closed.subscribe(r => closedEvents.push(r));
  overlay.Saved.subscribe(e => savedEvents.push(e));
  overlay.VisibleChange.subscribe(v => visibleEvents.push(v));
});

// ----- Tests --------------------------------------------------------------

describe('BaseFormOverlay close-state machine', () => {
  it('fires Closed exactly once per open and hides', () => {
    overlay.Visible = true;
    (overlay as unknown as { close: (r: string) => void }).close('save');
    expect(closedEvents).toEqual(['save']);
    expect(overlay.Visible).toBe(false);
    expect(visibleEvents).toContain(false);
  });

  it('is idempotent — a second close after the first is a no-op', () => {
    overlay.Visible = true;
    (overlay as unknown as { close: (r: string) => void }).close('save');
    (overlay as unknown as { close: (r: string) => void }).close('cancel');
    expect(closedEvents).toEqual(['save']); // only the first
  });

  it('re-arms on the next open so it can close again', () => {
    overlay.Visible = true;
    (overlay as unknown as { close: (r: string) => void }).close('cancel');
    overlay.Visible = true; // re-open
    (overlay as unknown as { close: (r: string) => void }).close('save');
    expect(closedEvents).toEqual(['cancel', 'save']);
  });
});

describe('BaseFormOverlay onCancel / onHostSaved', () => {
  it('onCancel reverts via host then closes as cancel', () => {
    const cancel = vi.fn();
    (overlay as unknown as { host: unknown }).host = { Cancel: cancel };
    overlay.Visible = true;
    overlay.onCancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(closedEvents).toEqual(['cancel']);
  });

  it('onCancel after already closed does not call host.Cancel again', () => {
    const cancel = vi.fn();
    (overlay as unknown as { host: unknown }).host = { Cancel: cancel };
    overlay.Visible = true;
    overlay.onCancel();
    overlay.onCancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('onHostSaved emits Saved with the record and closes as save', () => {
    const record = { id: 'r1' };
    overlay.Visible = true;
    overlay.onHostSaved(record as never);
    expect(savedEvents).toEqual([record]);
    expect(closedEvents).toEqual(['save']);
  });
});

describe('BaseFormOverlay effectivePrimaryKey', () => {
  const pk = (o: TestOverlay) => (o as unknown as { effectivePrimaryKey: unknown }).effectivePrimaryKey;

  it('prefers an explicit PrimaryKey over RecordID', () => {
    const explicit = { marker: 'pk' };
    overlay.PrimaryKey = explicit as never;
    overlay.RecordID = 'abc';
    expect(pk(overlay)).toBe(explicit);
  });

  it('builds a key from RecordID when no PrimaryKey', () => {
    overlay.RecordID = 'abc';
    expect(pk(overlay)).toEqual({ __fromId: 'abc' });
  });

  it('is undefined when neither is set', () => {
    expect(pk(overlay)).toBeUndefined();
  });
});

describe('BaseFormOverlay title derivation (onFormCreated)', () => {
  const formWith = (displayName: string, isSaved: boolean) =>
    ({ record: { EntityInfo: { DisplayName: displayName, Name: displayName }, IsSaved: isSaved } } as never);

  it('uses the entity label for a saved record', () => {
    overlay.onFormCreated(formWith('Accounts', true));
    expect(overlay.effectiveTitle).toBe('Accounts');
  });

  it('prefixes "New" for an unsaved record', () => {
    overlay.onFormCreated(formWith('Accounts', false));
    expect(overlay.effectiveTitle).toBe('New Accounts');
  });

  it('respects an explicit Title override', () => {
    overlay.Title = 'Custom Title';
    overlay.onFormCreated(formWith('Accounts', true));
    expect(overlay.effectiveTitle).toBe('Custom Title');
  });
});
