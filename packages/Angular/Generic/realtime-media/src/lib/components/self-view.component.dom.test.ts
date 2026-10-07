import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { SelfViewComponent } from './self-view.component';

/** An element source that attaches nothing: no real media is involved. */
function elementSource(): MediaVideoSource {
  return { Kind: 'element', Attach: () => () => undefined };
}

function me(over: Partial<MediaParticipant> = {}): MediaParticipant {
  return { Identity: 'me', DisplayName: 'Grace Hopper', Role: 'self', IsSpeaking: false, Video: { camera: elementSource() }, ...over };
}

/** A host that puts its own action in the self-view's corner. */
@Component({
  standalone: true,
  imports: [SelfViewComponent],
  template: `<mj-self-view [Participant]="Participant"><button class="own-action" mjMediaTileActions>Move</button></mj-self-view>`,
})
class ActionsHostComponent {
  @Input() public Participant: MediaParticipant | null = null;
}

/** DOM spec for <mj-self-view>: the user's tile, mirrored, with the agent badge and Hide. */
describe('SelfViewComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(SelfViewComponent, { inputs: { Participant: me(), ...inputs } });
  const mirrored = (f: ReturnType<typeof render>) => query(f, '.tile__video')?.classList.contains('tile__video--mirrored');

  it("shows the user's camera mirrored, with their name", () => {
    const f = render();
    expect(mirrored(f)).toBe(true);
    expect(query(f, '.tile__name')?.textContent).toContain('Grace Hopper');
  });

  it('does not mirror a shared screen', () => {
    const f = render({ Participant: me({ Video: { camera: elementSource(), screen: elementSource() }, PreferredVideo: 'screen' }) });
    expect(mirrored(f)).toBe(false);
  });

  it('says "Agent can see this" only when the host says so', () => {
    const f = render();
    expect(query(f, '.self__badge')).toBeNull();
    f.componentRef.setInput('AgentCanSee', true);
    f.detectChanges();
    expect(query(f, '.self__badge')?.textContent?.trim()).toBe('Agent can see this');
  });

  it('asks the host to hide it from a named Hide button', () => {
    const f = render();
    const hide = vi.fn();
    f.componentInstance.HideRequested.subscribe(hide);
    const button = query(f, 'button.self__hide') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Hide self-view');
    button.click();
    expect(hide).toHaveBeenCalledOnce();
  });

  it("puts a host's actions in the tile's corner, before Hide", () => {
    const f = renderComponentFixture(ActionsHostComponent, { inputs: { Participant: me() } });
    const corner = Array.from(query(f, 'mj-media-tile .tile__actions-slot')?.querySelectorAll('button') ?? []);
    expect(corner.map((button) => button.className.split(' ')[0])).toEqual(['own-action', 'self__hide']);
  });

  it('leaves out Hide when the host does not offer it', () => {
    expect(query(render({ ShowHide: false }), 'button.self__hide')).toBeNull();
  });

  it('passes its display options to the tile', () => {
    expect(query(render({ ShowName: false }), '.tile__name')).toBeNull();
  });

  it('has no axe violations', async () => {
    await ExpectNoAxeViolations(render({ AgentCanSee: true }));
  });
});
