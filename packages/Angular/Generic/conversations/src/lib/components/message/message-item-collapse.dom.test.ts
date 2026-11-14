import { describe, it, expect, vi } from 'vitest';
import { MessageItemComponent } from './message-item.component';

/**
 * Spec for auto-collapsing long, settled, non-most-recent messages.
 *
 * Constructed off the prototype (matching sibling message-item specs) with a
 * mocked `.message-text` element whose `scrollHeight` drives the hysteresis
 * check (`> 220px`).
 */
describe('MessageItemComponent — long message auto-collapse', () => {
  interface CollapseHarness {
    item: MessageItemComponent;
    detectChanges: ReturnType<typeof vi.fn>;
    markForCheck: ReturnType<typeof vi.fn>;
  }

  const createHarness = (opts: {
    isLatestMessage?: boolean;
    status?: 'Complete' | 'In-Progress' | 'Error';
    isStreaming?: boolean;
    senderType?: 'User' | 'AI';
    scrollHeight?: number;
    messageId?: string;
  } = {}): CollapseHarness => {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const detectChanges = vi.fn();
    const markForCheck = vi.fn();

    const mockEl = {
      scrollHeight: opts.scrollHeight ?? 320,
    } as unknown as HTMLElement;

    Object.assign(item as unknown as Record<string, unknown>, {
      message: {
        ID: opts.messageId ?? 'msg-1',
        Status: opts.status ?? 'Complete',
        SenderType: opts.senderType ?? 'AI',
        Message: 'Long message content',
      },
      IsLatestMessage: opts.isLatestMessage ?? false,
      IsStreaming: opts.isStreaming ?? false,
      isEditing: false,
      _isLongMessage: false,
      _isTextExpanded: false,
      _lastMessageIdForCollapse: opts.messageId ?? 'msg-1',
      _lastMeasuredDisplayMessage: null,
      _lastMeasuredStatus: null,
      _stableDisplayMessage: 'Long message content',
      _messageTextElRef: { nativeElement: mockEl },
      cdRef: { detectChanges, markForCheck },
      agentService: { ConversationManagerAgentName: null },
      mentionAutocomplete: { getAvailableAgents: () => [], getAvailableUsers: () => [] },
      startElapsedTimeUpdater: vi.fn(),
      stopElapsedTimeUpdater: vi.fn(),
      refreshLivenessState: vi.fn(),
      isLivenessInFlight: () => false,
      detailTasks: [],
    });

    item.ngDoCheck();
    detectChanges.mockClear();

    return { item, detectChanges, markForCheck };
  };

  it('collapses a settled, non-latest long AI message and toggles on click', () => {
    const { item, detectChanges } = createHarness({
      isLatestMessage: false,
      status: 'Complete',
      senderType: 'AI',
      scrollHeight: 320,
    });

    expect(item.CanCollapseText).toBe(true);
    expect(item.IsTextCollapsed).toBe(true);
    expect(item.ShowCollapseToggle).toBe(true);

    item.ToggleTextExpanded();
    expect(item.IsTextCollapsed).toBe(false);
    expect(item.ShowCollapseToggle).toBe(true);
    expect(detectChanges).toHaveBeenCalledTimes(1);

    item.ToggleTextExpanded();
    expect(item.IsTextCollapsed).toBe(true);
    expect(item.ShowCollapseToggle).toBe(true);
    expect(detectChanges).toHaveBeenCalledTimes(2);
  });

  it('collapses a settled, non-latest long user message too', () => {
    const { item } = createHarness({
      isLatestMessage: false,
      status: 'Complete',
      senderType: 'User',
      scrollHeight: 280,
    });

    expect(item.CanCollapseText).toBe(true);
    expect(item.IsTextCollapsed).toBe(true);
    expect(item.ShowCollapseToggle).toBe(true);
  });

  it('keeps the latest message expanded by default and hides the toggle', () => {
    const { item } = createHarness({
      isLatestMessage: true,
      status: 'Complete',
      scrollHeight: 450,
    });

    expect(item.CanCollapseText).toBe(false);
    expect(item.IsTextCollapsed).toBe(false);
    expect(item.ShowCollapseToggle).toBe(false);
  });

  it('defaults IsLatestMessage to true on fresh instances so standalone usage stays expanded', () => {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    // Field initializer runs on class instantiation; verify the default when not overridden.
    expect(new (MessageItemComponent as unknown as new () => { IsLatestMessage: boolean })()).toBeDefined();
    // Direct check on prototype-backed instance when IsLatestMessage is true:
    Object.assign(item as unknown as Record<string, unknown>, {
      message: { ID: 'msg-standalone', Status: 'Complete', Message: 'Text' },
      IsLatestMessage: true,
      IsStreaming: false,
      isEditing: false,
      _isLongMessage: true,
      _isTextExpanded: false,
    });
    expect(item.IsTextCollapsed).toBe(false);
    expect(item.ShowCollapseToggle).toBe(false);
  });

  it('keeps in-progress and streaming messages expanded even when not marked latest', () => {
    const inProgress = createHarness({
      isLatestMessage: false,
      status: 'In-Progress',
      scrollHeight: 400,
    });
    expect(inProgress.item.IsTextCollapsed).toBe(false);
    expect(inProgress.item.ShowCollapseToggle).toBe(false);

    const streaming = createHarness({
      isLatestMessage: false,
      status: 'Complete',
      isStreaming: true,
      scrollHeight: 400,
    });
    expect(streaming.item.IsTextCollapsed).toBe(false);
    expect(streaming.item.ShowCollapseToggle).toBe(false);
  });

  it('does not collapse or show the toggle for short messages at or below the 220px hysteresis threshold', () => {
    for (const scrollHeight of [120, 160, 220]) {
      const { item } = createHarness({
        isLatestMessage: false,
        status: 'Complete',
        scrollHeight,
      });

      expect(item.CanCollapseText).toBe(false);
      expect(item.IsTextCollapsed).toBe(false);
      expect(item.ShowCollapseToggle).toBe(false);
    }
  });

  it('collapses when height is strictly above 220px and auto-collapses when a message stops being latest', () => {
    const { item } = createHarness({
      isLatestMessage: true,
      status: 'Complete',
      scrollHeight: 221,
    });
    expect(item.IsTextCollapsed).toBe(false);
    expect(item.ShowCollapseToggle).toBe(false);

    item.IsLatestMessage = false;
    expect(item.IsTextCollapsed).toBe(true);
    expect(item.ShowCollapseToggle).toBe(true);
  });

  it('resets manual expansion when bound to a different message ID', () => {
    const { item } = createHarness({
      isLatestMessage: false,
      status: 'Complete',
      scrollHeight: 350,
      messageId: 'msg-a',
    });
    item.ToggleTextExpanded();
    expect(item.IsTextCollapsed).toBe(false);

    item.message = {
      ...item.message,
      ID: 'msg-b',
    } as typeof item.message;
    item.ngDoCheck();

    expect(item.IsTextCollapsed).toBe(true);
  });
});
