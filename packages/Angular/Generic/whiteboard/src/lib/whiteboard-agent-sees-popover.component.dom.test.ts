import { describe, it, expect } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardAgentSeesPopoverComponent } from './whiteboard-agent-sees-popover.component';

/**
 * DOM spec for <mj-realtime-whiteboard-agent-sees-popover> — the "what the agent sees"
 * perception popover. Covers the AgentName binding (appears in head + caption), the
 * footer stat bindings (debounce / element count / last delta), and the @if/@else
 * branch on TintedHtml: the empty placeholder when there is no delta, and the tinted
 * <pre> when a delta is present (with the setter producing escaped, span-wrapped HTML).
 */
describe('RealtimeWhiteboardAgentSeesPopoverComponent (DOM)', () => {
  it('renders the AgentName in the head and the caption', () => {
    const f = renderComponentFixture(RealtimeWhiteboardAgentSeesPopoverComponent, { inputs: { AgentName: 'Sage' } });
    expect(f.nativeElement.querySelector('.sees-pop__head')?.textContent).toContain("Sage's context");
    expect(f.nativeElement.querySelector('.sees-pop__cap')?.textContent).toContain('Sage');
  });

  it('renders the footer stats from DebounceMs / ElementCount / LastDeltaLabel', () => {
    const f = renderComponentFixture(RealtimeWhiteboardAgentSeesPopoverComponent, {
      inputs: { DebounceMs: 500, ElementCount: 7, LastDeltaLabel: '2 s ago' },
    });
    const foot = f.nativeElement.querySelector('.sees-pop__foot')?.textContent ?? '';
    expect(foot).toContain('500 ms');
    expect(foot).toContain('7');
    expect(foot).toContain('2 s ago');
  });

  it('shows the "no deltas yet" placeholder when DeltaJson is empty', () => {
    const f = renderComponentFixture(RealtimeWhiteboardAgentSeesPopoverComponent);
    const code = f.nativeElement.querySelector('.codeblock')?.textContent ?? '';
    expect(code).toContain('no deltas yet');
    // the tinted-delta branch (which carries the replace-current-state comment) is absent
    expect(code).not.toContain('replace-current-state');
  });

  it('renders the tinted delta block when DeltaJson is set', () => {
    const f = renderComponentFixture(RealtimeWhiteboardAgentSeesPopoverComponent, {
      inputs: { DeltaJson: '{"added": 3}' },
    });
    const pre = f.nativeElement.querySelector('.codeblock');
    expect(pre).not.toBeNull();
    // the @if-true branch carries the replace-current-state semantics comment
    expect(pre!.textContent).toContain('replace-current-state');
    // the setter tints JSON keys (.ck) and numbers (.cn) into spans via [innerHTML]
    expect(pre!.querySelector('.ck')).not.toBeNull();
    expect(pre!.querySelector('.cn')).not.toBeNull();
  });

  it('escapes HTML in the delta JSON (no live markup is injected)', () => {
    const f = renderComponentFixture(RealtimeWhiteboardAgentSeesPopoverComponent, {
      inputs: { DeltaJson: '{"x": "<script>bad</script>"}' },
    });
    // the injected value is escaped, so no real <script> element exists in the popover
    expect(f.nativeElement.querySelector('script')).toBeNull();
    expect(f.nativeElement.querySelector('.codeblock')?.textContent).toContain('<script>');
  });
});
