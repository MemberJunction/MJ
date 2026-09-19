import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ActionableCommand, ComposeEmailCommand } from '@memberjunction/ai-core-plus';

/**
 * Component for displaying actionable command buttons
 * These are actions the user can trigger after an agent completes a task
 */
@Component({
  standalone: false,
  selector: 'mj-actionable-commands',
  templateUrl: './actionable-commands.component.html',
  styleUrls: ['./actionable-commands.component.css']
})
export class ActionableCommandsComponent {
  @Input() commands: ActionableCommand[] = [];
  @Input() disabled: boolean = false;
  @Input() isLastMessage: boolean = false;
  @Input() isConversationOwner: boolean = false;

  @Output() commandExecuted = new EventEmitter<ActionableCommand>();

  /**
   * Check if component should be visible
   */
  public get isVisible(): boolean {
    return (
      this.isLastMessage &&
      this.isConversationOwner &&
      this.commands &&
      this.commands.length > 0
    );
  }

  /**
   * Handle command button click
   */
  public onCommandClick(command: ActionableCommand): void {
    if (!this.disabled) {
      this.commandExecuted.emit(command);
    }
  }

  /**
   * Recipients to show BESIDE a compose:email button, or null for any other command.
   *
   * SECURITY, not decoration. The button renders only the agent-authored `label`, so without this
   * the user cannot see who a draft is addressed to until their mail client is already open and
   * populated. An agent influenced by injected content in retrieved material could pair a benign
   * label ("Open draft in Mail") with an attacker's address and the conversation's context as the
   * body; showing the address is what lets the user notice before they send from their real
   * mailbox. Empty recipients read as "no recipient" rather than rendering nothing, so an address
   * the agent never supplied cannot be mistaken for one it did.
   */
  public composeEmailRecipients(command: ActionableCommand): string | null {
    if (command.type !== 'compose:email') {
      return null;
    }
    const draft = command as ComposeEmailCommand;
    const to = (draft.to ?? []).map((r) => r.trim()).filter((r) => r.length > 0);
    const cc = (draft.cc ?? []).map((r) => r.trim()).filter((r) => r.length > 0);
    const bcc = (draft.bcc ?? []).map((r) => r.trim()).filter((r) => r.length > 0);
    if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
      return 'no recipient — you\'ll add one';
    }
    const parts: string[] = [];
    if (to.length > 0) parts.push(`To ${to.join(', ')}`);
    if (cc.length > 0) parts.push(`Cc ${cc.join(', ')}`);
    if (bcc.length > 0) parts.push(`Bcc ${bcc.join(', ')}`);
    return parts.join(' · ');
  }

  /**
   * Get button variant based on command type
   */
  public getButtonVariant(command: ActionableCommand): 'primary' | 'secondary' | 'outline' | 'flat' {
    // A drafted email leads the turn the same way an opened resource does.
    if (command.type === 'open:resource' || command.type === 'compose:email') {
      return 'primary';
    } else if (command.type === 'open:url') {
      return 'outline';
    }
    return 'secondary';
  }

  /**
   * Track by function for commands list
   */
  public trackByCommand(index: number, command: ActionableCommand): string {
    return `${command.type}_${index}`;
  }
}
