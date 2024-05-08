import { Component, EventEmitter, Input, Output } from '@angular/core';
import { KeyValuePair } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
 

@Component({
  selector: 'mj-skip-chat-with-record-window',
  templateUrl: './skip-chat-with-record-window.component.html',
  styleUrls: ['./skip-chat-with-record-window.component.css']
})
export class SkipChatWithRecordWindowComponent  {  
  @Input() public Width: number = 850;
  @Input() public Height: number = 800;

  // Pass through properties to the chat component
  @Input() AllowSend: boolean = true;
  @Input() public Title: string = "Chat with Record"
  @Input() public LinkedEntityID: number = 0; 
  @Input() public LinkedEntityPrimaryKeys: KeyValuePair[] = [];

  @Input() public WindowOpened: boolean = true;

  /**
   * Event fired whenever the window is closed by user action
   */
  @Output() public WindowClosed = new EventEmitter<void>();

  public OpenWindow() {
    this.WindowOpened = true;
  }

  public handleCloseWindow() {
    this.WindowOpened = false;
    this.WindowClosed.emit();
  }

  public handleResizeWindow(event: any) {
    SharedService.Instance.InvokeManualResize();
  }
}
