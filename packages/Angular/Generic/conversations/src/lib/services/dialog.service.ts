import { Injectable } from '@angular/core';
import { DialogService as KendoDialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { Observable } from 'rxjs';
import { InputDialogComponent } from '../components/dialogs/input-dialog.component';

export interface DialogButton {
  text: string;
  primary?: boolean;
  action: () => void;
}

export interface InputDialogOptions {
  title: string;
  message: string;
  inputLabel: string;
  inputValue?: string;
  inputType?: 'text' | 'textarea' | 'number' | 'email';
  placeholder?: string;
  required?: boolean;
  secondInputLabel?: string;
  secondInputValue?: string;
  secondInputPlaceholder?: string;
  secondInputRequired?: boolean;
  okText?: string;
  cancelText?: string;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  okText?: string;
  cancelText?: string;
  dangerous?: boolean;
}

/**
 * Dialog service for displaying Kendo-based dialogs
 * Replaces browser alert() and confirm() with proper UI components
 */
@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(private kendoDialogService: KendoDialogService) {}

  /**
   * Show a confirmation dialog
   * @returns Promise<boolean> - true if user clicked OK, false if cancelled
   */
  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const dialogRef = this.kendoDialogService.open({
        title: options.title,
        content: options.message,
        actions: [
          {
            text: options.okText || 'OK',
            primary: true,
            themeColor: options.dangerous ? 'error' : 'primary'
          },
          {
            text: options.cancelText || 'Cancel',
            primary: false
          }
        ],
        width: 450,
        minWidth: 250
      });

      dialogRef.result.subscribe((result) => {
        if (result instanceof Object && 'text' in result) {
          resolve(result.text === (options.okText || 'OK'));
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Show an alert dialog
   */
  alert(title: string, message: string, okText: string = 'OK'): Promise<void> {
    return new Promise((resolve) => {
      const dialogRef = this.kendoDialogService.open({
        title: title,
        content: message,
        actions: [
          {
            text: okText,
            primary: true
          }
        ],
        width: 450,
        minWidth: 250
      });

      dialogRef.result.subscribe(() => {
        resolve();
      });
    });
  }

  /**
   * Show an input dialog
   * @returns Promise<string | {value: string; secondValue?: string} | null> -
   *          If single input: returns string
   *          If dual input: returns object with both values
   *          Returns null if cancelled
   */
  input(options: InputDialogOptions): Promise<string | {value: string; secondValue?: string} | null> {
    return new Promise((resolve) => {
      const dialogRef = this.kendoDialogService.open({
        title: options.title,
        content: InputDialogComponent,
        actions: [
          {
            text: options.okText || 'OK',
            primary: true
          },
          {
            text: options.cancelText || 'Cancel',
            primary: false
          }
        ],
        width: 500,
        minWidth: 300
      });

      // Pass data to the component
      const componentInstance = dialogRef.content.instance as InputDialogComponent;
      componentInstance.message = options.message;
      componentInstance.inputLabel = options.inputLabel;
      componentInstance.inputType = options.inputType || 'text';
      componentInstance.placeholder = options.placeholder || '';
      componentInstance.required = options.required || false;
      componentInstance.value = options.inputValue || '';
      componentInstance.secondInputLabel = options.secondInputLabel || '';
      componentInstance.secondInputPlaceholder = options.secondInputPlaceholder || '';
      componentInstance.secondInputRequired = options.secondInputRequired || false;
      componentInstance.secondValue = options.secondInputValue || '';

      // Focus and select input after dialog opens
      setTimeout(() => {
        const inputElement = document.querySelector('.k-dialog input, .k-dialog textarea') as HTMLInputElement | HTMLTextAreaElement;
        if (inputElement) {
          inputElement.focus();
          inputElement.select();
        }
      }, 100);

      dialogRef.result.subscribe((result) => {
        if (result instanceof Object && 'text' in result && result.text === (options.okText || 'OK')) {
          const value = componentInstance.getValue();
          if (options.required && !value) {
            resolve(null);
          } else {
            // If second input is present, return object with both values
            if (options.secondInputLabel) {
              resolve({
                value: value,
                secondValue: componentInstance.getSecondValue()
              });
            } else {
              // Single input - return string for backward compatibility
              resolve(value);
            }
          }
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Show a custom dialog with custom content and actions
   */
  custom(title: string, content: string, buttons: DialogButton[], width: number = 500): DialogRef {
    const actions = buttons.map(btn => ({
      text: btn.text,
      primary: btn.primary || false
    }));

    const dialogRef = this.kendoDialogService.open({
      title: title,
      content: content,
      actions: actions,
      width: width,
      minWidth: 300
    });

    dialogRef.result.subscribe((result) => {
      if (result instanceof Object && 'text' in result) {
        const button = buttons.find(b => b.text === result.text);
        if (button && button.action) {
          button.action();
        }
      }
    });

    return dialogRef;
  }

  /**
   * Open a dialog with a custom component
   * @param component The component class to display in the dialog
   * @param options Dialog configuration options
   * @returns DialogRef - Access component instance via dialogRef.content.instance
   */
  openComponent(
    component: Function,
    options: {
      title?: string;
      width?: number;
      height?: number;
      minWidth?: number;
      minHeight?: number;
    } = {}
  ): DialogRef {
    return this.kendoDialogService.open({
      title: options.title || '',
      content: component,
      width: options.width || 800,
      height: options.height,
      minWidth: options.minWidth || 600,
      minHeight: options.minHeight
    });
  }
}
