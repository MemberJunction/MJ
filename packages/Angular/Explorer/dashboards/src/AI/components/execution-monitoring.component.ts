import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-execution-monitoring',
  templateUrl: './execution-monitoring.component.html',
  styleUrls: ['./execution-monitoring.component.scss']
})
export class ExecutionMonitoringComponent {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  constructor() { }

  onOpenEntityRecord(entityName: string, recordId: string) {
    this.openEntityRecord.emit({entityName, recordId});
  }
}