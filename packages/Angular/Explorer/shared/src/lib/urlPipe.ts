import { Pipe, PipeTransform } from '@angular/core';

@Pipe({name: 'formatUrl'})
export class URLPipe implements PipeTransform {
  transform(value: string): string {
    if (value && !value.includes('http')) 
        return 'https://' + value;
    else 
        return value;
  }
}