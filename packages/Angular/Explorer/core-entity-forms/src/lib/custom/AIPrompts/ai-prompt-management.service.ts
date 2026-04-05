import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogService, MJDialogRef } from '@memberjunction/ng-ui-components';
import { Observable, Subject } from 'rxjs';
import { MJTemplateEntity } from '@memberjunction/core-entities';
import {
  TemplateSelectorDialogComponent,
  TemplateSelectorConfig,
  TemplateSelectorResult
} from './template-selector-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class AIPromptManagementService {

  constructor(private dialogService: MJDialogService) {}

  /**
   * Opens the template selector dialog for linking existing templates to AI prompts
   */
  openTemplateSelectorDialog(config: TemplateSelectorConfig & { viewContainerRef?: ViewContainerRef }): Observable<TemplateSelectorResult | null> {
    const dialogRef: MJDialogRef = this.dialogService.open({
      title: config.title,
      content: TemplateSelectorDialogComponent,
      width: 800,
      height: 600,
      minWidth: 600
    });

    // Configure the dialog component
    const dialogComponent = dialogRef.Content!.instance as unknown as TemplateSelectorDialogComponent;
    dialogComponent.config = {
      title: config.title,
      showCreateNew: config.showCreateNew ?? true,
      extraFilter: config.extraFilter,
      multiSelect: config.multiSelect ?? false,
      selectedTemplateIds: config.selectedTemplateIds,
      showActiveOnly: config.showActiveOnly ?? true
    };

    // Create a subject to handle the result
    const resultSubject = new Subject<TemplateSelectorResult | null>();

    // Subscribe to the dialog component's result
    dialogComponent.result.subscribe({
      next: (result) => {
        resultSubject.next(result);
        resultSubject.complete();
      },
      error: (error) => {
        resultSubject.error(error);
      }
    });

    // Handle dialog close
    dialogRef.Result.subscribe({
      next: () => {
        // Dialog was closed, emit null if no result was already emitted
        if (!resultSubject.closed) {
          resultSubject.next(null);
          resultSubject.complete();
        }
      },
      error: (error) => {
        if (!resultSubject.closed) {
          resultSubject.error(error);
        }
      }
    });

    return resultSubject.asObservable();
  }

  /**
   * Opens a template creation dialog and returns the created template
   */
  openCreateTemplateDialog(config: {
    promptId?: string;
    promptName?: string;
    viewContainerRef?: ViewContainerRef;
  }): Observable<MJTemplateEntity | null> {
    // For now, we'll return a placeholder - in a full implementation,
    // this would open a template creation dialog
    const resultSubject = new Subject<MJTemplateEntity | null>();
    
    // Simulate async operation
    setTimeout(() => {
      resultSubject.next(null);
      resultSubject.complete();
    }, 100);

    return resultSubject.asObservable();
  }
}