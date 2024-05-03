import { Component, Input } from '@angular/core';
import { PrimaryKeyValue } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
 

@Component({
  selector: 'mj-skip-window',
  templateUrl: './skip-window.component.html',
  styleUrls: ['./skip-window.component.css']
})
export class SkipWindowComponent  {  
  @Input() public Width: number = 750;
  @Input() public Height: number = 1000;

  // Pass through properties to the chat component
  @Input() AllowSend: boolean = true;
  @Input() public ConversationEditMode: boolean = false;
  @Input() public ShowConversationList: boolean = false;
  @Input() public AllowNewConversations: boolean = false;
  @Input() public Title: string = "Ask Skip"
  @Input() public DataContextID: number = 0;
  @Input() public LinkedEntity: string = '';
  @Input() public LinkedEntityPrimaryKeys: PrimaryKeyValue[] = [];
  @Input() public ShowDataContextButton: boolean = true;

  public WindowOpened: boolean = true;

  public OpenWindow() {
    this.WindowOpened = true;
  }

  public CloseWindow() {
    this.WindowOpened = false;
  }

  public ResizeWindow(event: any) {
    SharedService.Instance.InvokeManualResize();
  }
}
