import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { click, query } from '@memberjunction/ng-test-utils';
import { EvaluationModeToggleComponent } from './evaluation-mode-toggle.component';
import { EvaluationPreferencesService } from '../../services/evaluation-preferences.service';
import type { EvaluationPreferences } from '../../models/evaluation.types';

// Module-declared component, OnPush, with three toggle buttons whose .active class is
// bound to preferences.{showExecution|showHuman|showAuto} and (click)->toggle(key).
// The real EvaluationPreferencesService auto-loads from Metadata.Provider in its
// constructor (no provider in jsdom), so we substitute a controllable stub. The stub
// exposes only what the component template/handler touch: preferences$ and toggle().
class StubPrefsService {
  readonly subject: BehaviorSubject<EvaluationPreferences>;
  toggle = vi.fn(async (_key: keyof EvaluationPreferences) => {});
  constructor(initial: EvaluationPreferences) {
    this.subject = new BehaviorSubject<EvaluationPreferences>(initial);
  }
  get preferences$() {
    return this.subject.asObservable();
  }
}

function setup(prefs: EvaluationPreferences) {
  const stub = new StubPrefsService(prefs);
  TestBed.configureTestingModule({
    declarations: [EvaluationModeToggleComponent],
    providers: [{ provide: EvaluationPreferencesService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(EvaluationModeToggleComponent);
  fixture.detectChanges();
  return { fixture, stub };
}

describe('EvaluationModeToggleComponent (DOM)', () => {
  it('marks buttons active per the current preferences', () => {
    const { fixture } = setup({ showExecution: true, showHuman: false, showAuto: true });
    const buttons = fixture.nativeElement.querySelectorAll('.toggle-btn');
    expect(buttons.length).toBe(3);
    // order in template: Status (exec), Human, Auto
    expect(buttons[0].classList.contains('active')).toBe(true); // exec
    expect(buttons[1].classList.contains('active')).toBe(false); // human
    expect(buttons[2].classList.contains('active')).toBe(true); // auto
  });

  it('calls service.toggle with the key when a toggle button is clicked', () => {
    const { fixture, stub } = setup({ showExecution: true, showHuman: true, showAuto: false });
    click(fixture, '.toggle-btn:nth-child(2)'); // Human button
    expect(stub.toggle).toHaveBeenCalledWith('showHuman');
  });

  it('does NOT call service.toggle and shows the hint when turning off the last enabled metric', () => {
    // only exec is on; clicking it would disable all → guarded, no service call
    const { fixture, stub } = setup({ showExecution: true, showHuman: false, showAuto: false });
    expect(query(fixture, '.toggle-hint')).toBeNull();
    click(fixture, '.toggle-btn:nth-child(1)'); // Status button
    expect(stub.toggle).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(query(fixture, '.toggle-hint')).not.toBeNull();
  });

  it('reflects later preference changes pushed through the service stream', () => {
    const { fixture, stub } = setup({ showExecution: true, showHuman: true, showAuto: true });
    stub.subject.next({ showExecution: false, showHuman: true, showAuto: false });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.toggle-btn');
    expect(buttons[0].classList.contains('active')).toBe(false); // exec now off
    expect(buttons[1].classList.contains('active')).toBe(true); // human still on
  });
});
