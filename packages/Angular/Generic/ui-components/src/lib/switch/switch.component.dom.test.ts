import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJSwitchComponent } from './switch.component';

/**
 * DOM-level spec for `<mj-switch>`. Proves the harness renders a real template
 * and that the rendered `<button role="switch">` is wired to component state.
 *
 * Class-level behavior (CVA contract: writeValue / registerOnChange) is covered
 * by instantiating the class directly; here we assert on the *rendered DOM* and
 * on the click → handler → state path that only exists in the template.
 *
 * Zoneless note: change detection is driven explicitly with
 * `fixture.detectChanges()`. State that is set *programmatically* (not via a DOM
 * event or `componentRef.setInput`) must be set BEFORE the first
 * `detectChanges()`; otherwise the dev-mode check-no-changes pass throws NG0100
 * because the view was never marked dirty. See guides/ANGULAR_TESTING_GUIDE.md.
 */
describe('MJSwitchComponent (DOM)', () => {
  function buttonOf(fixture: ComponentFixture<MJSwitchComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button.mj-switch') as HTMLButtonElement;
  }

  function render(): { fixture: ComponentFixture<MJSwitchComponent>; button: HTMLButtonElement } {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    fixture.detectChanges();
    return { fixture, button: buttonOf(fixture) };
  }

  it('renders a switch button with aria-checked reflecting Value (off by default)', () => {
    const { button } = render();
    expect(button).not.toBeNull();
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.classList.contains('mj-switch--on')).toBe(false);
  });

  it('toggles Value and the on-class / aria-checked when clicked', () => {
    const { fixture, button } = render();

    button.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.Value).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.classList.contains('mj-switch--on')).toBe(true);
  });

  it('emits the new value through the CVA onChange when the button is clicked', () => {
    const { fixture, button } = render();
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);

    button.click();

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders no label span when neither OnLabel nor OffLabel is set', () => {
    const { button } = render();
    expect(button.querySelector('.mj-switch-label')).toBeNull();
  });

  it('renders the OffLabel text when OffLabel is set and Value is false', () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    // @Input set via setInput marks the view dirty the zoneless-correct way.
    fixture.componentRef.setInput('OffLabel', 'Off');
    fixture.detectChanges();

    const label = buttonOf(fixture).querySelector('.mj-switch-label');
    expect(label).not.toBeNull();
    expect(label?.textContent?.trim()).toBe('Off');
  });

  it('reflects the disabled state into the rendered button and blocks toggling', () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    // Set disabled BEFORE the first CD pass (programmatic state, no DOM event).
    fixture.componentInstance.setDisabledState(true);
    fixture.detectChanges();
    const button = buttonOf(fixture);

    expect(button.disabled).toBe(true);
    expect(button.classList.contains('mj-switch--disabled')).toBe(true);

    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.Value).toBe(false);
  });
});
