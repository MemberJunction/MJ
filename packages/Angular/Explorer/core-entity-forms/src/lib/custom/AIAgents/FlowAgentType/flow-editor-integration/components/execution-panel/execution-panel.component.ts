import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { FlowExecutorService, ExecutionStatus, ExecutionLog } from '../../services/flow-executor.service';

@Component({
  selector: 'app-execution-panel',
  templateUrl: './execution-panel.component.html',
  styleUrls: ['./execution-panel.component.scss']
})
export class ExecutionPanelComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  executionStatus: ExecutionStatus = 'idle';
  executionLogs: ExecutionLog[] = [];
  currentStepId: number | null = null;
  
  // Resize properties
  panelHeight = 300; // Default height
  minHeight = 150;
  maxHeight = 600;
  isResizing = false; // Made public for template access
  private startY = 0;
  private startHeight = 0;
  
  // Panel visibility
  isPanelClosed = false;
  
  constructor(private flowExecutor: FlowExecutorService) { }

  ngOnInit() {
    // Subscribe to execution status
    this.flowExecutor.executionStatus
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.executionStatus = status;
        // Reopen panel when a new execution starts
        if (status === 'running' && this.isPanelClosed) {
          this.isPanelClosed = false;
        }
      });
    
    // Subscribe to execution logs
    this.flowExecutor.executionLogs
      .pipe(takeUntil(this.destroy$))
      .subscribe(logs => {
        this.executionLogs = logs;
        // Auto-scroll to bottom when new logs arrive
        setTimeout(() => this.scrollToBottom(), 0);
      });
    
    // Subscribe to current step
    this.flowExecutor.currentStepId
      .pipe(takeUntil(this.destroy$))
      .subscribe(stepId => {
        this.currentStepId = stepId;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    // Clean up resize listeners
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
  }

  onPause() {
    this.flowExecutor.pause();
  }

  onResume() {
    this.flowExecutor.resume();
  }

  onStop() {
    this.flowExecutor.stop();
  }

  clearLogs() {
    this.executionLogs = [];
  }

  closePanel() {
    this.isPanelClosed = true;
  }

  getLogIcon(type: ExecutionLog['type']): string {
    switch (type) {
      case 'start': return 'fa-play-circle';
      case 'complete': return 'fa-check-circle';
      case 'error': return 'fa-exclamation-circle';
      case 'log': return 'fa-info-circle';
      default: return 'fa-circle';
    }
  }

  getLogClass(type: ExecutionLog['type']): string {
    switch (type) {
      case 'start': return 'log-start';
      case 'complete': return 'log-success';
      case 'error': return 'log-error';
      case 'log': return 'log-info';
      default: return '';
    }
  }

  formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }

  private scrollToBottom() {
    const logsContainer = document.querySelector('.logs-container');
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }

  // Resize methods
  onResizeStart(event: MouseEvent) {
    this.isResizing = true;
    this.startY = event.clientY;
    this.startHeight = this.panelHeight;
    
    // Add document listeners
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
    
    // Add class to body to change cursor globally
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    
    // Prevent text selection during resize
    event.preventDefault();
  }

  private onResizeMove = (event: MouseEvent) => {
    if (!this.isResizing) return;
    
    // Calculate new height (inverted because we're dragging from top)
    const deltaY = this.startY - event.clientY;
    const newHeight = this.startHeight + deltaY;
    
    // Apply constraints
    this.panelHeight = Math.max(this.minHeight, Math.min(this.maxHeight, newHeight));
  }

  private onResizeEnd = () => {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    
    // Reset body styles
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
}