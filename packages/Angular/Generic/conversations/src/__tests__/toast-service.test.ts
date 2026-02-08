import { describe, it, expect, beforeEach, vi } from 'vitest';

// We test ToastService logic directly without Angular DI
// The service uses BehaviorSubject which is pure RxJS

import { BehaviorSubject } from 'rxjs';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  timestamp: number;
}

/**
 * Reimplemented ToastService logic for testing without Angular @Injectable
 */
class TestableToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  public toasts$ = this.toastsSubject.asObservable();
  private idCounter = 0;

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
    if (duration > 0) {
      setTimeout(() => { this.dismiss(toast.id); }, duration);
    }
    return toast.id;
  }

  public success(message: string, duration: number = 3000): string {
    return this.show(message, 'success', duration);
  }

  public error(message: string, duration: number = 5000): string {
    return this.show(message, 'error', duration);
  }

  public warning(message: string, duration: number = 4000): string {
    return this.show(message, 'warning', duration);
  }

  public info(message: string, duration: number = 3000): string {
    return this.show(message, 'info', duration);
  }

  public dismiss(id: string): void {
    const currentToasts = this.toastsSubject.value;
    const filteredToasts = currentToasts.filter(t => t.id !== id);
    this.toastsSubject.next(filteredToasts);
  }

  public clear(): void {
    this.toastsSubject.next([]);
  }

  get currentToasts(): Toast[] {
    return this.toastsSubject.value;
  }
}

describe('ToastService', () => {
  let service: TestableToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new TestableToastService();
  });

  describe('show', () => {
    it('should add a toast to the list', () => {
      service.show('Hello');
      expect(service.currentToasts).toHaveLength(1);
      expect(service.currentToasts[0].message).toBe('Hello');
    });

    it('should default to info type', () => {
      service.show('Test');
      expect(service.currentToasts[0].type).toBe('info');
    });

    it('should return a toast ID', () => {
      const id = service.show('Test');
      expect(id).toBeDefined();
      expect(id).toContain('toast-');
    });

    it('should auto-dismiss after duration', () => {
      service.show('Temporary', 'info', 3000);
      expect(service.currentToasts).toHaveLength(1);
      vi.advanceTimersByTime(3001);
      expect(service.currentToasts).toHaveLength(0);
    });

    it('should not auto-dismiss when duration is 0', () => {
      service.show('Persistent', 'info', 0);
      vi.advanceTimersByTime(10000);
      expect(service.currentToasts).toHaveLength(1);
    });

    it('should support multiple toasts', () => {
      service.show('First');
      service.show('Second');
      service.show('Third');
      expect(service.currentToasts).toHaveLength(3);
    });
  });

  describe('convenience methods', () => {
    it('success should use success type', () => {
      service.success('Done!');
      expect(service.currentToasts[0].type).toBe('success');
    });

    it('error should use error type with 5s default duration', () => {
      service.error('Oops');
      expect(service.currentToasts[0].type).toBe('error');
      expect(service.currentToasts[0].duration).toBe(5000);
    });

    it('warning should use warning type with 4s default duration', () => {
      service.warning('Careful');
      expect(service.currentToasts[0].type).toBe('warning');
      expect(service.currentToasts[0].duration).toBe(4000);
    });

    it('info should use info type', () => {
      service.info('FYI');
      expect(service.currentToasts[0].type).toBe('info');
    });
  });

  describe('dismiss', () => {
    it('should remove specific toast by ID', () => {
      const id1 = service.show('First');
      service.show('Second');
      service.dismiss(id1);
      expect(service.currentToasts).toHaveLength(1);
      expect(service.currentToasts[0].message).toBe('Second');
    });

    it('should do nothing for unknown ID', () => {
      service.show('Test');
      service.dismiss('unknown-id');
      expect(service.currentToasts).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all toasts', () => {
      service.show('First');
      service.show('Second');
      service.show('Third');
      service.clear();
      expect(service.currentToasts).toHaveLength(0);
    });
  });

  describe('toasts$ observable', () => {
    it('should emit toast updates', () => {
      const emissions: Toast[][] = [];
      service.toasts$.subscribe(toasts => emissions.push(toasts));

      service.show('Test');
      expect(emissions).toHaveLength(2); // initial [] + one add
      expect(emissions[1]).toHaveLength(1);
    });
  });
});
