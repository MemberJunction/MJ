import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';

// Local query helpers (this branch's ng-test-utils exposes only renderComponentFixture).
const query = <T>(f: ComponentFixture<T>, sel: string): HTMLElement | null => f.nativeElement.querySelector(sel);
const text = <T>(f: ComponentFixture<T>, sel: string): string => query(f, sel)?.textContent ?? '';
import { LiveKitAgentStateComponent, type LiveKitAgentVisualState } from './livekit-agent-state.component';

/**
 * DOM spec for <mj-livekit-agent-state> — a standalone, pure @Input leaf. Covers the
 * State → modifier-class mapping, the thinking spinner icon, the label text (driven by
 * the labelText getter) and the ShowLabel gate.
 */
describe('LiveKitAgentStateComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitAgentStateComponent, { inputs });

  it('renders the idle state by default', () => {
    const f = render();
    expect(query(f, '.lk-agent--idle')).not.toBeNull();
    expect(text(f, '.lk-agent__label')).toContain('Agent · idle');
  });

  it('applies the state modifier class for each visual state', () => {
    for (const state of ['listening', 'thinking', 'speaking'] as LiveKitAgentVisualState[]) {
      const f = render({ State: state });
      expect(query(f, `.lk-agent--${state}`)).not.toBeNull();
    }
  });

  it('shows the spinning icon only while thinking', () => {
    const thinking = render({ State: 'thinking' });
    expect(query(thinking, '.lk-agent__orb .fa-spinner.fa-spin')).not.toBeNull();
    expect(query(thinking, '.lk-agent__orb .fa-robot')).toBeNull();

    const speaking = render({ State: 'speaking' });
    expect(query(speaking, '.lk-agent__orb .fa-robot')).not.toBeNull();
    expect(query(speaking, '.lk-agent__orb .fa-spinner')).toBeNull();
  });

  it('renders the agent name and human-readable state in the label', () => {
    const f = render({ State: 'thinking', AgentName: 'Sage' });
    expect(text(f, '.lk-agent__label')).toContain('Sage · thinking…');
  });

  it('hides the label when ShowLabel is false', () => {
    const f = render({ ShowLabel: false });
    expect(query(f, '.lk-agent__label')).toBeNull();
  });
});
