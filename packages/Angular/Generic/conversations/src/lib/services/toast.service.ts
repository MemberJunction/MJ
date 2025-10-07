import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  public toasts$: Observable<Toast[]> = this.toastsSubject.asObservable();

  private idCounter = 0;

  /**
   * Show a toast notification
   */
  public show(message: string, type: ToastType = 'info', duration: number = 3000): string {
    const toast: Toast = {
      id: `toast-${++this.idCounter}-${Date.now()}`,
      message,
      type,
      duration,
      timestamp: Date.now()
    };

    const currentToasts = this.toastsSubject.value;
    this.toastsSubject.next([...currentToasts, toast]);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast.id);
      }, duration);
    }

    return toast.id;
  }

  /**
   * Show a success toast
   */
  public success(message: string, duration: number = 3000): string {
    return this.show(message, 'success', duration);
  }

  /**
   * Show an error toast
   */
  public error(message: string, duration: number = 5000): string {
    return this.show(message, 'error', duration);
  }

  /**
   * Show a warning toast
   */
  public warning(message: string, duration: number = 4000): string {
    return this.show(message, 'warning', duration);
  }

  /**
   * Show an info toast
   */
  public info(message: string, duration: number = 3000): string {
    return this.show(message, 'info', duration);
  }

  /**
   * Dismiss a specific toast by ID
   */
  public dismiss(id: string): void {
    const currentToasts = this.toastsSubject.value;
    const filteredToasts = currentToasts.filter(t => t.id !== id);
    this.toastsSubject.next(filteredToasts);
  }

  /**
   * Clear all toasts
   */
  public clear(): void {
    this.toastsSubject.next([]);
  }
}
