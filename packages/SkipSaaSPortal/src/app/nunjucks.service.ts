import { Injectable } from '@angular/core';
// import * as nunjucks from 'nunjucks';
// import { configure } from 'nunjucks';

@Injectable({
  providedIn: 'root'
}
)
export class NunjucksService {
  private env: any;

  constructor() {
    // this.env = configure({ autoescape: true });

    // configure({ autoescape: true });

    this.env.addFilter('currency', function(num: number) {
    return num.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
});
  }

  render(template: string, context: any): string {
    return this.env.renderString(template, context);
  }
}