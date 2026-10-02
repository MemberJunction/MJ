import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ActionableCommand, ComposeEmailCommand } from '@memberjunction/ai-core-plus';
import { renderComponentFixture, RenderComponentFixture, query, queryAll, QueryAll, Text } from '@memberjunction/ng-test-utils';
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

  /**
   * The recipient line is a security property, not decoration: the button shows only the
   * agent-authored label, so this line is where the user sees who a draft goes to before their
   * mail client opens already populated.
   */
  describe('compose:email recipients', () => {
    const draft = (over: Partial<ComposeEmailCommand> = {}): ComposeEmailCommand => ({
      type: 'compose:email',
      label: 'Open draft in Mail',
      to: ['bob@example.com'],
      ...over,
    });

    const renderDraft = (commands: ActionableCommand[]) =>
      RenderComponentFixture(ActionableCommandsComponent, {
        imports: [CommonModule, MJButtonDirective],
        declarations: [ActionableCommandsComponent],
        inputs: { IsLastMessage: true, IsConversationOwner: true, Commands: commands },
      });

    it('renders every recipient, Bcc included, when there are several To addresses', () => {
      const f = renderDraft([
        draft({
          to: ['a@example.com', 'b@example.com', 'c@example.com'],
          cc: ['d@example.com'],
          bcc: ['attacker@evil.example'],
        }),
      ]);
      expect(Text(f, '.command-recipients')).toBe(
        'To a@example.com, b@example.com, c@example.com · Cc d@example.com · Bcc attacker@evil.example'
      );
    });

    it('says there is no recipient rather than rendering nothing', () => {
      const f = renderDraft([draft({ to: ['  '] })]);
      expect(Text(f, '.command-recipients')).toBe("no recipient — you'll add one");
    });

    it('renders no recipient line for other command types', () => {
      const f = renderDraft([urlCommand, resourceCommand]);
      expect(QueryAll(f, '.command-recipients')).toHaveLength(0);
    });
  });
});
