import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { ActivityIndicatorComponent } from './activity-indicator.component';
import type { ActivityIndicatorConfig } from '../../models/notification.model';

/**
 * DOM spec for <mj-activity-indicator> — a pure @Input-driven leaf.
 * Covers @if(config?.show) gating, the type → modifier-class mapping, the
 * three animated dots, and the optional activity-text branch.
 */
describe('ActivityIndicatorComponent (DOM)', () => {
  const render = (config?: ActivityIndicatorConfig) =>
    renderComponentFixture(ActivityIndicatorComponent, {
      imports: [CommonModule],
      declarations: [ActivityIndicatorComponent],
      inputs: { config },
    });

  it('renders nothing when no config is supplied', () => {
    const f = render(undefined);
    expect(query(f, '.activity-indicator')).toBeNull();
  });

  it('renders nothing when config.show is false', () => {
    const f = render({ show: false, type: 'agent' });
    expect(query(f, '.activity-indicator')).toBeNull();
  });

  it('renders the indicator with three pulse dots when show is true', () => {
    const f = render({ show: true, type: 'agent' });
    expect(query(f, '.activity-indicator')).not.toBeNull();
    expect(f.nativeElement.querySelectorAll('.activity-dots .dot').length).toBe(3);
  });

  it('applies the activity-agent modifier class for type "agent"', () => {
    const f = render({ show: true, type: 'agent' });
    expect(query(f, '.activity-indicator')?.classList.contains('activity-agent')).toBe(true);
    expect(query(f, '.activity-indicator')?.classList.contains('activity-processing')).toBe(false);
  });

  it('applies the activity-processing modifier class for type "processing"', () => {
    const f = render({ show: true, type: 'processing' });
    expect(query(f, '.activity-indicator')?.classList.contains('activity-processing')).toBe(true);
  });

  it('applies the activity-typing modifier class for type "typing"', () => {
    const f = render({ show: true, type: 'typing' });
    expect(query(f, '.activity-indicator')?.classList.contains('activity-typing')).toBe(true);
  });

  it('renders the activity-text when config.text is provided', () => {
    const f = render({ show: true, type: 'agent', text: 'Thinking…' });
    expect(text(f, '.activity-text')).toContain('Thinking…');
  });

  it('omits the activity-text when config.text is absent', () => {
    const f = render({ show: true, type: 'agent' });
    expect(query(f, '.activity-text')).toBeNull();
  });
});
