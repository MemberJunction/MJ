import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComposeEmailCommand } from '@memberjunction/ai-core-plus';
import { UICommandHandlerService } from './ui-command-handler.service';

/**
 * DOM spec (jsdom — the mail client is opened by a synthesized anchor click) for the
 * `compose:email` branch.
 *
 * The load-bearing assertion is the LENGTH FALLBACK: past the mailto limit the handler must NOT
 * open the mail client, because a client handed an over-long URL does not refuse it — it opens a
 * draft with the body silently truncated and the user sends half a message. It must instead emit
 * so the host can open the full draft artifact.
 *
 * The service's only constructor dependency is DataCacheService, which the compose path never
 * touches, so it is passed as a stub rather than through TestBed.
 */
describe('UICommandHandlerService — compose:email', () => {
  let service: UICommandHandlerService;
  let clicked: string[];

  const cmd = (over: Partial<ComposeEmailCommand> = {}): ComposeEmailCommand => ({
    type: 'compose:email',
    label: 'Open draft in Mail',
    to: ['bob@example.com'],
    subject: 'Renewal',
    body: 'Hi Bob,\n\nYour membership renews soon.',
    ...over,
  });

  beforeEach(() => {
    const dataCache = { refreshEntity: vi.fn(), refreshCache: vi.fn() };
    service = new UICommandHandlerService(dataCache as never);
    clicked = [];
    // Capture the synthesized anchor click without navigating jsdom.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens the mail client for a draft within the limit', async () => {
    const emitted = vi.fn();
    service.actionableCommandRequested.subscribe(emitted);

    await service.executeActionableCommand(cmd());

    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toContain('mailto:bob%40example.com');
    expect(clicked[0]).toContain('subject=Renewal');
    // Handled locally — the host must not also be asked to open anything.
    expect(emitted).not.toHaveBeenCalled();
  });

  it('removes the synthesized anchor from the document again', async () => {
    await service.executeActionableCommand(cmd());
    expect(document.querySelectorAll('a[href^="mailto:"]')).toHaveLength(0);
  });

  it('never uses window.open (it strands an about:blank tab on a non-http scheme)', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await service.executeActionableCommand(cmd());
    expect(open).not.toHaveBeenCalled();
  });

  describe('past the length limit', () => {
    const tooLong = () => cmd({ body: 'word '.repeat(500) });

    it('does NOT open the mail client, rather than opening a truncated draft', async () => {
      await service.executeActionableCommand(tooLong());
      expect(clicked).toHaveLength(0);
    });

    it('emits so the host can open the full draft artifact instead', async () => {
      const emitted = vi.fn();
      service.actionableCommandRequested.subscribe(emitted);

      await service.executeActionableCommand(tooLong(), { conversationId: 'c1', conversationDetailId: 'd1' });

      expect(emitted).toHaveBeenCalledTimes(1);
      const arg = emitted.mock.calls[0][0];
      expect(arg.command.type).toBe('compose:email');
      expect(arg.conversationId).toBe('c1');
      expect(arg.conversationDetailId).toBe('d1');
    });

    it('copies the body so the text is not lost', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      await service.executeActionableCommand(tooLong());

      expect(writeText).toHaveBeenCalledWith(tooLong().body);
    });

    it('still falls back when the clipboard is unavailable (plain HTTP, or denied by policy)', async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
      const emitted = vi.fn();
      service.actionableCommandRequested.subscribe(emitted);

      await service.executeActionableCommand(tooLong());

      expect(clicked).toHaveLength(0);
      expect(emitted).toHaveBeenCalledTimes(1);
    });
  });

  it('leaves other command types alone', async () => {
    const emitted = vi.fn();
    service.actionableCommandRequested.subscribe(emitted);

    await service.executeActionableCommand({
      type: 'open:resource',
      label: 'Open',
      resourceType: 'Record',
      resourceId: 'r1',
    });

    expect(clicked).toHaveLength(0);
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
