import { Component, ComponentRef, EnvironmentInjector, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { Container } from '@memberjunction/ng-container-directives';
import { BaseEntity, LogError } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

@Component({
  standalone: false,
  selector: 'mj-resource',
  template: `<div [style.display]="!isVisible ? 'none' : 'block'" ><ng-template mjContainer ></ng-template></div>`,
})
export class ResourceContainerComponent implements OnChanges, OnDestroy {
  @Input() public Data!: ResourceData;
  @Input() public isVisible: boolean = false;
  @Output() public ResourceRecordSaved: EventEmitter<BaseEntity> = new EventEmitter<BaseEntity>();
  @Output() public ContentLoadingStarted: EventEmitter<ResourceContainerComponent> = new EventEmitter<ResourceContainerComponent>();
  @Output() public ContentLoadingComplete: EventEmitter<ResourceContainerComponent> = new EventEmitter<ResourceContainerComponent>();

  private _loadStarted: boolean = false;
  public get LoadStarted(): boolean {
    return this._loadStarted;
  }

  private _loadComplete: boolean = false;
  public get LoadComplete(): boolean {
    return this._loadComplete;
  }

  @ViewChild(Container, { static: true }) resourceContainer!: Container;

  private _loaded: boolean = false;
  private _componentRef: ComponentRef<any> | null = null;

  /** Root environment injector, used when creating dynamic resource components so their
   *  NgModule-declared pipes/directives/sub-components (e.g. mj-mcp-filter-panel, | date,
   *  cdkVirtualFor) resolve correctly. */
  private readonly envInjector = inject(EnvironmentInjector);

  constructor(public sharedService: SharedService) { }

   ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      const previousValue = changes['isVisible'].previousValue;
      const currentValue = changes['isVisible'].currentValue;

      if (previousValue !== currentValue) {
        // visible state has changed
        if (!this._loaded && currentValue) {
          // first time we are loading this resource, so go ahead and load whatever our component type is
          this.loadComponent();
        }
      }
    }
  }

  async loadComponent() {
    try {
      this._loaded = true;
      const resourceReg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(BaseResourceComponent, this.Data.ResourceType);

      if (!resourceReg) {
        throw new Error(`Unable to find resource registration for ${this.Data.ResourceType}`);
      }

      const viewContainerRef = this.resourceContainer.viewContainerRef;
      if (!viewContainerRef) {
        throw new Error(`Unable to find viewContainerRef`);
      }

      viewContainerRef.clear();
      // Pass environmentInjector so dynamically-created resource components (e.g. MCPResource)
      // can resolve their NgModule's declarations — sub-components, directives, and pipes —
      // at render time. Without it, things declared in the feature module silently fail.
      const componentRef = viewContainerRef.createComponent<typeof resourceReg.SubClass>(
        resourceReg.SubClass,
        { environmentInjector: this.envInjector }
      );

      // Track the component reference for cleanup
      this._componentRef = componentRef;

      componentRef.instance.LoadCompleteEvent = () => {
        this._loadComplete = true;
        this.ContentLoadingComplete.emit(this);
      }

      componentRef.instance.ResourceRecordSavedEvent = (resourceRecordEntity: BaseEntity) => {
        // bubble up the event
        this.ResourceRecordSaved.emit(resourceRecordEntity);
      }

      componentRef.instance.Data = this.Data;

      // do this right away since we have started
      this.ContentLoadingStarted.emit(this);
      // AND - wire up the event because we might start again in the future - example dashboards where a user can change the dashboard and add items etc
      componentRef.instance.LoadStartedEvent = () => {
        this._loadStarted = true;
        this.ContentLoadingStarted.emit(this);
      }
    }
    catch (e) {
      LogError(e);
    }
  }

  ngOnDestroy(): void {
    // CRITICAL: Destroy the dynamically created component to prevent zombie components
    if (this._componentRef) {
      this._componentRef.destroy();
      this._componentRef = null;
    }
    
    // Clear the view container to ensure no lingering references
    if (this.resourceContainer?.viewContainerRef) {
      this.resourceContainer.viewContainerRef.clear();
    }
    
    // Reset state
    this._loaded = false;
    this._loadStarted = false;
    this._loadComplete = false;
  }
}
