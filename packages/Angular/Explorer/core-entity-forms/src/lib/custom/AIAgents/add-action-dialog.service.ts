import { Injectable, ViewContainerRef } from '@angular/core';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { Observable } from 'rxjs';
import { ActionEntity } from '@memberjunction/core-entities';
import { AddActionDialogComponent } from './add-action-dialog.component';

/**
 * Service for managing the Add Action dialog for AI Agents.
 * Provides a clean, modern interface for selecting and configuring actions
 * to link to AI agents.
 */
@Injectable({
  providedIn: 'root'
})
export class AddActionDialogService {

  constructor(private dialogService: DialogService) {}

  /**
   * Opens the Add Action dialog for selecting actions to link to an agent
   * 
   * @param config Configuration for the dialog
   * @returns Observable that emits the selected actions when dialog is closed
   */
  openAddActionDialog(config: {
    agentId: string;
    agentName: string;
    existingActionIds: string[];
    viewContainerRef?: ViewContainerRef;
  }): Observable<ActionEntity[]> {
    const dialogRef: DialogRef = this.dialogService.open({
      title: `Add Actions to ${config.agentName}`,
      content: AddActionDialogComponent,
      actions: [], // We'll handle actions in the component
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      preventAction: () => {
        // Let component handle all actions
        return false;
      }
    });

    // Pass configuration to the dialog component
    const componentInstance = dialogRef.content.instance as AddActionDialogComponent;
    componentInstance.agentId = config.agentId;
    componentInstance.agentName = config.agentName;
    componentInstance.existingActionIds = [...config.existingActionIds];

    // Return observable that emits selected actions
    return componentInstance.result.asObservable();
  }
}