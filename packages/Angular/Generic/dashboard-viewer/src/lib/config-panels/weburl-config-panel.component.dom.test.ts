import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, hasClass, typeInto, capture } from '@memberjunction/ng-test-utils';
import { WebURLConfigPanelComponent } from './weburl-config-panel.component';
import type { ConfigPanelResult } from './base-config-panel';

/**
 * DOM-level spec for <mj-weburl-config-panel> — a module-declared (standalone:false) form
 * panel using [(ngModel)] (so FormsModule is imported). It recomputes bound values
 * (urlError / showUrlPreview / hint) inside its (input)/(change) handlers and init, so we
 * render with autoDetect to stay NG0100-safe. Covers: the three sandbox radios + the
 * selected-class binding, the URL-required error surfacing via validate(), the @if preview
 * button gating, and the configChanged @Output payload.
 */
describe('WebURLConfigPanelComponent (DOM)', () => {
  function render(): ComponentFixture<WebURLConfigPanelComponent> {
    return renderComponentFixture(WebURLConfigPanelComponent, {
      imports: [FormsModule],
      declarations: [WebURLConfigPanelComponent],
      autoDetect: true,
    });
  }

  it('renders the title, url and the three security-mode radios', () => {
    const f = render();
    expect(query(f, '#partTitle')).not.toBeNull();
    expect(query(f, '#webUrl')).not.toBeNull();
    expect(queryAll(f, 'input[type="radio"][name="sandboxMode"]').length).toBe(3);
  });

  it('marks the standard radio option selected by default', () => {
    const f = render();
    const options = queryAll(f, '.radio-option');
    expect(options[0].classList.contains('selected')).toBe(true); // standard
    expect(options[1].classList.contains('selected')).toBe(false); // strict
    expect(options[2].classList.contains('selected')).toBe(false); // permissive
  });

  it('shows the form hint (no error) before any input', () => {
    const f = render();
    expect(query(f, '.form-hint')).not.toBeNull();
    expect(query(f, '.form-error')).toBeNull();
  });

  it('does not render the preview button until a valid URL is entered', () => {
    const f = render();
    expect(query(f, '.input-action-btn')).toBeNull();

    typeInto(f, '#webUrl', 'https://example.com');
    f.detectChanges();
    expect(query(f, '.input-action-btn')).not.toBeNull();
  });

  it('surfaces a required error and the error class when validate() runs with an empty URL', () => {
    const f = render();
    const result = f.componentInstance.validate();
    f.detectChanges();

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('URL is required');
    expect(text(f, '.form-error')).toBe('URL is required');
    expect(hasClass(f, '#webUrl', 'error')).toBe(true);
  });

  it('validates true once a valid URL is present', () => {
    const f = render();
    typeInto(f, '#webUrl', 'https://example.com');
    f.detectChanges();

    const result = f.componentInstance.validate();
    f.detectChanges();
    expect(result.valid).toBe(true);
    expect(query(f, '.form-error')).toBeNull();
  });

  it('emits configChanged with the built WebURL config when the URL changes', () => {
    const f = render();
    const emitted = capture<ConfigPanelResult>(f.componentInstance.configChanged);

    typeInto(f, '#webUrl', 'https://docs.example.com');
    f.detectChanges();

    expect(emitted.length).toBeGreaterThan(0);
    const last = emitted[emitted.length - 1];
    expect(last.config.type).toBe('WebURL');
    expect(last.config['url']).toBe('https://docs.example.com');
    expect(last.config['sandboxMode']).toBe('standard');
  });
});
