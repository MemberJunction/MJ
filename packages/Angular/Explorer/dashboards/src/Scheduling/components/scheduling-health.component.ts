import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchedulingInstrumentationService, LockInfo } from '../services/scheduling-instrumentation.service';

@Component({
  selector: 'app-scheduling-health',
  templateUrl: './scheduling-health.component.html',
  styleUrls: ['./scheduling-health.component.css']
})
export class SchedulingHealthComponent implements OnInit, OnDestroy {
  @Input() initialState: any;
  @Output() stateChange = new EventEmitter<any>();

  public locks: LockInfo[] = [];
  public isLoading = false;
  public panelStates = {
    locks: true,
    alerts: true
  };

  private destroy$ = new Subject<void>();

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadState();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadState(): void {
    if (this.initialState?.panelStates) {
      this.panelStates = { ...this.panelStates, ...this.initialState.panelStates };
    }
  }

  private loadData(): void {
    this.isLoading = true;

    this.schedulingService.lockInfo$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (locks) => {
          this.locks = locks;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading lock info:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  public onRefresh(): void {
    this.schedulingService.refresh();
  }

  public togglePanel(panelName: 'locks' | 'alerts'): void {
    this.panelStates[panelName] = !this.panelStates[panelName];
    this.emitStateChange();
  }

  public async onReleaseLock(jobId: string): Promise<void> {
    if (confirm('Are you sure you want to force release this lock? This should only be done if the job is stuck.')) {
      const result = await this.schedulingService.releaseLock(jobId);
      if (result) {
        console.log('Lock released successfully');
      }
    }
  }

  public formatDate(date: Date): string {
    return new Date(date).toLocaleString();
  }

  public getStaleLocks(): LockInfo[] {
    return this.locks.filter(l => l.isStale);
  }

  private emitStateChange(): void {
    const state = {
      panelStates: this.panelStates
    };
    this.stateChange.emit(state);
  }
}
