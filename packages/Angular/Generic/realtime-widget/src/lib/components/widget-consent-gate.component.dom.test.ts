import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, click, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { ENGLISH_STRINGS } from '../strings';
import { WidgetConsentGateComponent } from './widget-consent-gate.component';

/**
 * DOM spec for the consent gate. The gate is declarative: it renders the notice and emits the visitor's
 * decision. It must put "Begin" LEFT of "Not now" (MJ's dialog-button rule), move entry focus to its region
 * without stealing it onto a control, and substitute the agent's name into the copy.
 */
function render(inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(WidgetConsentGateComponent, { inputs: { Strings: ENGLISH_STRINGS, AgentName: 'Sage', ...inputs } });
}

describe('WidgetConsentGateComponent (DOM)', () => {
  it('names the agent in the notice and states that the microphone stays off until Begin', () => {
    const fixture = render();
    expect(text(fixture, '.mjw-consent__notice')).toContain('You will talk with Sage, an AI assistant');
    expect(text(fixture, '.mjw-consent__foot')).toContain('microphone stays off until you choose Begin');
  });

  it('puts Begin on the left and Not now on the right', () => {
    const fixture = render();
    const labels = queryAll(fixture, '.mjw-actions button').map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Begin', 'Not now']);
  });

  it('emits Accepted from Begin and Declined from Not now, and nothing else', () => {
    const fixture = render();
    const accepted: unknown[] = [];
    const declined: unknown[] = [];
    fixture.componentInstance.Accepted.subscribe((v) => accepted.push(v));
    fixture.componentInstance.Declined.subscribe((v) => declined.push(v));
    click(fixture, '.mjw-consent__decline');
    expect([accepted.length, declined.length]).toEqual([0, 1]);
    click(fixture, '.mjw-consent__begin');
    expect([accepted.length, declined.length]).toEqual([1, 1]);
  });

  it('lands entry focus on the region, not on a control', () => {
    const fixture = render();
    const region = query(fixture, '[role="region"]') as HTMLElement;
    expect(region.getAttribute('aria-labelledby')).toBe('mjw-consent-title');
    expect(region.getAttribute('tabindex')).toBe('-1');
  });

  it('uses a custom greeting when given and the default otherwise', () => {
    expect(text(render(), '#mjw-consent-title')).toBe('Welcome');
    expect(text(render({ Greeting: 'Hi there' }), '#mjw-consent-title')).toBe('Hi there');
    expect(text(render({ Greeting: '   ' }), '#mjw-consent-title')).toBe('Welcome');
  });

  it('shows a logo only when one is supplied', () => {
    expect(query(render(), '.mjw-logo')).toBeNull();
    expect((query(render({ LogoUrl: 'https://example.com/logo.png' }), '.mjw-logo') as HTMLImageElement).getAttribute('src')).toBe('https://example.com/logo.png');
  });

  it('has no accessibility violations', async () => {
    await ExpectNoAxeViolations(render());
  });
});
