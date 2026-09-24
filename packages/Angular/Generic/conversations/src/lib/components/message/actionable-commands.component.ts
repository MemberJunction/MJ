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
  @Input() Commands: ActionableCommand[] = [];

  /** @deprecated Use {@link Commands}. */
  @Input() set commands(value: ActionableCommand[]) {
    this.Commands = value;
  }
  /** @deprecated Use {@link Commands}. */
  get commands(): ActionableCommand[] {
    return this.Commands;
  }
  @Input() Disabled: boolean = false;

  /** @deprecated Use {@link Disabled}. */
  @Input() set disabled(value: boolean) {
    this.Disabled = value;
  }
  /** @deprecated Use {@link Disabled}. */
  get disabled(): boolean {
    return this.Disabled;
  }
  @Input() IsLastMessage: boolean = false;

  /** @deprecated Use {@link IsLastMessage}. */
  @Input() set isLastMessage(value: boolean) {
    this.IsLastMessage = value;
  }
  /** @deprecated Use {@link IsLastMessage}. */
  get isLastMessage(): boolean {
    return this.IsLastMessage;
  }
  @Input() IsConversationOwner: boolean = false;

  /** @deprecated Use {@link IsConversationOwner}. */
  @Input() set isConversationOwner(value: boolean) {
    this.IsConversationOwner = value;
  }
  /** @deprecated Use {@link IsConversationOwner}. */
  get isConversationOwner(): boolean {
    return this.IsConversationOwner;
  }

  @Output() CommandExecuted = new EventEmitter<ActionableCommand>();

  /**
   * @deprecated Use {@link CommandExecuted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (commandExecuted) keeps working. Must stay AFTER CommandExecuted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() commandExecuted = this.CommandExecuted;

  /**
   * Check if component should be visible
   */
  public get IsVisible(): boolean {
    return (
      this.IsLastMessage &&
      this.IsConversationOwner &&
      this.Commands &&
      this.Commands.length > 0
    );
  }

  /** @deprecated Use {@link IsVisible}. */
  public get isVisible(): boolean {
    return this.IsVisible;
  }

  /**
   * Handle command button click
   */
  public OnCommandClick(command: ActionableCommand): void {
    if (!this.Disabled) {
      this.CommandExecuted.emit(command);
    }
  }

  /** @deprecated Use {@link OnCommandClick}. */
  public onCommandClick(command: ActionableCommand): void {
    return this.OnCommandClick(command);
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
  public GetButtonVariant(command: ActionableCommand): 'primary' | 'secondary' | 'outline' | 'flat' {
    // A drafted email leads the turn the same way an opened resource does.
    if (command.type === 'open:resource' || command.type === 'compose:email') {
      return 'primary';
    } else if (command.type === 'open:url') {
      return 'outline';
    }
    return 'secondary';
  }

  /** @deprecated Use {@link GetButtonVariant}. */
  public getButtonVariant(command: ActionableCommand): 'primary' | 'secondary' | 'outline' | 'flat' {
    return this.GetButtonVariant(command);
  }

  /**
   * Track by function for commands list
   */
  public TrackByCommand(index: number, command: ActionableCommand): string {
    return `${command.type}_${index}`;
  }

  /** @deprecated Use {@link TrackByCommand}. */
  public trackByCommand(index: number, command: ActionableCommand): string {
    return this.TrackByCommand(index, command);
  }
}
