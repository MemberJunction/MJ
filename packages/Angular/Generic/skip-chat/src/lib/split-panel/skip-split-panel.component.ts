import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SplitterPaneComponent } from '@progress/kendo-angular-layout';

export type SplitPanelMode = 'LeftOnly' | 'RightOnly' | 'BothSides';

@Component({
  standalone: false,
  selector: 'skip-split-panel',
  templateUrl: './skip-split-panel.component.html',
  styleUrls: ['./skip-split-panel.component.css']
})
export class SkipSplitPanelComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnChanges {
  @Input() public SplitRatio: number = 0.6; // Default left panel takes 60% of width
  @Input() public MinLeftPanelWidth: string = '20%';
  @Input() public MinRightPanelWidth: string = '20%';
  @Input() public RightPanelHeaderContent: {
    title: string;
    type: string;
    date: Date | null;
    version: string;
  } | null = null;
  @Input() public VersionList: Array<{ID: string, Version: string | number, __mj_CreatedAt: Date}> = [];
  @Input() public SelectedVersionId: string = '';
  
  private _mode: SplitPanelMode = 'BothSides';
  @Input() 
  public set Mode(value: SplitPanelMode) {
    const oldMode = this._mode;
    this._mode = value;
    
    if (oldMode !== value) {
      // Update the pane sizes when mode changes
      this.updatePaneSizes();
    }
  }
  public get Mode(): SplitPanelMode {
    return this._mode;
  }
  
  @Output() public SplitRatioChanged = new EventEmitter<number>();
  @Output() public VersionDropdownToggled = new EventEmitter<void>();
  @Output() public VersionSelected = new EventEmitter<string>();

  @ViewChild('leftSplitterPane', { static: false }) leftSplitterPane!: SplitterPaneComponent;

  // Properties for pane sizes
  public leftPaneSize: string = '50%';
  public rightPaneSize: string = '50%';
  private _lastRatioBeforeClosing: number = 0.5; // Default value
  
  // Version dropdown state
  public showVersionDropdown: boolean = false;

  constructor() {
    super();
  }

  ngOnInit(): void {
    this.updatePaneSizes();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.updatePaneSizes();
    }, 10);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['SplitRatio'] && !changes['SplitRatio'].firstChange) {
      this.updatePaneSizes();
    }
  }

  /**
   * Updates the pane sizes based on the current SplitRatio
   */
  private updatePaneSizes(): void {
    // Convert split ratio to percentages for the panes
    const leftPct = Math.round(this.SplitRatio * 100);
    const rightPct = 100 - leftPct;
    
    this.leftPaneSize = `${leftPct}%`;
    this.rightPaneSize = `${rightPct}%`;
  }

  /**
   * Handler for the Kendo Splitter's resize event
   * @param event The resize event data
   */
  public onResize(event: any): void {
    if (this.Mode === 'BothSides') {
      // Calculate the new split ratio from the sizes in the event
      const totalSize = event.panes[0].size + event.panes[1].size;
      const leftSize = event.panes[0].size;
      const newRatio = leftSize / totalSize;
      
      // Update the split ratio and emit the change
      this.SplitRatio = newRatio;
      this.SplitRatioChanged.emit(newRatio);
      
      // Update our pane size properties
      this.updatePaneSizes();
    }
  }

  /**
   * Closes the right panel by switching to LeftOnly mode
   */
  public closeRightPanel(): void {
    // Store the current ratio before closing, so we can restore it later when reopening
    this._lastRatioBeforeClosing = this.SplitRatio;
    
    if (this.leftSplitterPane) {
      this.leftSplitterPane.collapsed = false; // make sure we're not collapsed
    }
    // Close the right panel by switching to LeftOnly mode
    this.Mode = 'LeftOnly';
    this.SplitRatioChanged.emit(this.SplitRatio);
  }
  
  /**
   * Sets the mode for the split panel
   * @param mode The new mode to set
   */
  public setMode(mode: SplitPanelMode): void {
    const wasLeftOnly = this.Mode === 'LeftOnly';
    this.Mode = mode;
    
    // If we're switching from LeftOnly to BothSides, restore the previous ratio
    if (wasLeftOnly && mode === 'BothSides') {
      this.SplitRatio = this._lastRatioBeforeClosing;
      this.updatePaneSizes();
    }
  }
  
  public toggleVersionDropdown(): void {
    this.showVersionDropdown = !this.showVersionDropdown;
    this.VersionDropdownToggled.emit();
  }
  
  public selectVersion(versionId: string): void {
    this.SelectedVersionId = versionId;
    this.showVersionDropdown = false;
    this.VersionSelected.emit(versionId);
  }
}