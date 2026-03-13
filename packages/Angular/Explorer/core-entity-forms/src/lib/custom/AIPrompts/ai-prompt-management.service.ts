import { Injectable, ViewContainerRef } from '@angular/core';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
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

  constructor(private dialogService: DialogService) {}

  /**
   * Opens the template selector dialog for linking existing templates to AI prompts
   */
  openTemplateSelectorDialog(config: TemplateSelectorConfig & { viewContainerRef?: ViewContainerRef }): Observable<TemplateSelectorResult | null> {
    const dialogRef: DialogRef = this.dialogService.open({
      title: config.title,
      content: TemplateSelectorDialogComponent,
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      preventAction: (action) => {
        // Prevent closing on backdrop click
        return action === 'close';
      }
    });

    // Configure the dialog component
    const dialogComponent = dialogRef.content.instance as TemplateSelectorDialogComponent;
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
    dialogRef.result.subscribe({
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