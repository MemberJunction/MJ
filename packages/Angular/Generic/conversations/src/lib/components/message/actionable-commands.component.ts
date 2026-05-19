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
   * Get button variant based on command type
   */
  public getButtonVariant(command: ActionableCommand): 'primary' | 'secondary' | 'outline' | 'flat' {
    if (command.type === 'open:resource') {
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
