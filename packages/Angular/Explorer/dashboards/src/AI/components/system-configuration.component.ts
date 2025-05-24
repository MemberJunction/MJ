import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-system-configuration',
  templateUrl: './system-configuration.component.html',
  styleUrls: ['./system-configuration.component.scss']
})
export class SystemConfigurationComponent {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  constructor() { }

  onOpenEntityRecord(entityName: string, recordId: string) {
    this.openEntityRecord.emit({entityName, recordId});
  }
}