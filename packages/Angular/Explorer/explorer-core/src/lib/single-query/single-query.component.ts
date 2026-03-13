import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { RunQueryResult } from '@memberjunction/core';

@Component({
  standalone: false,
  selector: 'mj-single-query',
  templateUrl: './single-query.component.html',
  styleUrls: ['./single-query.component.css']
})
export class SingleQueryComponent implements OnInit {
  @Input() queryId!: string;
  @Output() public loadComplete = new EventEmitter<void>();
  @Output() public loadStarted = new EventEmitter<void>();

  public CleanQueryId: string = '';

  ngOnInit(): void {
    // Clean any quotes that might have been added upstream
    this.CleanQueryId = (this.queryId && typeof this.queryId === 'string')
      ? this.queryId.replace(/^['"]|['"]$/g, '')
      : this.queryId;
  }

  OnQueryStart(): void {
    this.loadStarted.emit();
  }

  OnQueryComplete(_result: RunQueryResult): void {
    this.loadComplete.emit();
  }
}




























