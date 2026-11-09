import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, click, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { ENGLISH_STRINGS } from '../strings';
import type { WidgetPhase } from '../types';
import { WidgetStatusComponent } from './widget-status.component';

/** DOM spec for the status surface: loading while booting/connecting, ended with a restart, error with a retry. */
function render(phase: WidgetPhase, extra: Record<string, unknown> = {}) {
  return renderComponentFixture(WidgetStatusComponent, { inputs: { Phase: phase, Strings: ENGLISH_STRINGS, AgentName: 'Sage', ...extra } });
}

describe('WidgetStatusComponent (DOM)', () => {
  it('announces the booting label politely while booting', () => {
    const fixture = render('booting');
    expect(query(fixture, '[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(fixture.componentInstance.LoadingLabel).toBe('Getting things ready…');
  });

  it('switches to the connecting label while connecting', () => {
    expect(render('connecting').componentInstance.LoadingLabel).toBe('Connecting you now…');
  });

  it('lets an explicit message override the loading label', () => {
    expect(render('booting', { Message: 'Hold on' }).componentInstance.LoadingLabel).toBe('Hold on');
  });

  it('shows the ended surface with the agent named, and emits Restart from its button', () => {
    const fixture = render('ended');
    expect(text(fixture, '#mjw-ended-title')).toBe("That's a wrap");
    expect(text(fixture, '.mjw-message')).toBe('Thanks for talking with us.');
    let restarts = 0;
    fixture.componentInstance.Restart.subscribe(() => restarts++);
    click(fixture, 'button');
    expect(restarts).toBe(1);
  });

  it('shows an error alert with the given message and a Try again that emits Retry', () => {
    const fixture = render('error', { Message: 'That invite link has expired.' });
    expect(fixture.nativeElement.textContent).toContain('That invite link has expired.');
    expect(fixture.nativeElement.textContent).toContain('Something went wrong');
    let retries = 0;
    fixture.componentInstance.Retry.subscribe(() => retries++);
    click(fixture, 'button');
    expect(retries).toBe(1);
  });

  it('falls back to the default error text when the message is blank', () => {
    expect(render('error', { Message: '  ' }).componentInstance.ErrorMessage).toBe(ENGLISH_STRINGS.errorDefault);
  });

  it('moves focus onto the primary action once an actionable surface is showing', () => {
    const fixture = render('error');
    expect(document.activeElement).toBe(query(fixture, 'button'));
  });

  it('has no accessibility violations on any surface', async () => {
    for (const phase of ['booting', 'ended', 'error'] as const) {
      await ExpectNoAxeViolations(render(phase));
    }
  });
});
