import { Directive, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

export interface DashboardConfig {
  UserState?: Record<string, any>;
}

/**
 * Make the base class a directive so we can use Angular functionality and sub-classes can be @Component 
 */
@Directive()
export abstract class BaseDashboard implements OnInit, OnDestroy {
  @Input() set Config(value: DashboardConfig) {
    this._config = value;
    this.onConfigChanged();
  }

  get Config(): DashboardConfig {
    return this._config;
  }

  @Output() Initialized = new EventEmitter<void>();
  @Output() Error = new EventEmitter<Error>();
  @Output() DataRefreshed = new EventEmitter<void>();
  @Output() UserStateChanged = new EventEmitter<Record<string, any>>();
  @Output() Interaction = new EventEmitter<any>();

  protected _config: DashboardConfig = {};
  protected refreshTimer: any;
  protected loading = false;

  constructor() {}

  ngOnInit(): void {
    this.initDashboard();
    this.loadData();
    this.Initialized.emit();
  }

  ngOnDestroy(): void {}

  Refresh(): void {
    if (!this.loading) {
      this.loadData();
    }
  }

  protected abstract initDashboard(): void;
  protected abstract loadData(): void;
  protected onConfigChanged(): void {}
} 