import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({
  selector: 'skip-split-panel',
  templateUrl: './skip-split-panel.component.html',
  styleUrls: ['./skip-split-panel.component.css']
})
export class SkipSplitPanelComponent extends BaseAngularComponent implements AfterViewInit {
  @Input() public SplitRatio: number = 0.6; // Default left panel takes 60% of width
  @Input() public MinLeftPanelWidth: string = '30%';
  @Input() public MinRightPanelWidth: string = '30%';
  @Output() public SplitRatioChanged = new EventEmitter<number>();

  @ViewChild('container') container!: ElementRef;
  @ViewChild('leftPanel') leftPanel!: ElementRef;
  @ViewChild('rightPanel') rightPanel!: ElementRef;
  @ViewChild('divider') divider!: ElementRef;

  private isDragging: boolean = false;
  private startX: number = 0;
  private startWidth: number = 0;
  private containerWidth: number = 0;

  constructor(private elementRef: ElementRef) {
    super();
  }

  ngAfterViewInit(): void {
    this.updatePanelSizes();
  }

  private updatePanelSizes(): void {
    if (!this.container || !this.leftPanel || !this.rightPanel) {
      return;
    }

    this.containerWidth = this.container.nativeElement.offsetWidth;
    const leftPanelWidth = Math.floor(this.containerWidth * this.SplitRatio);
    const rightPanelWidth = this.containerWidth - leftPanelWidth;

    this.leftPanel.nativeElement.style.width = `${leftPanelWidth}px`;
    this.rightPanel.nativeElement.style.width = `${rightPanelWidth}px`;
  }

  public startDrag(event: MouseEvent): void {
    this.isDragging = true;
    this.startX = event.clientX;
    this.startWidth = this.leftPanel.nativeElement.offsetWidth;
    
    event.preventDefault();
    
    // Add class to indicate dragging is in progress
    this.container.nativeElement.classList.add('dragging');
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) {
      return;
    }

    const dx = event.clientX - this.startX;
    const newLeftWidth = this.startWidth + dx;
    
    // Ensure minimum widths are respected
    const minLeftPx = this.parseMinWidth(this.MinLeftPanelWidth, this.containerWidth);
    const minRightPx = this.parseMinWidth(this.MinRightPanelWidth, this.containerWidth);
    
    if (newLeftWidth < minLeftPx || newLeftWidth > (this.containerWidth - minRightPx)) {
      return;
    }

    // Update panel widths
    this.leftPanel.nativeElement.style.width = `${newLeftWidth}px`;
    this.rightPanel.nativeElement.style.width = `${this.containerWidth - newLeftWidth}px`;
    
    // Calculate and emit the new ratio
    const newRatio = newLeftWidth / this.containerWidth;
    this.SplitRatio = newRatio;
    this.SplitRatioChanged.emit(newRatio);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.nativeElement.classList.remove('dragging');
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    // Maintain the split ratio when the window resizes
    this.containerWidth = this.container.nativeElement.offsetWidth;
    this.updatePanelSizes();
  }

  private parseMinWidth(value: string, containerWidth: number): number {
    if (value.endsWith('%')) {
      const percentage = parseFloat(value) / 100;
      return Math.floor(containerWidth * percentage);
    }
    if (value.endsWith('px')) {
      return parseFloat(value);
    }
    return parseFloat(value); // Assume pixels if no unit specified
  }

  public closeRightPanel(): void {
    // Close the right panel by setting the split ratio to 1 (left panel takes full width)
    this.SplitRatio = 1;
    this.updatePanelSizes();
    this.SplitRatioChanged.emit(this.SplitRatio);
  }
}