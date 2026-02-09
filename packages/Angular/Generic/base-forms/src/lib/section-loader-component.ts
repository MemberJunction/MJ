import { Component, Input, OnDestroy, ViewChild, ViewContainerRef, AfterViewInit, OnChanges, SimpleChanges, Output, EventEmitter, ChangeDetectorRef, Type } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormSectionComponent } from './base-form-section-component';
import { BaseEntity } from '@memberjunction/core';

@Component({
  standalone: false,
  selector: 'mj-form-section',
  template: `<div class="form-section"><ng-template #container></ng-template></div>`
})
export class SectionLoaderComponent implements AfterViewInit, OnDestroy, OnChanges {
    @Input() Entity!: string;
    @Input() Section!: string;
    @Input() record!: BaseEntity;
    @Input() EditMode: boolean = false;
    @Output() LoadComplete: EventEmitter<void> = new EventEmitter<void>();

    @ViewChild('container', { read: ViewContainerRef }) container!: ViewContainerRef;
  
    private _sectionObj: BaseFormSectionComponent | null = null;
    constructor(private cdr: ChangeDetectorRef) { }

    ngOnChanges(changes: SimpleChanges): void {
        // react to EditMode change
        if (changes['EditMode'] && !changes['EditMode'].firstChange && this._sectionObj) {
          this._sectionObj.EditMode = this.EditMode;
        }
      }

    ngAfterViewInit(): void {
        // do this via a promise in order to defer the load by one pass of the event loop
        // because that results in Angular not complaining about change detection due to dynamic
        // nature of the inner component
        Promise.resolve().then(() => this.loadComponent());
    }

    private loadComponent() { 
      //console.log("loading component?", `${this.Entity}.${this.Section}`);
      const sectionInfo = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent,`${this.Entity}.${this.Section}`);
      if (sectionInfo) {
        const componentRef = this.container.createComponent(sectionInfo.SubClass as Type<BaseFormSectionComponent>); 
        // pass in record and edit mode
        this._sectionObj = <BaseFormSectionComponent>componentRef.instance;
        this._sectionObj.record = this.record;
        this._sectionObj.EditMode = this.EditMode;
        this.cdr.detectChanges(); // Manually trigger change detection so that the call below to LoadComplete.emit() will occur after DOM is updated
      }
      else{
        console.log("no section info");
      }
      this.LoadComplete.emit();
    }
  
    ngOnDestroy() {
      // Don't forget to cleanup dynamically created components
      this.container.clear();
    }
}