import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MessageListComponent } from '../lib/components/message/message-list.component';

function entry(id: string) {
  return {
    kind: 'component' as const,
    ref: {
      instance: { message: { ID: id }, OpenLinksInNewTab: true },
      changeDetectorRef: { markForCheck: vi.fn() },
    },
  };
}

describe('MessageListComponent.OpenLinksInNewTab', () => {
  it('defaults to true until a host sets it', () => {
    expect((Object.create(MessageListComponent.prototype) as MessageListComponent).OpenLinksInNewTab).toBe(true);
  });

  it('pushes the value into rendered message items and marks them for check', () => {
    const a = entry('A');
    const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
    (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([
      ['A', a],
      ['X', { kind: 'embedded', ref: {} }],
    ]);

    list.OpenLinksInNewTab = false;
    expect(a.ref.instance.OpenLinksInNewTab).toBe(false);

    list.OpenLinksInNewTab = true;
    expect(a.ref.instance.OpenLinksInNewTab).toBe(true);
    expect(a.ref.changeDetectorRef.markForCheck).toHaveBeenCalledTimes(2);
  });
});

describe('OpenLinksInNewTab template wiring contract', () => {
  const chatAreaHtml = readFileSync(
    resolve(__dirname, '../lib/components/conversation/conversation-chat-area.component.html'),
    'utf8'
  );
  const messageItemHtml = readFileSync(
    resolve(__dirname, '../lib/components/message/message-item.component.html'),
    'utf8'
  );
  const realtimeOverlayHtml = readFileSync(
    resolve(__dirname, '../lib/components/realtime/realtime-session-overlay.component.html'),
    'utf8'
  );
  const realtimeThreadHtml = readFileSync(
    resolve(__dirname, '../lib/components/realtime/realtime-session-thread.component.html'),
    'utf8'
  );

  it('forwards OpenLinksInNewTab from chat-area to message-list and realtime-session-overlay', () => {
    const listStart = chatAreaHtml.indexOf('<mj-conversation-message-list');
    const listEnd = chatAreaHtml.indexOf('</mj-conversation-message-list>');
    expect(chatAreaHtml.slice(listStart, listEnd)).toContain('[OpenLinksInNewTab]="OpenLinksInNewTab"');

    const overlayStart = chatAreaHtml.indexOf('<mj-realtime-session-overlay');
    const overlayEnd = chatAreaHtml.indexOf('</mj-realtime-session-overlay>');
    expect(chatAreaHtml.slice(overlayStart, overlayEnd)).toContain('[OpenLinksInNewTab]="OpenLinksInNewTab"');
  });

  it('binds OpenLinksInNewTab on mj-markdown in message-item and realtime-session-thread', () => {
    expect(messageItemHtml).toContain('[OpenLinksInNewTab]="OpenLinksInNewTab"');
    expect(realtimeOverlayHtml).toContain('[OpenLinksInNewTab]="OpenLinksInNewTab"');
    expect(realtimeThreadHtml).toContain('[OpenLinksInNewTab]="OpenLinksInNewTab"');
  });
});
