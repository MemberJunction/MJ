import { Component, Input, OnDestroy, ViewChild, ViewContainerRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormSectionComponent } from './base-form-section-component';
import { BaseEntity } from '@memberjunction/core';

@Component({
  selector: 'mj-form-section',
  template: `<ng-template #container></ng-template>`
})
export class SectionLoaderComponent implements AfterViewInit, OnDestroy, OnChanges {
    @Input() Entity!: string;
    @Input() Section!: string;
    @Input() record!: BaseEntity;
    @Input() EditMode: boolean = false;

    @ViewChild('container', { read: ViewContainerRef }) container!: ViewContainerRef;
  
    private _sectionObj: BaseFormSectionComponent | null = null;

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
      const sectionInfo = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent,`${this.Entity}.${this.Section}`); 
      if (sectionInfo) {
        const componentRef = this.container.createComponent(sectionInfo.SubClass); 
        // pass in record and edit mode
        this._sectionObj = <BaseFormSectionComponent>componentRef.instance;
        this._sectionObj.record = this.record;
        this._sectionObj.EditMode = this.EditMode;
      }
    }
  
    ngOnDestroy() {
      // Don't forget to cleanup dynamically created components
      this.container.clear();
    }
}