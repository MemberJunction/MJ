import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { NodeData, Module } from '../../models/module.model';
import { ModuleManagerService } from '../../services/module-manager.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-custom-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="custom-node" [class.selected]="selected" (click)="onNodeClick()">
      <div class="node-header">
        <h4 class="node-title">{{ node.data.name }}</h4>
        <div class="node-actions">
          <button 
            class="icon-button" 
            (click)="onEditName($event)" 
            title="Edit Node">
            <i class="fas fa-pencil-alt"></i>
          </button>
          <button 
            class="icon-button danger" 
            (click)="onDelete($event)" 
            title="Delete Node">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      
      <div class="node-modules" 
           [class.drag-over]="isDragOver"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onDrop($event)">
        <div *ngIf="node.data.modules.length === 0" class="empty-modules">
          Drag modules here
        </div>
        
        <div *ngFor="let module of node.data.modules" 
             class="node-module"
             [attr.data-module-id]="module.id"
             draggable="true"
             (dragstart)="onModuleDragStart($event, module)"
             (dragend)="onModuleDragEnd($event)">
          <div class="module-info">
            <i class="fas" [ngClass]="module.icon" [style.color]="module.color"></i>
            <span>{{ module.name }}</span>
          </div>
          <div class="module-actions">
            <button 
              class="icon-button small" 
              (click)="onConfigureModule($event, module)" 
              title="Configure">
              <i class="fas fa-cog"></i>
            </button>
            <button 
              class="icon-button small danger" 
              (click)="onDeleteModule($event, module)" 
              title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
      
      <div class="socket input" 
           (mousedown)="onSocketMouseDown($event, 'input')"
           (mouseenter)="onSocketMouseEnter($event, 'input')"
           (mouseleave)="onSocketMouseLeave($event)">
      </div>
      <div class="socket output" 
           (mousedown)="onSocketMouseDown($event, 'output')"
           (mouseenter)="onSocketMouseEnter($event, 'output')"
           (mouseleave)="onSocketMouseLeave($event)">
      </div>
    </div>
  `,
  styles: [`
    .custom-node {
      min-width: 280px;
      position: relative;
      cursor: move;
      background: white;
      border: 2px solid #dee2e6;
      border-radius: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .custom-node:hover {
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }

    .custom-node.selected {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.25);
    }

    .node-header {
      padding: 1rem;
      background-color: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .node-title {
      font-weight: 600;
      font-size: 1rem;
      margin: 0;
    }

    .node-actions {
      display: flex;
      gap: 0.25rem;
    }

    .node-modules {
      padding: 0.75rem;
      min-height: 100px;
      position: relative;
    }

    .node-modules.drag-over {
      background-color: #e7f3ff;
      border: 2px dashed #007bff;
      border-radius: 4px;
    }

    .empty-modules {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100px;
      color: #adb5bd;
      font-size: 0.875rem;
      text-align: center;
    }

    .node-module {
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.2s ease;
      cursor: move;
    }

    .node-module:hover {
      background-color: #e9ecef;
      border-color: #adb5bd;
    }

    .node-module.dragging {
      opacity: 0.5;
    }

    .module-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .module-actions {
      display: flex;
      gap: 0.25rem;
    }

    .socket {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #007bff;
      z-index: 10;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      cursor: crosshair;
      transition: all 0.2s ease;
    }

    .socket.input {
      left: -9px;
    }

    .socket.output {
      right: -9px;
    }

    .socket:hover {
      background: #0056b3;
      transform: translateY(-50%) scale(1.2);
      box-shadow: 0 3px 6px rgba(0,0,0,0.3);
    }
    
    .socket.connecting {
      background: #28a745;
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0% { transform: translateY(-50%) scale(1); }
      50% { transform: translateY(-50%) scale(1.3); }
      100% { transform: translateY(-50%) scale(1); }
    }

    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: #6c757d;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .icon-button:hover {
      background: #f0f0f0;
      color: #495057;
    }

    .icon-button.small {
      width: 24px;
      height: 24px;
      font-size: 0.75rem;
    }

    .icon-button.danger {
      color: #dc3545;
    }

    .icon-button.danger:hover {
      background: #fee;
      color: #b02a37;
    }

  `]
})
export class CustomNodeViewComponent implements OnInit {
  @Input() node: any;
  @Input() selected: boolean = false;
  @Output() nodeSelected = new EventEmitter<any>();
  @Output() nodeDeleted = new EventEmitter<any>();
  @Output() nodeUpdated = new EventEmitter<any>();
  @Output() socketMouseDown = new EventEmitter<{event: MouseEvent, node: any, type: string}>();
  @Output() socketMouseEnter = new EventEmitter<{event: MouseEvent, node: any, type: string}>();
  @Output() socketMouseLeave = new EventEmitter<MouseEvent>();

  isDragOver = false;
  private draggedModule: Module | null = null;

  constructor(private moduleManager: ModuleManagerService) {}

  ngOnInit() {
    if (!this.node.data.modules) {
      this.node.data.modules = [];
    }
  }

  onNodeClick() {
    this.nodeSelected.emit(this.node);
  }

  onEditName(event: Event) {
    event.stopPropagation();
    const newName = prompt('Enter node name:', this.node.data.name);
    if (newName && newName !== this.node.data.name) {
      this.node.data.name = newName;
      this.nodeUpdated.emit(this.node);
    }
  }

  onDelete(event: Event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this node?')) {
      this.nodeDeleted.emit(this.node);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    // Can't read dataTransfer during dragover, so just accept all drags
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const plainData = event.dataTransfer?.getData('text/plain') || '';
    const moduleType = event.dataTransfer?.getData('moduleType');
    
    console.log('Module drop - plainData:', plainData, 'moduleType:', moduleType);
    
    // Check if this is a module drop
    if (moduleType || plainData.startsWith('module:')) {
      const type = moduleType || plainData.replace('module:', '');
      // Adding new module from toolbar
      const module = this.moduleManager.createModule(type);
      if (module) {
        this.node.data.modules.push(module);
        this.nodeUpdated.emit(this.node);
      }
    } else if (this.draggedModule) {
      // Reordering modules
      this.reorderModule(event);
    }
  }

  onModuleDragStart(event: DragEvent, module: Module) {
    this.draggedModule = module;
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('moduleReorder', module.id);
    (event.target as HTMLElement).classList.add('dragging');
  }

  onModuleDragEnd(event: DragEvent) {
    this.draggedModule = null;
    (event.target as HTMLElement).classList.remove('dragging');
  }

  private reorderModule(dropEvent: DragEvent) {
    if (!this.draggedModule) return;

    const modules = this.node.data.modules;
    const draggedIndex = modules.findIndex((m: Module) => m.id === this.draggedModule!.id);
    if (draggedIndex === -1) return;

    const [draggedItem] = modules.splice(draggedIndex, 1);

    // Find drop position
    const dropY = dropEvent.clientY;
    const moduleElements = Array.from((dropEvent.currentTarget as HTMLElement).querySelectorAll('.node-module'));
    let insertIndex = modules.length;

    for (let i = 0; i < moduleElements.length; i++) {
      const rect = moduleElements[i].getBoundingClientRect();
      if (dropY < rect.top + rect.height / 2) {
        insertIndex = i;
        break;
      }
    }

    modules.splice(insertIndex, 0, draggedItem);
    this.nodeUpdated.emit(this.node);
  }

  onConfigureModule(event: Event, module: Module) {
    event.stopPropagation();
    this.moduleManager.selectModule(module);
  }

  onDeleteModule(event: Event, module: Module) {
    event.stopPropagation();
    this.node.data.modules = this.moduleManager.deleteModule(this.node.data.modules, module.id);
    this.nodeUpdated.emit(this.node);
  }

  onSocketMouseDown(event: MouseEvent, type: string) {
    event.stopPropagation();
    event.preventDefault();
    this.socketMouseDown.emit({ event, node: this.node, type });
  }

  onSocketMouseEnter(event: MouseEvent, type: string) {
    this.socketMouseEnter.emit({ event, node: this.node, type });
  }

  onSocketMouseLeave(event: MouseEvent) {
    this.socketMouseLeave.emit(event);
  }
}