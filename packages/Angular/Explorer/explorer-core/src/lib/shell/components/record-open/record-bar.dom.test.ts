import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { RecordBarComponent } from './record-bar.component';

/**
 * DOM coverage for the mobile record bar — the records region's chrome below
 * the shell breakpoint. One button: active record identity + open count;
 * clicking anywhere on it requests the record switcher.
 */

function render(inputs: { Title?: string; Icon?: string; Color?: string; Count?: number }) {
  const fixture = renderComponentFixture(RecordBarComponent, {
    imports: [RecordBarComponent],
    autoDetect: true
  });
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe('RecordBarComponent (DOM)', () => {
  it('renders the active record title, icon, and count', () => {
    const fixture = render({ Title: 'AssociationDemo', Icon: 'fa-solid fa-puzzle-piece', Color: '#5c6bc0', Count: 7 });
    expect(query(fixture, '.record-bar-title')?.textContent?.trim()).toBe('AssociationDemo');
    expect(query(fixture, '.record-bar-icon i')?.className).toContain('fa-puzzle-piece');
    expect(query(fixture, '.record-bar-count-num')?.textContent?.trim()).toBe('7');
  });

  it('tints the icon with the app color via inline style', () => {
    const fixture = render({ Title: 'X', Color: 'rgb(92, 107, 192)', Count: 1 });
    const icon = query(fixture, '.record-bar-icon') as HTMLElement;
    expect(icon.style.color).toBe('rgb(92, 107, 192)');
  });

  it('is a single button whose aria-label carries the count', () => {
    const fixture = render({ Title: 'X', Count: 3 });
    const bar = query(fixture, 'button.record-bar') as HTMLButtonElement;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-label')).toBe('Switch records — 3 open');
    expect(bar.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('emits SwitcherRequested on click', () => {
    const fixture = render({ Title: 'X', Count: 2 });
    let emitted = 0;
    fixture.componentInstance.SwitcherRequested.subscribe(() => emitted++);
    (query(fixture, 'button.record-bar') as HTMLButtonElement).click();
    expect(emitted).toBe(1);
  });
});
