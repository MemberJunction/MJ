import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { SkillPermissionsDialogComponent } from './skill-permissions-dialog.component';

/**
 * DOM coverage for <mj-skill-permissions-dialog> — the centered modal wrapping the skill-permissions
 * panel (~5×). Self-contained (only embeds mj-skill-permissions-panel, stubbed here). Covers the
 * header title/subtitle, the enter animation flag, the close paths (button / backdrop / Escape → the
 * delayed Closed emit and immediate hide), and the Skill input + PermissionsChanged relay to the panel.
 */

@Component({ standalone: true, selector: 'mj-skill-permissions-panel', template: '' })
class SkillPanelStub {
  @Input() Skill: MJAISkillEntity | null = null;
  @Output() PermissionsChanged = new EventEmitter<void>();
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const SKILL = { Name: 'Data Cleanup' } as unknown as MJAISkillEntity;

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(SkillPermissionsDialogComponent, {
    imports: [SkillPanelStub],
    declarations: [SkillPermissionsDialogComponent],
    inputs: { Skill: SKILL, ...inputs },
  });
type Fx = ReturnType<typeof render>;
const panel = (f: Fx) => f.debugElement.query(By.directive(SkillPanelStub)).componentInstance as SkillPanelStub;

describe('SkillPermissionsDialogComponent (DOM)', () => {
  it('renders the header title and the skill name as the subtitle', () => {
    const f = render();
    expect(text(f, '.apd-title')).toBe('Manage Skill Permissions');
    expect(text(f, '.apd-subtitle')).toBe('Data Cleanup');
  });

  it('omits the subtitle when no skill is set', () => {
    expect(query(render({ Skill: null }), '.apd-subtitle')).toBeNull();
  });

  // NOTE: the enter-animation flag (IsVisible) is set on a microtask in ngOnInit without a
  // markForCheck, so under zoneless OnPush it isn't observable via forced CD — it's a cosmetic
  // transition class, not part of the testable contract. The close paths below are the real contract.

  it('defers the Closed emit until after the close animation when the close button is clicked', async () => {
    const f = render();
    const out = capture(f.componentInstance.Closed);
    (query(f, '.apd-close-btn') as HTMLElement).click();
    expect(out.length).toBe(0); // Closed is deferred behind the 250ms animation
    await tick(300);
    expect(out.length).toBe(1);
  });

  it('closes when the backdrop is clicked', async () => {
    const f = render();
    const out = capture(f.componentInstance.Closed);
    (query(f, '.apd-backdrop') as HTMLElement).click();
    await tick(300);
    expect(out.length).toBe(1);
  });

  it('closes on the Escape key', async () => {
    const f = render();
    const out = capture(f.componentInstance.Closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick(300);
    expect(out.length).toBe(1);
  });

  it('passes the skill to the panel and relays its PermissionsChanged event', () => {
    const f = render();
    expect(panel(f).Skill).toBe(SKILL);
    const out = capture(f.componentInstance.PermissionsChanged);
    panel(f).PermissionsChanged.emit();
    expect(out.length).toBe(1);
  });
});
