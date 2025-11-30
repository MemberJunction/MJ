import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchedulingInstrumentationService, JobTypeStatistics } from '../services/scheduling-instrumentation.service';

@Component({
  selector: 'app-scheduling-types',
  templateUrl: './scheduling-types.component.html',
  styleUrls: ['./scheduling-types.component.css']
})
export class SchedulingTypesComponent implements OnInit, OnDestroy {
  @Input() initialState: any;
  @Output() stateChange = new EventEmitter<any>();

  public jobTypes: JobTypeStatistics[] = [];
  public isLoading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadData(): void {
    this.isLoading = true;

    this.schedulingService.jobTypes$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (types) => {
          this.jobTypes = types;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading job types:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  public onRefresh(): void {
    this.schedulingService.refresh();
  }

  public formatPercentage(value: number): string {
    return (value * 100).toFixed(1) + '%';
  }

  public getTypeIcon(typeName: string): string {
    if (typeName.toLowerCase().includes('agent')) {
      return 'fa-robot';
    } else if (typeName.toLowerCase().includes('action')) {
      return 'fa-bolt';
    } else {
      return 'fa-cog';
    }
  }
}
