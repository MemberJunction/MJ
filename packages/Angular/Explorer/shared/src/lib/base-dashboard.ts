import { Directive, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CompositeKey, LogError } from '@memberjunction/core';
import { MJDashboardEntityExtended, ResourceData } from '@memberjunction/core-entities';
import { BaseResourceComponent } from './base-resource-component';

export interface DashboardConfig {
  dashboard: MJDashboardEntityExtended;
  userState?: any;
}

/**
 * Make the base class a directive so we can use Angular functionality and sub-classes can be @Component 
 */
@Directive()
export abstract class BaseDashboard extends BaseResourceComponent implements OnInit, OnDestroy {
  /**
   * Set or change the dashboard configuration. Changing this property will NOT cause the dashboard to reload. Call Refresh() to do that.
   */
  @Input() set Config(value: DashboardConfig) {
    this._config = value;
  }

  get Config(): DashboardConfig | null {
    return this._config;
  }

  /**
   * Subclasses can emit anytime an error occurs.  
   */
  @Output() Error = new EventEmitter<Error>();

  /**
   * Subclasses should emit this event anytime their internal state changes in a way that they'd like to persist.
   */
  @Output() UserStateChanged = new EventEmitter<any>();

  /**
   * Subclasses can emit this event anytime they want to communicate with the container to let it know that something has happened of significance.
   */
  @Output() Interaction = new EventEmitter<any>();

  /**
   * Subclasses can emit this event anytime they want to open a record within a particular entity. The container should handle this event and open the record.
   */
  @Output() OpenEntityRecord = new EventEmitter<{EntityName: string, RecordPKey: CompositeKey}>();

  protected _config: DashboardConfig | null = null;

  async ngOnInit() {
    super.ngOnInit();
    // initDashboard() runs before loadData() and can throw too, so BOTH are inside the guard — a
    // failure in either still reaches NotifyLoadComplete() (see runGuardedLoad).
    await this.runGuardedLoad(async () => {
      this.initDashboard();
      await this.loadData();
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  /**
   * This method will result in the dashboard being reloaded.
   */
  public async Refresh(): Promise<void> {
    await this.runGuardedLoad(() => this.loadData());
  }

  /**
   * Runs a load phase (initial mount or Refresh) with the GUARANTEE that {@link NotifyLoadComplete}
   * always fires — even if the work throws. The Explorer shell's loading screen blocks on that
   * signal, so without this guard one dashboard's uncaught `initDashboard()`/`loadData()` error
   * (e.g. an in-flight query rejecting while MJAPI restarts) would hang the entire shell forever on
   * a direct/deep-link load. On error we log it and emit the {@link Error} output so the subclass or
   * container can render its own error state; the loading screen still clears either way.
   */
  private async runGuardedLoad(work: () => void | Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      LogError(error);
      this.Error.emit(error);
    } finally {
      this.NotifyLoadComplete();
    }
  }

  private _visible: boolean = false;
  /**
   * This method can be used by a container to let the dashboard know that it is being opened/closed. Base class just sets a flag.
   */
  public SetVisible(visible: boolean): void {
    this._visible = visible;
  }

  /**
   * Subclasses can override this method to perform any initialization they need. This method only runs once when the dashboard is created.
   */
  protected abstract initDashboard(): void;

  /**
   * Subclasses should override this method to load their data. This method is called when the dashboard is created and when Refresh() is called.
   */
  protected abstract loadData(): void;

  /**
   * Sub-classes can override this to provide a custom icon class
   * @param data 
   * @returns 
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return "";
  }
} 