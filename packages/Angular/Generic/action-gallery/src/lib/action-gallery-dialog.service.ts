import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogService, MJDialogRef, MJDialogAction, MJDialogSettings } from '@memberjunction/ng-ui-components';
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
  private dialogRef: MJDialogRef | null = null;

  constructor(private dialogService: MJDialogService) {}

  /**
   * Opens the Action Gallery in a dialog for single selection
   * @param config Configuration for the gallery
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   * @returns Observable that emits the selected action when confirmed
   */
  OpenForSingleSelection(
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
      this.dialogRef!.Result.subscribe((result) => {
        const action = result as MJDialogAction | undefined;
        if (action && action.text === (config.submitButtonText || 'Select')) {
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

  /** @deprecated Use {@link OpenForSingleSelection}. */
  openForSingleSelection(
    config: ActionGalleryDialogConfig = {},
    viewContainerRef?: ViewContainerRef
  ): Observable<MJActionEntity | null> {
    return this.OpenForSingleSelection(config, viewContainerRef);
  }

  /**
   * Opens the Action Gallery in a dialog for multiple selection
   * @param config Configuration for the gallery
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   * @returns Observable that emits the selected actions when confirmed
   */
  OpenForMultiSelection(
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
      this.dialogRef!.Result.subscribe((result) => {
        const action = result as MJDialogAction | undefined;
        if (action && action.text === (config.submitButtonText || 'Select')) {
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

  /** @deprecated Use {@link OpenForMultiSelection}. */
  openForMultiSelection(
    config: ActionGalleryDialogConfig = {},
    viewContainerRef?: ViewContainerRef
  ): Observable<MJActionEntity[]> {
    return this.OpenForMultiSelection(config, viewContainerRef);
  }

  /**
   * Opens the Action Gallery in a dialog for browsing only (no selection)
   * @param config Configuration for the gallery
   * @param viewContainerRef Optional ViewContainerRef for proper positioning
   */
  OpenForBrowsing(
    config: ActionGalleryDialogConfig = {},
    viewContainerRef?: ViewContainerRef
  ): void {
    const galleryConfig: ActionGalleryDialogConfig = {
      ...config,
      selectionMode: false,
      enableQuickTest: true
    };

    const dialogSettings: MJDialogSettings = {
      title: config.title || 'Action Gallery',
      width: config.width || 1200,
      height: config.height || 800,
      minWidth: config.minWidth || 800,
      content: ActionGalleryComponent,
      actions: [
        { text: 'Close' }
      ]
    };

    this.dialogRef = this.dialogService.open(dialogSettings);

    // Configure the component
    const component = this.dialogRef.Content!.instance as unknown as ActionGalleryComponent;
    component.config = galleryConfig;

    // Handle dialog close
    this.dialogRef.Result.subscribe(() => {
      this.dialogRef = null;
    });
  }

  /** @deprecated Use {@link OpenForBrowsing}. */
  openForBrowsing(
    config: ActionGalleryDialogConfig = {},
    viewContainerRef?: ViewContainerRef
  ): void {
    return this.OpenForBrowsing(config, viewContainerRef);
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

  private openDialog(
    config: ActionGalleryDialogConfig,
    viewContainerRef: ViewContainerRef | undefined,
    resultHandler: (component: ActionGalleryComponent) => void
  ): void {
    const dialogSettings: MJDialogSettings = {
      title: config.title || 'Select Actions',
      width: config.width || 1200,
      height: config.height || 800,
      minWidth: config.minWidth || 800,
      content: ActionGalleryComponent,
      actions: [
        { text: config.cancelButtonText || 'Cancel' },
        { text: config.submitButtonText || 'Select', primary: true }
      ]
    };

    this.dialogRef = this.dialogService.open(dialogSettings);

    // Configure the component
    const component = this.dialogRef.Content!.instance as unknown as ActionGalleryComponent;
    component.config = config;
    component.preSelectedActions = config.preSelectedActions || [];

    // Handle result
    resultHandler(component);
  }
}