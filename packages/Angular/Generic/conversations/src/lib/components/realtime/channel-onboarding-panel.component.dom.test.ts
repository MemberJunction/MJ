import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture, click, attr } from '@memberjunction/ng-test-utils';
import { ChannelOnboardingPanelComponent } from './channels/channel-onboarding-panel.component';
import type { ChannelOnboardingDetails } from './channels/base-realtime-channel-client';

/**
 * DOM spec for <mj-channel-onboarding-panel> — the generic first-run channel intro
 * card. Pure presenter over the Content @Input: covers the null-content guard, the
 * heading/description/icon/tips rendering, the dialog a11y wiring, and the Dismissed
 * emission from both the "Got it" action and the ✕ close button.
 */
describe('ChannelOnboardingPanelComponent (DOM)', () => {
  const makeContent = (overrides: Partial<ChannelOnboardingDetails> = {}): ChannelOnboardingDetails => ({
    IconClass: 'fa-solid fa-chalkboard',
    Heading: 'Welcome to the Whiteboard',
    Description: 'Sketch ideas together in real time.',
    Tips: ['Drag to draw', 'Double-click to add a note'],
    ...overrides,
  });

  const render = (content: ChannelOnboardingDetails | null) =>
    renderComponentFixture(ChannelOnboardingPanelComponent, { inputs: { Content: content } });

  it('renders nothing when Content is null', () => {
    expect(query(render(null), '.onboarding')).toBeNull();
  });

  it('renders the heading, description and icon from the content', () => {
    const f = render(makeContent());
    expect(text(f, '.onboarding__heading')).toBe('Welcome to the Whiteboard');
    expect(text(f, '.onboarding__description')).toBe('Sketch ideas together in real time.');
    expect(query(f, '.onboarding__icon i')?.classList.contains('fa-chalkboard')).toBe(true);
  });

  it('labels the dialog with the heading for a11y', () => {
    const f = render(makeContent());
    const dialog = query(f, '.onboarding');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(attr(f, '.onboarding', 'aria-label')).toBe('Welcome to the Whiteboard');
  });

  it('renders one list item per tip', () => {
    const f = render(makeContent());
    const tips = queryAll(f, '.onboarding__tip');
    expect(tips).toHaveLength(2);
    expect(tips[0].textContent).toContain('Drag to draw');
    expect(tips[1].textContent).toContain('Double-click to add a note');
  });

  it('omits the tips list and icon when neither is supplied', () => {
    const f = render(makeContent({ Tips: [], IconClass: '' }));
    expect(query(f, '.onboarding__tips')).toBeNull();
    expect(query(f, '.onboarding__icon')).toBeNull();
  });

  it('emits Dismissed when the "Got it" button is clicked', () => {
    const f = render(makeContent());
    const dismissed = capture(f.componentInstance.Dismissed);
    click(f, '.onboarding__actions button');
    expect(dismissed).toHaveLength(1);
  });

  it('emits Dismissed when the ✕ close button is clicked', () => {
    const f = render(makeContent());
    const dismissed = capture(f.componentInstance.Dismissed);
    click(f, '.onboarding__close');
    expect(dismissed).toHaveLength(1);
  });
});
