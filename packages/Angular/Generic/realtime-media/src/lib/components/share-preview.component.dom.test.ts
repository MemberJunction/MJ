import { describe, it, expect, vi } from 'vitest';
import { Component } from '@angular/core';
import { renderComponentFixture, query, queryAll, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { SharePreviewComponent } from './share-preview.component';

/** An element source that records what it was attached to and how often it was detached. */
function elementSource(): MediaVideoSource & { Attached: HTMLVideoElement[]; Detaches: number } {
  const source = {
    Kind: 'element' as const,
    Attached: [] as HTMLVideoElement[],
    Detaches: 0,
    Attach: (element: HTMLVideoElement) => {
      source.Attached.push(element);
      return () => {
        source.Detaches++;
      };
    },
  };
  return source;
}

/** A host that puts its own action in the preview's corner. */
@Component({
  standalone: true,
  imports: [SharePreviewComponent],
  template: `<mj-share-preview><button class="own-action" mjMediaTileActions>Move</button></mj-share-preview>`,
})
class ActionsHostComponent {}

/** DOM spec for <mj-share-preview>: the share shown whole, labelled by its kind, with Stop sharing and Change. */
describe('SharePreviewComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(SharePreviewComponent, { inputs: { ...inputs } });
  const label = (f: ReturnType<typeof render>) => query(f, '.share__label')?.textContent?.trim();

  it('labels each kind of surface', () => {
    const f = render({ Surface: 'screen' });
    expect(label(f)).toBe('Sharing your entire screen');
    for (const [surface, text] of [
      ['window', 'Sharing a window'],
      ['tab', 'Sharing a browser tab'],
      ['unknown', 'Sharing your screen'],
    ]) {
      f.componentRef.setInput('Surface', surface);
      f.detectChanges();
      expect(label(f)).toBe(text);
    }
  });

  it('names a shared panel instead of the browser tab it comes from', () => {
    const f = render({ Surface: 'tab', PanelLabel: 'Whiteboard' });
    expect(label(f)).toBe('Sharing a panel: Whiteboard');
    f.componentRef.setInput('PanelLabel', null);
    f.detectChanges();
    expect(label(f)).toBe('Sharing a browser tab');
  });

  it('shows the share on its video, and swaps it when the source changes', () => {
    const first = elementSource();
    const f = render({ Source: first });
    const video = query(f, '.share__video') as HTMLVideoElement;
    expect(first.Attached).toEqual([video]);
    expect(video.classList.contains('share__video--hidden')).toBe(false);

    const second = elementSource();
    f.componentRef.setInput('Source', second);
    f.detectChanges();
    expect(first.Detaches).toBe(1);
    expect(second.Attached).toEqual([video]);
  });

  it('hides the video without a source', () => {
    expect(query(render(), '.share__video')?.classList.contains('share__video--hidden')).toBe(true);
  });

  it('asks to stop sharing or to share something else', () => {
    const f = render({ Source: elementSource() });
    const stop = vi.fn();
    const change = vi.fn();
    f.componentInstance.StopRequested.subscribe(stop);
    f.componentInstance.ChangeRequested.subscribe(change);
    const [stopButton, changeButton] = queryAll(f, '.share__actions button') as HTMLButtonElement[];
    expect([stopButton.textContent?.trim(), changeButton.textContent?.trim()]).toEqual(['Stop sharing', 'Change']);
    stopButton.click();
    changeButton.click();
    expect(stop).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
  });

  it("puts a host's actions in the top corner", () => {
    const f = renderComponentFixture(ActionsHostComponent);
    expect(query(f, '.share__corner .own-action')).not.toBeNull();
  });

  it('leaves out Change when the host does not offer it', () => {
    const f = render({ ShowChange: false });
    expect(queryAll(f, '.share__actions button').map((b) => b.textContent?.trim())).toEqual(['Stop sharing']);
  });

  it('releases the video when it goes away', () => {
    const source = elementSource();
    const f = render({ Source: source });
    f.destroy();
    expect(source.Detaches).toBe(1);
  });

  it('has no axe violations', async () => {
    await ExpectNoAxeViolations(render({ Source: elementSource(), Surface: 'window' }));
  });
});
