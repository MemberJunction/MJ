import { Injectable } from '@angular/core';
import { MJDialogService, MJDialogRef, MJDialogAction } from '@memberjunction/ng-ui-components';
import { Observable } from 'rxjs';
import { InputDialogComponent } from '../components/dialogs/input-dialog.component';
import { RatingDialogComponent } from '../components/dialogs/rating-dialog.component';

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

export interface RatingDialogOptions {
  title?: string;
  message?: string;
  initialRating?: number | null;
  initialComments?: string;
  okText?: string;
  cancelText?: string;
  /** When true, the rating dialog shows a consent checkbox the user must
   *  accept before submitting (first-time-only authorization). */
  requireConsent?: boolean;
}

export interface RatingDialogResult {
  rating: number;
  comments: string;
  /** True only when the user *just* acknowledged consent in this dialog —
   *  i.e. `requireConsent` was true and they checked the box. The caller
   *  should persist the acknowledgement so consent isn't requested again. */
  consentNewlyAcknowledged: boolean;
}

/**
 * Dialog service for displaying MJ dialogs.
 * Replaces browser alert() and confirm() with proper UI components.
 */
@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(private mjDialogService: MJDialogService) {}

  /**
   * Show a confirmation dialog
   * @returns Promise<boolean> - true if user clicked OK, false if cancelled
   */
  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const dialogRef = this.mjDialogService.open({
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

      dialogRef.Result.subscribe((result) => {
        const action = result as MJDialogAction | undefined;
        if (action && 'text' in action) {
          resolve(action.text === (options.okText || 'OK'));
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
      const dialogRef = this.mjDialogService.open({
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

      dialogRef.Result.subscribe(() => {
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
      const dialogRef = this.mjDialogService.open({
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
      const componentInstance = dialogRef.Content!.instance as unknown as InputDialogComponent;
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
        const inputElement = document.querySelector('.mj-dialog-body input, .mj-dialog-body textarea') as HTMLInputElement | HTMLTextAreaElement;
        if (inputElement) {
          inputElement.focus();
          inputElement.select();
        }
      }, 100);

      dialogRef.Result.subscribe((result) => {
        const action = result as MJDialogAction | undefined;
        if (action && 'text' in action && action.text === (options.okText || 'OK')) {
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
   * Show a rating dialog (1-10 + free-form comments).
   * @returns Promise<RatingDialogResult | null> — null if cancelled or no rating selected.
   */
  rating(options: RatingDialogOptions = {}): Promise<RatingDialogResult | null> {
    return new Promise((resolve) => {
      const okText = options.okText || 'Submit';
      const cancelText = options.cancelText || 'Cancel';

      const dialogRef = this.mjDialogService.open({
        title: options.title || 'Rate this response',
        content: RatingDialogComponent,
        actions: [
          { text: okText, primary: true },
          { text: cancelText, primary: false }
        ],
        width: 560,
        minWidth: 320
      });

      const componentInstance = dialogRef.Content!.instance as unknown as RatingDialogComponent;
      componentInstance.message = options.message ?? '';
      componentInstance.initialRating = options.initialRating ?? null;
      componentInstance.initialComments = options.initialComments ?? '';
      componentInstance.requireConsent = options.requireConsent ?? false;

      dialogRef.Result.subscribe((result) => {
        const action = result as MJDialogAction | undefined;
        if (action && 'text' in action && action.text === okText) {
          const rating = componentInstance.getRating();
          if (rating == null || !componentInstance.isConsentValid()) {
            resolve(null);
          } else {
            resolve({
              rating,
              comments: componentInstance.getComments(),
              consentNewlyAcknowledged: componentInstance.wasConsentNewlyAcknowledged()
            });
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
  custom(title: string, content: string, buttons: DialogButton[], width: number = 500): MJDialogRef {
    const actions = buttons.map(btn => ({
      text: btn.text,
      primary: btn.primary || false
    }));

    const dialogRef = this.mjDialogService.open({
      title: title,
      content: content,
      actions: actions,
      width: width,
      minWidth: 300
    });

    dialogRef.Result.subscribe((result) => {
      const action = result as MJDialogAction | undefined;
      if (action && 'text' in action) {
        const button = buttons.find(b => b.text === action.text);
        if (button && button.action) {
          button.action();
        }
      }
    });

    return dialogRef;
  }
}
