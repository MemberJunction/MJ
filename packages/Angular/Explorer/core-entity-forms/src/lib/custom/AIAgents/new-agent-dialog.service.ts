import { Injectable, ViewContainerRef } from '@angular/core';
import { DialogService, DialogRef, DialogSettings } from '@progress/kendo-angular-dialog';
import { NewAgentDialogComponent, NewAgentConfig } from './new-agent-dialog.component';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { Observable, Subject } from 'rxjs';

export interface NewAgentDialogResult {
  agent?: MJAIAgentEntityExtended;
  action: 'created' | 'cancelled';
}

@Injectable({
  providedIn: 'root'
})
export class NewAgentDialogService {
  private dialogRef: DialogRef | null = null;

  constructor(private dialogService: DialogService) {}

  /**
   * Opens the New Agent dialog
   * @param config Configuration for the dialog
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   * @returns Observable that emits the result when dialog closes
   */
  open(config: NewAgentConfig = {}, viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    const resultSubject = new Subject<NewAgentDialogResult>();
    
    const dialogSettings: DialogSettings = {
      title: config.parentAgentId ? 'Create Sub-Agent' : 'Create New AI Agent',
      content: NewAgentDialogComponent,
      width: 600,
      height: 600,
      minWidth: 500,
      minHeight: 500,
      preventAction: () => false
    };

    this.dialogRef = this.dialogService.open(dialogSettings);
    
    // Configure the component
    const component = this.dialogRef.content.instance as NewAgentDialogComponent;
    component.config = config;
    
    // Handle dialog result
    this.dialogRef.result.subscribe((result: any) => {
      if (result && result.agent) {
        resultSubject.next({ agent: result.agent, action: 'created' });
      } else {
        resultSubject.next({ action: 'cancelled' });
      }
      resultSubject.complete();
      this.dialogRef = null;
    });
    
    return resultSubject.asObservable();
  }

  /**
   * Opens the dialog to create a top-level agent
   */
  openForNewAgent(viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.open({
      redirectToForm: true
    }, viewContainerRef);
  }

  /**
   * Opens the dialog to create a sub-agent
   */
  openForSubAgent(parentAgentId: string, parentAgentName: string, viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.open({
      parentAgentId,
      parentAgentName,
      redirectToForm: false
    }, viewContainerRef);
  }

  /**
   * Closes the currently open dialog
   */
  close(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      this.dialogRef = null;
    }
  }

  /**
   * Checks if a dialog is currently open
   */
  isOpen(): boolean {
    return this.dialogRef !== null;
  }
}