import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ActionableCommand } from '@memberjunction/ai-core-plus';

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
   * Get button variant based on command type
   */
  public GetButtonVariant(command: ActionableCommand): 'primary' | 'secondary' | 'outline' | 'flat' {
    if (command.type === 'open:resource') {
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
