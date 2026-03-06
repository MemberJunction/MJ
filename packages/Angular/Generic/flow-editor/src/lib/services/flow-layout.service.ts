import { Injectable } from '@angular/core';
import { FlowNode, FlowConnection, FlowPosition, FlowLayoutDirection, FlowLayoutResult } from '../interfaces/flow-types';

/**
 * Auto-layout service using dagre for directed graph layout.
 * Calculates optimal node positions for clean flow visualization.
 */
@Injectable()
export class FlowLayoutService {
  private static readonly DEFAULT_NODE_WIDTH = 220;
  private static readonly DEFAULT_NODE_HEIGHT = 100;
  private static readonly NODE_SEPARATION = 60;
  private static readonly RANK_SEPARATION = 100;

  /**
   * Calculate optimal positions for all nodes using dagre layout.
   * Returns a map of node ID → new position.
   */
  CalculateLayout(
    nodes: FlowNode[],
    connections: FlowConnection[],
    direction: FlowLayoutDirection = 'vertical'
  ): FlowLayoutResult {
    // Dynamic import dagre to avoid issues if not installed
    let dagre: typeof import('@dagrejs/dagre');
    try {
      dagre = require('@dagrejs/dagre');
    } catch {
      console.warn('FlowLayoutService: @dagrejs/dagre not available, returning current positions');
      return this.currentPositions(nodes);
    }

    const graph = new dagre.graphlib.Graph();
    graph.setGraph({
      rankdir: direction === 'horizontal' ? 'LR' : 'TB',
      nodesep: FlowLayoutService.NODE_SEPARATION,
      ranksep: FlowLayoutService.RANK_SEPARATION,
      marginx: 40,
      marginy: 40
    });
    graph.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    for (const node of nodes) {
      const width = node.Size?.Width ?? FlowLayoutService.DEFAULT_NODE_WIDTH;
      const height = node.Size?.Height ?? FlowLayoutService.DEFAULT_NODE_HEIGHT;
      graph.setNode(node.ID, { width, height });
    }

    // Add edges
    for (const conn of connections) {
      if (graph.hasNode(conn.SourceNodeID) && graph.hasNode(conn.TargetNodeID)) {
        graph.setEdge(conn.SourceNodeID, conn.TargetNodeID);
      }
    }

    dagre.layout(graph);

    const positions = new Map<string, FlowPosition>();
    for (const node of nodes) {
      const layoutNode = graph.node(node.ID);
      if (layoutNode) {
        // dagre returns center positions; convert to top-left
        const width = node.Size?.Width ?? FlowLayoutService.DEFAULT_NODE_WIDTH;
        const height = node.Size?.Height ?? FlowLayoutService.DEFAULT_NODE_HEIGHT;
        positions.set(node.ID, {
          X: layoutNode.x - width / 2,
          Y: layoutNode.y - height / 2
        });
      }
    }

    return { Positions: positions };
  }

  private currentPositions(nodes: FlowNode[]): FlowLayoutResult {
    const positions = new Map<string, FlowPosition>();
    for (const node of nodes) {
      positions.set(node.ID, { ...node.Position });
    }
    return { Positions: positions };
  }
}
