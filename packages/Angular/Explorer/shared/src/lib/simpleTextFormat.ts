import { Pipe, PipeTransform } from '@angular/core';

@Pipe({standalone: false, name: 'formatText'})
export class SimpleTextFormatPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return value;

    // Replace \n with <br> and \t with non-breaking spaces
    return value
      .replace(/\n/g, '<br>')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  }
}