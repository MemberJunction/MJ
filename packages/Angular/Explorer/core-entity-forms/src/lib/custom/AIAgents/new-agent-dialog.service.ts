import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogService, MJDialogRef, MJDialogSettings } from '@memberjunction/ng-ui-components';
import { NewAgentDialogComponent, NewAgentConfig } from './new-agent-dialog.component';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { Observable, Subject } from 'rxjs';

export interface NewAgentDialogResult {
  agent?: MJAIAgentEntityExtended;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  action: 'created' | 'cancelled';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

@Injectable({
  providedIn: 'root'
})
export class NewAgentDialogService {
  private dialogRef: MJDialogRef | null = null;

  constructor(private dialogService: MJDialogService) {}

  /**
   * Opens the New Agent dialog
   * @param config Configuration for the dialog
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   * @returns Observable that emits the result when dialog closes
   */
  Open(config: NewAgentConfig = {}, viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    const resultSubject = new Subject<NewAgentDialogResult>();

    const dialogSettings: MJDialogSettings = {
      title: config.parentAgentId ? 'Create Sub-Agent' : 'Create New AI Agent',
      content: NewAgentDialogComponent,
      width: 600,
      height: 600,
      minWidth: 500
    };

    this.dialogRef = this.dialogService.open(dialogSettings);

    // Configure the component
    const component = this.dialogRef.Content!.instance as unknown as NewAgentDialogComponent;
    component.config = config;
    component.dialogRef = this.dialogRef;

    // Handle dialog result
    this.dialogRef.Result.subscribe((result: unknown) => {
      if (result && typeof result === 'object' && 'agent' in result) {
        resultSubject.next({ agent: (result as Record<string, unknown>)['agent'] as MJAIAgentEntityExtended, action: 'created' });
      } else {
        resultSubject.next({ action: 'cancelled' });
      }
      resultSubject.complete();
      this.dialogRef = null;
    });

    return resultSubject.asObservable();
  }

  /** @deprecated Use {@link Open}. */
  open(config: NewAgentConfig = {}, viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.Open(config, viewContainerRef);
  }

  /**
   * Opens the dialog to create a top-level agent
   */
  OpenForNewAgent(viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.Open({
      redirectToForm: true
    }, viewContainerRef);
  }

  /** @deprecated Use {@link OpenForNewAgent}. */
  openForNewAgent(viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.OpenForNewAgent(viewContainerRef);
  }

  /**
   * Opens the dialog to create a sub-agent
   */
  OpenForSubAgent(parentAgentId: string, parentAgentName: string, viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.Open({
      parentAgentId,
      parentAgentName,
      redirectToForm: false
    }, viewContainerRef);
  }

  /** @deprecated Use {@link OpenForSubAgent}. */
  openForSubAgent(parentAgentId: string, parentAgentName: string, viewContainerRef?: ViewContainerRef): Observable<NewAgentDialogResult> {
    return this.OpenForSubAgent(parentAgentId, parentAgentName, viewContainerRef);
  }

  /**
   * Closes the currently open dialog
   */
  Close(): void {
    if (this.dialogRef) {
      this.dialogRef.Close();
      this.dialogRef = null;
    }
  }

  /** @deprecated Use {@link Close}. */
  close(): void {
    return this.Close();
  }

  /**
   * Checks if a dialog is currently open
   */
  IsOpen(): boolean {
    return this.dialogRef !== null;
  }

  /** @deprecated Use {@link IsOpen}. */
  isOpen(): boolean {
    return this.IsOpen();
  }
}