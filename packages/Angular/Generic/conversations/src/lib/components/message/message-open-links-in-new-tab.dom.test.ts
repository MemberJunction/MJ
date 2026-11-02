import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import type { ChangeDetectorRef, ElementRef } from '@angular/core';
import { MarkdownComponent } from '@memberjunction/ng-markdown';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MessageListComponent } from './message-list.component';
import type { MessageItemComponent } from './message-item.component';

const AQHA_MESSAGE =
  'You can access the AQHA invoices site directly at https://invoices.aqha.com/.\n' +
  'Most of your billing and invoice needs can be managed through your online account via the [myAQHA Member Portal](https://www.aqha.com/myaqha).';

const makeListComponent = () =>
  new MessageListComponent(
    { markForCheck: () => {}, detectChanges: () => {} } as unknown as ChangeDetectorRef,
    { nativeElement: document.createElement('div') } as ElementRef<HTMLElement>
  );

describe('MessageListComponent — OpenLinksInNewTab real-instance defaults and restamp', () => {
  it('defaults OpenLinksInNewTab to true on a newly constructed MessageListComponent', () => {
    const list = makeListComponent();
    expect(list.OpenLinksInNewTab).toBe(true);
  });

  it('stamps OpenLinksInNewTab onto rendered MessageItemComponent entries and skips non-component entries', () => {
    const list = makeListComponent();
    const markForCheck = vi.fn();
    const item = { OpenLinksInNewTab: true } as MessageItemComponent;
    (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([
      ['m1', { kind: 'component', ref: { instance: item, changeDetectorRef: { markForCheck } } }],
      ['s1', { kind: 'session' }],
    ]);

    list.OpenLinksInNewTab = false;
    expect(item.OpenLinksInNewTab).toBe(false);
    expect(markForCheck).toHaveBeenCalledTimes(1);

    // No-op when assigned the same value
    list.OpenLinksInNewTab = false;
    expect(markForCheck).toHaveBeenCalledTimes(1);

    // Flipping back to true restamps
    list.OpenLinksInNewTab = true;
    expect(item.OpenLinksInNewTab).toBe(true);
    expect(markForCheck).toHaveBeenCalledTimes(2);
  });

  it('clicking rendered message links opens in a new tab by default and in the current tab when OpenLinksInNewTab=false', async () => {
    const list = makeListComponent();
    const item = { OpenLinksInNewTab: list.OpenLinksInNewTab } as MessageItemComponent;
    (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([
      ['m1', { kind: 'component', ref: { instance: item, changeDetectorRef: { markForCheck: () => {} } } }],
    ]);

    const fixture = renderComponentFixture(MarkdownComponent, {
      imports: [CommonModule],
      declarations: [MarkdownComponent],
      inputs: {
        data: AQHA_MESSAGE,
        OpenLinksInNewTab: item.OpenLinksInNewTab,
      },
    });

    const root = fixture.nativeElement.querySelector('.mj-markdown-container') as HTMLElement;
    const clicked: Array<{ href: string | null; target: string; rel: string }> = [];
    root.addEventListener('click', (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (anchor) {
        event.preventDefault();
        clicked.push({
          href: anchor.getAttribute('href'),
          target: anchor.target,
          rel: anchor.rel,
        });
      }
    });

    const defaultLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'));
    expect(defaultLinks).toHaveLength(2);
    defaultLinks[0].click();
    defaultLinks[1].click();

    expect(clicked).toEqual([
      { href: 'https://invoices.aqha.com/', target: '_blank', rel: 'noopener noreferrer' },
      { href: 'https://www.aqha.com/myaqha', target: '_blank', rel: 'noopener noreferrer' },
    ]);

    // Host flips OpenLinksInNewTab to false on MessageListComponent -> restamps item -> updates mj-markdown
    clicked.length = 0;
    list.OpenLinksInNewTab = false;
    fixture.componentRef.setInput('OpenLinksInNewTab', item.OpenLinksInNewTab);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    const sameTabLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'));
    expect(sameTabLinks).toHaveLength(2);
    sameTabLinks[0].click();
    sameTabLinks[1].click();

    expect(clicked).toEqual([
      { href: 'https://invoices.aqha.com/', target: '', rel: '' },
      { href: 'https://www.aqha.com/myaqha', target: '', rel: '' },
    ]);
  });
});
