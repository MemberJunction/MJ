import { Component, OnInit, OnDestroy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subscription } from 'rxjs';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  standalone: false,
  selector: 'mj-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.css'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ToastComponent implements OnInit, OnDestroy {
  public Toasts: Toast[] = [];

  /** @deprecated Use {@link Toasts}. */
  public get toasts(): Toast[] {
    return this.Toasts;
  }
  /** @deprecated Use {@link Toasts}. */
  public set toasts(value: Toast[]) {
    this.Toasts = value;
  }
  private subscription: Subscription | null = null;

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.subscription = this.toastService.toasts$.subscribe(toasts => {
      this.Toasts = toasts;
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  /**
   * Get the icon class for a toast type
   */
  public GetIconClass(type: string): string {
    switch (type) {
      case 'success':
        return 'fa-solid fa-circle-check';
      case 'error':
        return 'fa-solid fa-circle-xmark';
      case 'warning':
        return 'fa-solid fa-triangle-exclamation';
      case 'info':
        return 'fa-solid fa-circle-info';
      default:
        return 'fa-solid fa-circle-info';
    }
  }

  /** @deprecated Use {@link GetIconClass}. */
  public getIconClass(type: string): string {
    return this.GetIconClass(type);
  }

  /**
   * Dismiss a toast
   */
  public Dismiss(toastId: string): void {
    this.toastService.dismiss(toastId);
  }

  /** @deprecated Use {@link Dismiss}. */
  public dismiss(toastId: string): void {
    return this.Dismiss(toastId);
  }

  /**
   * Track toasts by ID for performance
   */
  public TrackByToastId(index: number, toast: Toast): string {
    return toast.id;
  }

  /** @deprecated Use {@link TrackByToastId}. */
  public trackByToastId(index: number, toast: Toast): string {
    return this.TrackByToastId(index, toast);
  }
}
