import { Injectable } from '@angular/core';
import dagre from '@dagrejs/dagre';
import { FlowNode, FlowConnection, FlowPosition, FlowLayoutDirection, FlowLayoutResult } from '../interfaces/flow-types';

/**
 * Auto-layout service using dagre for directed graph layout.
 * Calculates optimal node positions for clean flow visualization.
 */
@Injectable()
export class FlowLayoutService {
  private static readonly DEFAULT_NODE_WIDTH = 240;
  private static readonly DEFAULT_NODE_HEIGHT = 110;
  private static readonly NODE_SEPARATION = 64;
  private static readonly RANK_SEPARATION = 104;

  /**
   * Calculate optimal positions for all nodes using dagre layout.
   * Returns a map of node ID → new position.
   */
  CalculateLayout(
    nodes: FlowNode[],
    connections: FlowConnection[],
    direction: FlowLayoutDirection = 'vertical'
  ): FlowLayoutResult {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({
      rankdir: direction === 'horizontal' ? 'LR' : 'TB',
      nodesep: FlowLayoutService.NODE_SEPARATION,
      ranksep: FlowLayoutService.RANK_SEPARATION,
      marginx: 40,
      marginy: 40
    });
    graph.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      const width = node.Size?.Width ?? FlowLayoutService.DEFAULT_NODE_WIDTH;
      const height = node.Size?.Height ?? FlowLayoutService.DEFAULT_NODE_HEIGHT;
      graph.setNode(node.ID, { width, height });
    }

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
}
