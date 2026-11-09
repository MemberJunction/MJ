import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComposeEmailCommand } from '@memberjunction/ai-core-plus';
import { UICommandHandlerService, ActionableCommandRequest } from './ui-command-handler.service';
import { DataCacheService } from './data-cache.service';

/**
 * DOM spec (jsdom — the mail client is opened by a synthesized anchor click) for the
 * `compose:email` branch.
 *
 * The load-bearing assertion is the LENGTH FALLBACK: past the mailto limit the handler must NOT
 * open the mail client, because a client handed an over-long URL does not refuse it — it opens a
 * draft with the body silently truncated and the user sends half a message. It must instead emit
 * so the host can open the full draft artifact, and tell the host whether the body reached the
 * clipboard so the host's notice never claims a copy that did not happen.
 *
 * The service's only constructor dependency is DataCacheService, which has a no-arg constructor
 * and which the compose path never touches — so a real instance is passed directly rather than a
 * double, and no TestBed is needed.
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

  /** jsdom has no navigator.clipboard; install (or remove) one for a single test. */
  const setClipboard = (clipboard: Pick<Clipboard, 'writeText'> | undefined): void => {
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  };

  /** Subscribe to the host-facing emitter and collect what reaches the host. */
  const captureRequests = (): ActionableCommandRequest[] => {
    const requests: ActionableCommandRequest[] = [];
    service.ActionableCommandRequested.subscribe((request) => requests.push(request));
    return requests;
  };

  beforeEach(() => {
    service = new UICommandHandlerService(new DataCacheService());
    clicked = [];
    // Capture the synthesized anchor click without navigating jsdom.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
  });

  it('opens the mail client for a draft within the limit', async () => {
    const requests = captureRequests();

    await service.ExecuteActionableCommand(cmd());

    expect(clicked).toHaveLength(1);
    // `@` stays readable in the path (RFC 6068); only the query params are percent-encoded.
    expect(clicked[0]).toContain('mailto:bob@example.com');
    expect(clicked[0]).toContain('subject=Renewal');
    // Handled locally — the host must not also be asked to open anything.
    expect(requests).toHaveLength(0);
  });

  it('does not touch the clipboard for a draft within the limit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await service.ExecuteActionableCommand(cmd());

    expect(writeText).not.toHaveBeenCalled();
  });

  it('removes the synthesized anchor from the document again', async () => {
    await service.ExecuteActionableCommand(cmd());
    expect(document.querySelectorAll('a[href^="mailto:"]')).toHaveLength(0);
  });

  it('never uses window.open (it strands an about:blank tab on a non-http scheme)', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await service.ExecuteActionableCommand(cmd());
    expect(open).not.toHaveBeenCalled();
  });

  describe('past the length limit', () => {
    const tooLong = (over: Partial<ComposeEmailCommand> = {}) => cmd({ body: 'word '.repeat(500), ...over });

    it('does NOT open the mail client, rather than opening a truncated draft', async () => {
      await service.ExecuteActionableCommand(tooLong());
      expect(clicked).toHaveLength(0);
    });

    it('emits so the host can open the full draft artifact instead', async () => {
      const requests = captureRequests();

      await service.ExecuteActionableCommand(tooLong(), { conversationId: 'c1', conversationDetailId: 'd1' });

      expect(requests).toHaveLength(1);
      expect(requests[0].command.type).toBe('compose:email');
      expect(requests[0].conversationId).toBe('c1');
      expect(requests[0].conversationDetailId).toBe('d1');
    });

    it('copies the body and tells the host the text is on the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      const requests = captureRequests();

      await service.ExecuteActionableCommand(tooLong());

      expect(writeText).toHaveBeenCalledWith(tooLong().body);
      expect(requests[0].DraftCopiedToClipboard).toBe(true);
    });

    it('still falls back, and reports no copy, when the clipboard write is denied', async () => {
      setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
      const requests = captureRequests();

      await service.ExecuteActionableCommand(tooLong());

      expect(clicked).toHaveLength(0);
      expect(requests).toHaveLength(1);
      expect(requests[0].DraftCopiedToClipboard).toBe(false);
    });

    it('still falls back, and reports no copy, when there is no clipboard (plain HTTP)', async () => {
      const requests = captureRequests();

      await service.ExecuteActionableCommand(tooLong());

      expect(requests).toHaveLength(1);
      expect(requests[0].DraftCopiedToClipboard).toBe(false);
    });

    it('reports no copy when the draft has no body to copy', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      const requests = captureRequests();

      // Over the limit on recipients alone.
      await service.ExecuteActionableCommand(
        cmd({ body: undefined, to: Array.from({ length: 120 }, (_, i) => `person${i}@example.com`) })
      );

      expect(writeText).not.toHaveBeenCalled();
      expect(requests).toHaveLength(1);
      expect(requests[0].DraftCopiedToClipboard).toBe(false);
    });
  });

  it('leaves other command types alone', async () => {
    const requests = captureRequests();

    await service.ExecuteActionableCommand({
      type: 'open:resource',
      label: 'Open',
      resourceType: 'Record',
      resourceId: 'r1',
    });

    expect(clicked).toHaveLength(0);
    expect(requests).toHaveLength(1);
    // The clipboard flag belongs to the compose:email fallback only.
    expect(requests[0].DraftCopiedToClipboard).toBeUndefined();
  });
});
