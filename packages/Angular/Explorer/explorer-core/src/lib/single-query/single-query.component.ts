import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { RunQueryResult } from '@memberjunction/core';

@Component({
  standalone: false,
  selector: 'mj-single-query',
  templateUrl: './single-query.component.html',
  styleUrls: ['./single-query.component.css']
})
export class SingleQueryComponent implements OnInit {
  @Input() QueryId!: string;

  /** @deprecated Use {@link QueryId}. */
  @Input() set queryId(value: string) {
    this.QueryId = value;
  }
  /** @deprecated Use {@link QueryId}. */
  get queryId(): string {
    return this.QueryId;
  }
  @Output() public LoadComplete = new EventEmitter<void>();

  /**
   * @deprecated Use {@link LoadComplete}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (loadComplete) keeps working. Must stay AFTER LoadComplete: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public loadComplete = this.LoadComplete;
  @Output() public LoadStarted = new EventEmitter<void>();

  /**
   * @deprecated Use {@link LoadStarted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (loadStarted) keeps working. Must stay AFTER LoadStarted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public loadStarted = this.LoadStarted;

  public CleanQueryId: string = '';

  ngOnInit(): void {
    // Clean any quotes that might have been added upstream
    this.CleanQueryId = (this.QueryId && typeof this.QueryId === 'string')
      ? this.QueryId.replace(/^['"]|['"]$/g, '')
      : this.QueryId;
  }

  OnQueryStart(): void {
    this.LoadStarted.emit();
  }

  OnQueryComplete(_result: RunQueryResult): void {
    this.LoadComplete.emit();
  }
}




























