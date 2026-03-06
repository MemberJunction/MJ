import { Injectable } from '@angular/core';
import { FlowNode, FlowConnection, FlowSnapshot } from '../interfaces/flow-types';

/**
 * Snapshot-based undo/redo state management for the flow editor.
 * Stores complete state snapshots on each change for reliable undo/redo.
 */
@Injectable()
export class FlowStateService {
  private undoStack: FlowSnapshot[] = [];
  private redoStack: FlowSnapshot[] = [];
  private maxStackSize = 50;

  get CanUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get CanRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get UndoCount(): number {
    return this.undoStack.length;
  }

  get RedoCount(): number {
    return this.redoStack.length;
  }

  /**
   * Push the current state before making a change.
   * Call this BEFORE modifying nodes/connections so the previous state is saved.
   */
  PushState(nodes: FlowNode[], connections: FlowConnection[]): void {
    const snapshot = this.createSnapshot(nodes, connections);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack
    this.redoStack = [];
  }

  /**
   * Undo the last change. Returns the previous state snapshot.
   * The caller must pass the CURRENT state so it can be pushed to redo.
   */
  Undo(currentNodes: FlowNode[], currentConnections: FlowConnection[]): FlowSnapshot | null {
    if (!this.CanUndo) {
      return null;
    }
    // Push current state to redo
    this.redoStack.push(this.createSnapshot(currentNodes, currentConnections));
    // Pop and return previous state
    return this.undoStack.pop()!;
  }

  /**
   * Redo the last undone change. Returns the restored state snapshot.
   * The caller must pass the CURRENT state so it can be pushed to undo.
   */
  Redo(currentNodes: FlowNode[], currentConnections: FlowConnection[]): FlowSnapshot | null {
    if (!this.CanRedo) {
      return null;
    }
    // Push current state to undo
    this.undoStack.push(this.createSnapshot(currentNodes, currentConnections));
    // Pop and return redo state
    return this.redoStack.pop()!;
  }

  /** Clear all undo/redo history */
  Clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private createSnapshot(nodes: FlowNode[], connections: FlowConnection[]): FlowSnapshot {
    return {
      Nodes: nodes.map(n => this.cloneNode(n)),
      Connections: connections.map(c => ({ ...c, Data: c.Data ? { ...c.Data } : undefined }))
    };
  }

  private cloneNode(node: FlowNode): FlowNode {
    return {
      ...node,
      Position: { ...node.Position },
      Size: node.Size ? { ...node.Size } : undefined,
      Ports: node.Ports.map(p => ({ ...p })),
      Badges: node.Badges ? node.Badges.map(b => ({ ...b })) : undefined,
      Data: node.Data ? { ...node.Data } : undefined
    };
  }
}
