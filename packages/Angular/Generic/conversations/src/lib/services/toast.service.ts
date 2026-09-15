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
  public Toasts$: Observable<Toast[]> = this.toastsSubject.asObservable();

  /** @deprecated Use {@link Toasts$}. */
  public get toasts$(): Observable<Toast[]> {
    return this.Toasts$;
  }
  /** @deprecated Use {@link Toasts$}. */
  public set toasts$(value: Observable<Toast[]>) {
    this.Toasts$ = value;
  }

  private idCounter = 0;

  /**
   * Show a toast notification
   */
  public Show(message: string, type: ToastType = 'info', duration: number = 3000): string {
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
        this.Dismiss(toast.id);
      }, duration);
    }

    return toast.id;
  }

  /** @deprecated Use {@link Show}. */
  public show(message: string, type: ToastType = 'info', duration: number = 3000): string {
    return this.Show(message, type, duration);
  }

  /**
   * Show a success toast
   */
  public Success(message: string, duration: number = 3000): string {
    return this.Show(message, 'success', duration);
  }

  /** @deprecated Use {@link Success}. */
  public success(message: string, duration: number = 3000): string {
    return this.Success(message, duration);
  }

  /**
   * Show an error toast
   */
  public Error(message: string, duration: number = 5000): string {
    return this.Show(message, 'error', duration);
  }

  /** @deprecated Use {@link Error}. */
  public error(message: string, duration: number = 5000): string {
    return this.Error(message, duration);
  }

  /**
   * Show a warning toast
   */
  public Warning(message: string, duration: number = 4000): string {
    return this.Show(message, 'warning', duration);
  }

  /** @deprecated Use {@link Warning}. */
  public warning(message: string, duration: number = 4000): string {
    return this.Warning(message, duration);
  }

  /**
   * Show an info toast
   */
  public Info(message: string, duration: number = 3000): string {
    return this.Show(message, 'info', duration);
  }

  /** @deprecated Use {@link Info}. */
  public info(message: string, duration: number = 3000): string {
    return this.Info(message, duration);
  }

  /**
   * Dismiss a specific toast by ID
   */
  public Dismiss(id: string): void {
    const currentToasts = this.toastsSubject.value;
    const filteredToasts = currentToasts.filter(t => t.id !== id);
    this.toastsSubject.next(filteredToasts);
  }

  /** @deprecated Use {@link Dismiss}. */
  public dismiss(id: string): void {
    return this.Dismiss(id);
  }

  /**
   * Clear all toasts
   */
  public Clear(): void {
    this.toastsSubject.next([]);
  }

  /** @deprecated Use {@link Clear}. */
  public clear(): void {
    return this.Clear();
  }
}
