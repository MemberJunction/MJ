import { AfterContentInit, AfterViewInit, Component, OnInit } from '@angular/core';
import { TemplateEngineService } from './templates';
import { ReplaySubject } from 'rxjs';

@Component({
  selector: 'app-root-server',
  standalone: true,
  template: '',
})
export class AppServerComponent implements AfterViewInit {
  title = 'test';
  counter = 0;

  private static readySubject = new ReplaySubject<void>(1);

  public static Instance: AppServerComponent;

  static onReady() {
    return AppServerComponent.readySubject.asObservable();
  }
  constructor(private templateEngine: TemplateEngineService) {
    console.log('AppServerComponent.constructor');
    if (!AppServerComponent.Instance) {
      AppServerComponent.Instance = this;
    }
  }
  async ngAfterViewInit() {
    console.log('AppServerComponent.ngOnInit');

    // wait 3 seconds
    setTimeout(() => {
      AppServerComponent.readySubject.next();
      AppServerComponent.readySubject.complete();
    },3000);
    if (0 === this.counter++) {
      const dataObject = {
        FirstName: 'John',
        LastName: 'Doe',
        Title: 'President',
        Address: '123 Main St.',
        City: 'Anytown',
        State: 'CA',
        Country: 'USA',
        Phone: '555-1212',
      };

      const startTime = new Date().getTime();
      const result = await this.templateEngine.render('A', dataObject);
      const middleTime = new Date().getTime();
      //console.log(result, (middleTime - startTime) / 1000 + ' seconds'); 
      //const result2 = await this.templateEngine.render('B', dataObject);
      //console.log(result2, (new Date().getTime() - middleTime) / 1000 + ' seconds'); 
    }
  }

  public render(templateName: string, context: any = {}): Promise<string> {
    return this.templateEngine.render(templateName, context);
  }
}
