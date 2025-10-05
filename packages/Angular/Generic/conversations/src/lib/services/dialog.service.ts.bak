import { Injectable } from '@angular/core';
import { DialogService as KendoDialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { Observable } from 'rxjs';

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
            text: options.cancelText || 'Cancel',
            primary: false
          },
          {
            text: options.okText || 'OK',
            primary: true,
            themeColor: options.dangerous ? 'error' : 'primary'
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
   * @returns Promise<string | null> - input value if OK clicked, null if cancelled
   */
  input(options: InputDialogOptions): Promise<string | null> {
    return new Promise((resolve) => {
      let inputValue = options.inputValue || '';
      let currentValue = inputValue;

      const content = `
        <div style="margin-bottom: 16px;">${options.message}</div>
        <div>
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            ${options.inputLabel}
            ${options.required ? '<span style="color: red;">*</span>' : ''}
          </label>
          ${options.inputType === 'textarea'
            ? `<textarea
                id="dialogInput"
                class="k-textarea"
                style="width: 100%; min-height: 80px;"
                placeholder="${options.placeholder || ''}"
                ${options.required ? 'required' : ''}
              >${inputValue}</textarea>`
            : `<input
                id="dialogInput"
                type="${options.inputType || 'text'}"
                class="k-textbox"
                style="width: 100%;"
                value="${inputValue}"
                placeholder="${options.placeholder || ''}"
                ${options.required ? 'required' : ''}
              />`
          }
        </div>
      `;

      const dialogRef = this.kendoDialogService.open({
        title: options.title,
        content: content,
        actions: [
          {
            text: options.cancelText || 'Cancel',
            primary: false
          },
          {
            text: options.okText || 'OK',
            primary: true
          }
        ],
        width: 500,
        minWidth: 300
      });

      // Get the input element after dialog opens and track its value
      setTimeout(() => {
        const inputElement = document.getElementById('dialogInput') as HTMLInputElement | HTMLTextAreaElement;
        if (inputElement) {
          inputElement.focus();
          inputElement.select();

          // Track value changes
          inputElement.addEventListener('input', (e) => {
            currentValue = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
          });

          // Handle Enter key in input (not textarea)
          if (options.inputType !== 'textarea') {
            inputElement.addEventListener('keydown', (e) => {
              const keyEvent = e as KeyboardEvent;
              if (keyEvent.key === 'Enter') {
                keyEvent.preventDefault();
                const okButton = document.querySelector('.k-dialog-actions button.k-primary') as HTMLButtonElement;
                if (okButton) {
                  okButton.click();
                }
              }
            });
          }
        }
      }, 100);

      dialogRef.result.subscribe((result) => {
        if (result instanceof Object && 'text' in result && result.text === (options.okText || 'OK')) {
          const value = currentValue.trim();
          if (options.required && !value) {
            resolve(null);
          } else {
            resolve(value);
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
}
