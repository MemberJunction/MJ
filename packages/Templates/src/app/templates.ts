import { Injectable, NgModule, Component, NgZone, Input, Inject, InjectionToken } from '@angular/core';
import { renderModule } from '@angular/platform-server';
import { ServerModule } from '@angular/platform-server';

import { MJGlobal, RegisterClass } from "@memberjunction/global"

export const CONTEXT = new InjectionToken<any>('context');


abstract class DynamicTemplateComponentBase {
  abstract context: any;
  public get Keys(): string[] {
    return Object.keys(this.context);
  }
}

// Dynamically create a component with the provided template
@RegisterClass(DynamicTemplateComponentBase,'A')
@Component({
    selector: 'app-dynamic-template-A',
    template: `
                <div>
                    FirstName: {{context.FirstName}}
                    LastName: {{context.LastName}}
                </div>`
})
class DynamicTemplateComponentA extends DynamicTemplateComponentBase{
    @Input() context: any = {};

    constructor(
        @Inject(CONTEXT) context: any
      ) {
        super();
        this.context = context;
      }
}


// Dynamically create a component with the provided template
@RegisterClass(DynamicTemplateComponentBase,'B')
@Component({
    selector: 'app-dynamic-template-B',
    template: `
                <div>
                  <div *ngFor="let item of Keys"> 
                    <span>Field: {{item}}</span>
                    <span>Value: {{context[item]}}</span>
                  </div>
                </div>`
})
class DynamicTemplateComponentB extends DynamicTemplateComponentBase{
    @Input() context: any = {};

    constructor(
        @Inject(CONTEXT) context: any
      ) {
        super();
        this.context = context;
      }

}

export abstract class DynamicTemplateModuleBase {

}

@RegisterClass(DynamicTemplateModuleBase, 'A')
@NgModule({
    imports: [ServerModule],
    declarations: [DynamicTemplateComponentA],
    bootstrap: [DynamicTemplateComponentA]
})
class DynamicTemplateModule_A extends DynamicTemplateModuleBase {}

@RegisterClass(DynamicTemplateModuleBase, 'B')
@NgModule({
    imports: [ServerModule],
    declarations: [DynamicTemplateComponentB],
    bootstrap: [DynamicTemplateComponentB]
})
class DynamicTemplateModule_B extends DynamicTemplateModuleBase {}


@Injectable({ providedIn: 'root' }) 
export class TemplateEngineService {
  constructor( private ngZone: NgZone ) {}

  async render(templateName: string, context: any = {}): Promise<string> {
    return this.ngZone.runOutsideAngular(async () => {
      try {
        console.log('rendering template', templateName);
        const moduleRegistration = MJGlobal.Instance.ClassFactory.GetRegistration(DynamicTemplateModuleBase, templateName);
        if (!moduleRegistration) {
            throw new Error('Template not found!');
        } 
  
        const documentTemplate = `<app-dynamic-template-${templateName} [context]="context"></app-dynamic-template-${templateName}>`; 
        console.log('documentTemplate', documentTemplate)
        const html = await renderModule(moduleRegistration.SubClass, { 
            document: documentTemplate, 
            extraProviders: [  
                {  
                  provide: CONTEXT, 
                  useValue: context  
                }
            ]
        });
    
        return html;    
      }
      catch (e) {
        console.error(e);
        return '';
      }
    });
  } 

  // private createComponentType(selector: string, template: string, styles: string[]): Type<any> {
  //   return Component({ selector, template, styles })(class {});
  // }
  // private createModuleType(componentType: Type<any>): Type<any> {
  //   return NgModule({
  //     declarations: [componentType],
  //     providers: [{ provide: Injector, useValue: this.injector }],
  //     imports: [CommonModule], 
  //   })(class {});
  // }

  // async createComponent(
  //   selector: string,
  //   template: string,
  //   styles: string[]
  // ): Promise<any> {
  //   const componentType = this.createComponentType(selector, template, styles);
  //   //const moduleType = this.createModuleType(componentType);
  //   //const moduleFactory = await this.compiler.compileModuleAsync(moduleType);
  //   //const moduleRef = moduleFactory.create(this.injector);

  //   const moduleFactory = await this.compiler.compileModuleAsync(DynamicTemplateModule);
  //   const moduleRef = moduleFactory.create(this.injector);
  //   const newCompfactory = moduleRef.componentFactoryResolver.resolveComponentFactory(componentType);
  //   const newcomponentRef = moduleFactory.create(this.injector );

  //   // Dynamically add the component to the existing module
  //   const componentFactory = moduleRef.componentFactoryResolver.resolveComponentFactory(componentType);
  //   const componentRef = componentFactory.create(this.injector );


  //   const factory = this.compiler.compileModuleAndAllComponentsSync(DynamicTemplateModule);
  //   console.log(factory);
  //   return moduleRef;
  //   // const componentFactory = factory.componentFactories.find(

  //   //   (comp) => comp.componentType === componentType
  //   // );
  //   // if (!componentFactory) {
  //   //   throw new Error('Component Factory not found');
  //   // }
  //   // const componentRef = componentFactory.create(this.injector);

  //   // return { component: componentRef };



  //   // const moduleFactory = await this.compiler.compileModuleAsync(moduleType);
  //   // const moduleRef = moduleFactory.create(this.injector);

  //   // const factory = moduleRef.componentFactoryResolver.resolveComponentFactory(componentType);
  //   // const componentRef = factory.create(this.injector );

  //   // return {module: moduleRef, moduleType: moduleType, component: componentRef};
  // }  
} 