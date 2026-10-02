import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import { RealtimeSessionThreadComponent } from '../lib/components/realtime/realtime-session-thread.component';
import { RealtimeSessionState, RealtimeThreadItem } from '../lib/components/realtime/realtime-session-state';

describe('RealtimeSessionThreadComponent — clamping and expansion', () => {
  function createComponent(): RealtimeSessionThreadComponent {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }
      ]
    });
    return runInInjectionContext(injector, () => {
      const comp = new RealtimeSessionThreadComponent();
      comp.State = new RealtimeSessionState();
      return comp;
    });
  }

  it('identifies short text as not long', () => {
    const comp = createComponent();
    expect(comp.IsLongText(null)).toBe(false);
    expect(comp.IsLongText(undefined)).toBe(false);
    expect(comp.IsLongText('')).toBe(false);
    expect(comp.IsLongText('Hello, this is a short message.')).toBe(false);
    expect(comp.IsLongText('Line 1\nLine 2\nLine 3\nLine 4')).toBe(false);
  });

  it('identifies text exceeding 280 characters as long', () => {
    const comp = createComponent();
    const longText = 'A'.repeat(281);
    expect(comp.IsLongText(longText)).toBe(true);
  });

  it('identifies multi-line text with >4 lines as long', () => {
    const comp = createComponent();
    const multiLine = '- Point 1\n- Point 2\n- Point 3\n- Point 4\n- Point 5';
    expect(comp.IsLongText(multiLine)).toBe(true);
  });

  it('tracks expanded state per item index', () => {
    const comp = createComponent();
    expect(comp.IsExpanded(0)).toBe(false);
    expect(comp.IsExpanded(1)).toBe(false);

    comp.ToggleExpanded(0);
    expect(comp.IsExpanded(0)).toBe(true);
    expect(comp.IsExpanded(1)).toBe(false);

    comp.ToggleExpanded(0);
    expect(comp.IsExpanded(0)).toBe(false);
  });

  it('stops event propagation when toggling expand', () => {
    const comp = createComponent();
    const mockEvent = new Event('click');
    const spy = vi.spyOn(mockEvent, 'stopPropagation');

    comp.ToggleExpanded(2, mockEvent);
    expect(spy).toHaveBeenCalled();
    expect(comp.IsExpanded(2)).toBe(true);
  });

  it('tracks thread items correctly', () => {
    const comp = createComponent();
    const captionItem: RealtimeThreadItem = {
      Kind: 'caption',
      Role: 'User',
      Text: 'Test message',
    };
    const dividerItem: RealtimeThreadItem = {
      Kind: 'divider',
      Label: 'Resumed',
      At: new Date(),
      Icon: 'fa-solid fa-play',
    };

    expect(comp.TrackItem(0, captionItem)).toBe('c:0');
    expect(comp.TrackItem(5, dividerItem)).toBe('s:5');
  });

  it('FormatMarkdownText normalizes flattened headings and lists', () => {
    const comp = createComponent();
    expect(comp.FormatMarkdownText(null)).toBe('');
    expect(comp.FormatMarkdownText(undefined)).toBe('');

    const flattened = 'Title ### Subtitle Paragraph text. - Item 1 - Item 2';
    const formatted = comp.FormatMarkdownText(flattened);
    expect(formatted).toContain('Title\n\n### Subtitle');
    expect(formatted).toContain('\n- Item 1\n- Item 2');

    const alreadyMultiLine = '# Title\n\n### Subtitle\n\nParagraph text here.\n\n- Item 1\n- Item 2';
    expect(comp.FormatMarkdownText(alreadyMultiLine)).toBe(alreadyMultiLine);
  });
});
