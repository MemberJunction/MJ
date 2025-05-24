import { Component, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-agent-configuration',
  templateUrl: './agent-configuration.component.html',
  styleUrls: ['./agent-configuration.component.scss']
})
export class AgentConfigurationComponent implements OnInit {
  @Output() openEntityRecord = new EventEmitter<{entityName: string, recordId: string}>();

  public isLoading = false;

  ngOnInit(): void {
    // Initialize agent configuration
  }

  public onOpenRecord(entityName: string, recordId: string): void {
    this.openEntityRecord.emit({ entityName: entityName, recordId: recordId });
  }
}