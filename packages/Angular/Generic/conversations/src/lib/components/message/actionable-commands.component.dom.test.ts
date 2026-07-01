import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ActionableCommand } from '@memberjunction/ai-core-plus';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ActionableCommandsComponent } from './actionable-commands.component';

/**
 * DOM spec for <mj-actionable-commands>. The whole block is gated behind the
 * isVisible getter (isLastMessage && isConversationOwner && commands.length > 0),
 * so the visibility tests double as coverage of that getter. Also covers the
 * per-command button rendering, the disabled binding, and the click → output.
 */
describe('ActionableCommandsComponent (DOM)', () => {
  const urlCommand: ActionableCommand = { type: 'open:url', label: 'Visit', icon: 'fa-link', url: 'https://x.test' };
  const resourceCommand: ActionableCommand = {
    type: 'open:resource',
    label: 'Open Record',
    resourceType: 'Record',
    entityName: 'Customers',
    resourceId: '123',
  };

  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(ActionableCommandsComponent, {
      imports: [CommonModule, MJButtonDirective],
      declarations: [ActionableCommandsComponent],
      inputs: { isLastMessage: true, isConversationOwner: true, commands: [urlCommand], ...inputs },
    });

  it('renders nothing when it is not the last message', () => {
    const f = render({ isLastMessage: false });
    expect(query(f, '.actionable-commands')).toBeNull();
  });

  it('renders nothing when the viewer is not the conversation owner', () => {
    const f = render({ isConversationOwner: false });
    expect(query(f, '.actionable-commands')).toBeNull();
  });

  it('renders nothing when there are no commands', () => {
    const f = render({ commands: [] });
    expect(query(f, '.actionable-commands')).toBeNull();
  });

  it('renders one button per command with its label', () => {
    const f = render({ commands: [urlCommand, resourceCommand] });
    const buttons = queryAll(f, 'button.command-button');
    expect(buttons.length).toBe(2);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Visit', 'Open Record']);
  });

  it('renders the command icon when present', () => {
    const f = render({ commands: [urlCommand] });
    expect(query(f, 'button.command-button i.fa')?.classList.contains('fa-link')).toBe(true);
  });

  it('emits commandExecuted with the clicked command', () => {
    const f = render({ commands: [urlCommand] });
    const spy = vi.fn();
    f.componentInstance.commandExecuted.subscribe(spy);
    (query(f, 'button.command-button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(urlCommand);
  });

  it('does not emit when disabled and a button is clicked', () => {
    const f = render({ commands: [urlCommand], disabled: true });
    const spy = vi.fn();
    f.componentInstance.commandExecuted.subscribe(spy);
    (query(f, 'button.command-button') as HTMLButtonElement).click();
    expect(spy).not.toHaveBeenCalled();
  });
});
