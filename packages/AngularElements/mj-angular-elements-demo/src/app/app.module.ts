import { NgModule, Injector } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { createCustomElement } from '@angular/elements';

import { HelloMJComponent } from './hello-mj/hello-mj.component';
import { MJListenerDemo } from './listener-demo/listener-demo.component';
import { UserViewGridWrapperComponent } from './user-view-grid-wrapper/user-view-grid-wrapper.component';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { EntityListDemoComponent } from './entity-list-demo/entity-list-demo.component';
import { EntityDetailDemoComponent } from './entity-detail-demo/entity-detail-demo.component';


@NgModule({
  declarations: [
    HelloMJComponent,
    MJListenerDemo,
    UserViewGridWrapperComponent,
    EntityListDemoComponent,
    EntityDetailDemoComponent
  ],
   imports: [
     BrowserModule,
     BrowserAnimationsModule,
     UserViewGridModule
  ],
  providers: []//,
  //entryComponents: [HelloWorldComponent, Component2Component, UserViewGridComponent]
})
export class AppModule { 
  constructor(injector: Injector) {
    const helloMJ = createCustomElement(HelloMJComponent, {injector: injector});
    customElements.define('mj-hello-world', helloMJ);

    const listenerDemo = createCustomElement(MJListenerDemo, {injector: injector});
    customElements.define('mj-listener-demo', listenerDemo);

    const entityListDemo = createCustomElement(EntityListDemoComponent, {injector: injector});
    customElements.define('mj-entity-list-demo', entityListDemo);

    const entityDetailDemo = createCustomElement(EntityDetailDemoComponent, {injector: injector});
    customElements.define('mj-entity-detail-demo', entityDetailDemo);
  }
  ngDoBootstrap() {}
}
