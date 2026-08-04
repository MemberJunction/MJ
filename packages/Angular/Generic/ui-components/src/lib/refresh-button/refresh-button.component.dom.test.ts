import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJRefreshButtonComponent } from './refresh-button.component';

/**
 * DOM-level spec for <mj-refresh-button>. Renders the real template and asserts
 * on the rendered <button>, its conditional classes/attributes, label gating,
 * and the click -> OnClick guard -> Clicked @Output path.
 *
 * Uses the shared `renderComponentFixture()` helper from @memberjunction/ng-test-utils, which
 * bakes in the zoneless-correct setup order (inputs via setInput, then any
 * imperative setup, then a single detectChanges) so specs can't reintroduce the
 * NG0100 footgun.
 */
describe('MJRefreshButtonComponent (DOM)', () => {
  function buttonOf(fixture: ComponentFixture<MJRefreshButtonComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  }

  it('renders the "Refresh" label by default', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent);
    const label = buttonOf(fixture).querySelector('.mj-refresh-button__label');
    expect(label?.textContent?.trim()).toBe('Refresh');
  });

  it('hides the label when ShowLabel=false', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { inputs: { ShowLabel: false } });
    expect(buttonOf(fixture).querySelector('.mj-refresh-button__label')).toBeNull();
  });

  it('shows a custom label when Label is set', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { inputs: { Label: 'Refreshing' } });
    const label = buttonOf(fixture).querySelector('.mj-refresh-button__label');
    expect(label?.textContent?.trim()).toBe('Refreshing');
  });

  it('icon has the fa-spin class when Loading=true', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { inputs: { Loading: true } });
    const icon = fixture.nativeElement.querySelector('i.fa-arrows-rotate') as HTMLElement;
    expect(icon.classList.contains('fa-spin')).toBe(true);
  });

  it('icon does NOT have the fa-spin class when Loading=false', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { inputs: { Loading: false } });
    const icon = fixture.nativeElement.querySelector('i.fa-arrows-rotate') as HTMLElement;
    expect(icon.classList.contains('fa-spin')).toBe(false);
  });

  it('button is disabled when Loading=true', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { inputs: { Loading: true } });
    expect(buttonOf(fixture).disabled).toBe(true);
  });

  it('button is disabled when Disabled=true', () => {
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { inputs: { Disabled: true } });
    expect(buttonOf(fixture).disabled).toBe(true);
  });

  it('emits Clicked when the button is clicked (not loading/disabled)', () => {
    const spy = vi.fn();
    const fixture = renderComponentFixture(MJRefreshButtonComponent, { setup: (c) => c.Clicked.subscribe(spy) });
    buttonOf(fixture).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit Clicked when Loading=true (the guard)', () => {
    const spy = vi.fn();
    const fixture = renderComponentFixture(MJRefreshButtonComponent, {
      inputs: { Loading: true },
      setup: (c) => c.Clicked.subscribe(spy),
    });
    // Call OnClick directly to exercise the guard, not just the disabled-DOM short-circuit.
    fixture.componentInstance.OnClick(new MouseEvent('click'));
    expect(spy).not.toHaveBeenCalled();
  });
});
