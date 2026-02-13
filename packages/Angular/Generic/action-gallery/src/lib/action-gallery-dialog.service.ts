import { Injectable, ViewContainerRef } from '@angular/core';
import { DialogService, DialogRef, DialogSettings } from '@progress/kendo-angular-dialog';
import { ActionGalleryComponent, ActionGalleryConfig } from './action-gallery.component';
import { MJActionEntity } from '@memberjunction/core-entities';
import { Observable, Subject } from 'rxjs';

export interface ActionGalleryDialogConfig extends ActionGalleryConfig {
  title?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  submitButtonText?: string;
  cancelButtonText?: string;
  preSelectedActions?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ActionGalleryDialogService {
  private dialogRef: DialogRef | null = null;

  constructor(private dialogService: DialogService) {}

  /**
   * Opens the Action Gallery in a dialog for single selection
   * @param config Configuration for the gallery
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   * @returns Observable that emits the selected action when confirmed
   */
  openForSingleSelection(
    config: ActionGalleryDialogConfig = {}, 
    viewContainerRef?: ViewContainerRef
  ): Observable<MJActionEntity | null> {
    const resultSubject = new Subject<MJActionEntity | null>();
    
    // Configure for single selection
    const galleryConfig: ActionGalleryDialogConfig = {
      ...config,
      selectionMode: true,
      multiSelect: false
    };
    
    this.openDialog(galleryConfig, viewContainerRef, (component) => {
      // Handle dialog result
      this.dialogRef!.result.subscribe((result) => {
        if (result && (result as any).action === 'submit') {
          const selectedActions = component.getSelectedActions();
          resultSubject.next(selectedActions[0] || null);
        } else {
          resultSubject.next(null);
        }
        resultSubject.complete();
        this.dialogRef = null;
      });
    });
    
    return resultSubject.asObservable();
  }

  /**
   * Opens the Action Gallery in a dialog for multiple selection
   * @param config Configuration for the gallery
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   * @returns Observable that emits the selected actions when confirmed
   */
  openForMultiSelection(
    config: ActionGalleryDialogConfig = {}, 
    viewContainerRef?: ViewContainerRef
  ): Observable<MJActionEntity[]> {
    const resultSubject = new Subject<MJActionEntity[]>();
    
    // Configure for multi selection
    const galleryConfig: ActionGalleryDialogConfig = {
      ...config,
      selectionMode: true,
      multiSelect: true
    };
    
    this.openDialog(galleryConfig, viewContainerRef, (component) => {
      // Handle dialog result
      this.dialogRef!.result.subscribe((result) => {
        if (result && (result as any).action === 'submit') {
          const selectedActions = component.getSelectedActions();
          resultSubject.next(selectedActions);
        } else {
          resultSubject.next([]);
        }
        resultSubject.complete();
        this.dialogRef = null;
      });
    });
    
    return resultSubject.asObservable();
  }

  /**
   * Opens the Action Gallery in a dialog for browsing only (no selection)
   * @param config Configuration for the gallery
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   */
  openForBrowsing(
    config: ActionGalleryDialogConfig = {}, 
    viewContainerRef?: ViewContainerRef
  ): void {
    const galleryConfig: ActionGalleryDialogConfig = {
      ...config,
      selectionMode: false,
      enableQuickTest: true
    };
    
    const dialogSettings: DialogSettings = {
      title: config.title || 'Action Gallery',
      width: config.width || 1200,
      height: config.height || 800,
      minWidth: config.minWidth || 800,
      minHeight: config.minHeight || 600,
      content: ActionGalleryComponent,
      actions: [
        { text: 'Close', themeColor: 'base' }
      ],
      preventAction: () => false
    };

    this.dialogRef = this.dialogService.open(dialogSettings);
    
    // Configure the component
    const component = this.dialogRef.content.instance as ActionGalleryComponent;
    component.config = galleryConfig;
    
    // Handle dialog close
    this.dialogRef.result.subscribe(() => {
      this.dialogRef = null;
    });
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

  private openDialog(
    config: ActionGalleryDialogConfig,
    viewContainerRef: ViewContainerRef | undefined,
    resultHandler: (component: ActionGalleryComponent) => void
  ): void {
    const dialogSettings: DialogSettings = {
      title: config.title || 'Select Actions',
      width: config.width || 1200,
      height: config.height || 800,
      minWidth: config.minWidth || 800,
      minHeight: config.minHeight || 600,
      content: ActionGalleryComponent,
      actions: [
        { text: config.cancelButtonText || 'Cancel' },
        { text: config.submitButtonText || 'Select', themeColor: 'primary', action: 'submit' }
      ],
      preventAction: () => false
    };

    this.dialogRef = this.dialogService.open(dialogSettings);
    
    // Configure the component
    const component = this.dialogRef.content.instance as ActionGalleryComponent;
    component.config = config;
    component.preSelectedActions = config.preSelectedActions || [];
    
    // Handle result
    resultHandler(component);
  }
}