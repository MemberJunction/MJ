/**
 * @fileoverview Main module for the MemberJunction Angular Elements demo application.
 * 
 * This module is responsible for registering Angular components and converting them
 * into custom elements (Web Components) that can be used in any HTML page.
 * 
 * The module demonstrates how to take standard Angular components and expose them as
 * reusable web components through Angular Elements, allowing them to be used in
 * non-Angular environments.
 */
import { NgModule, Injector } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { createCustomElement } from '@angular/elements';

// Import all components that will be converted to custom elements
import { HelloMJComponent } from './hello-mj/hello-mj.component';
import { MJListenerDemo } from './listener-demo/listener-demo.component';
import { UserViewGridWrapperComponent } from './user-view-grid-wrapper/user-view-grid-wrapper.component';
import { EntityListDemoComponent } from './entity-list-demo/entity-list-demo.component';
import { EntityDetailDemoComponent } from './entity-detail-demo/entity-detail-demo.component';

/**
 * Main module for the Angular Elements demo application.
 * 
 * This module:
 * 1. Declares all components that will be used in the application
 * 2. Imports required Angular modules
 * 3. Converts Angular components to custom elements in the constructor
 */
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
    BrowserAnimationsModule
  ],
  providers: []
  // Note: entryComponents is no longer needed in newer Angular versions
  // but would be used here in older versions to specify components for dynamic loading
})
export class AppModule { 
  /**
   * Constructor that converts Angular components to custom elements.
   * 
   * Each component is registered as a custom element with a unique tag name
   * that can be used in any HTML page once the application is built and
   * the resulting JavaScript is included in the page.
   * 
   * @param injector Angular dependency injector used to create the custom elements
   */
  constructor(injector: Injector) {
    // Convert HelloMJComponent to a custom element and register it as 'mj-hello-world'
    const helloMJ = createCustomElement(HelloMJComponent, {injector: injector});
    customElements.define('mj-hello-world', helloMJ);

    // Convert MJListenerDemo to a custom element and register it as 'mj-listener-demo'
    const listenerDemo = createCustomElement(MJListenerDemo, {injector: injector});
    customElements.define('mj-listener-demo', listenerDemo);

    // Convert EntityListDemoComponent to a custom element and register it as 'mj-entity-list-demo'
    const entityListDemo = createCustomElement(EntityListDemoComponent, {injector: injector});
    customElements.define('mj-entity-list-demo', entityListDemo);

    // Convert EntityDetailDemoComponent to a custom element and register it as 'mj-entity-detail-demo'
    const entityDetailDemo = createCustomElement(EntityDetailDemoComponent, {injector: injector});
    customElements.define('mj-entity-detail-demo', entityDetailDemo);
  }

  /**
   * Required empty method for Angular Elements.
   * 
   * When using Angular Elements, we don't bootstrap any components in the traditional way,
   * so this method is needed but intentionally left empty.
   */
  ngDoBootstrap() {}
}
