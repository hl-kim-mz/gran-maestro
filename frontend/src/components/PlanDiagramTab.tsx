import { useCallback, useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, ReactFlow, type Edge, type Node, Position } from '@xyflow/react';
import { apiFetch } from '@/hooks/useApi';

import { Skeleton } from '@/components/ui/skeleton';

type GraphNodeType = 'plan' | 'request' | 'debug' | 'ideation' | 'discussion' | 'task' | 'commit';

interface GraphNodeData {
  label: string;
  status?: string;
  commit_hash?: string;
  [key: string]: unknown;
}

interface GraphNodeApi {
  id: string;
  type: GraphNodeType;
  data: GraphNodeData;
}

interface GraphEdgeApi {
  id: string;
  source: string;
  target: string;
}

interface GraphResponse {
  nodes: GraphNodeApi[];
  edges: GraphEdgeApi[];
}

interface PlanDiagramTabProps {
  planId: string;
  projectId: string;
}

interface DiagramNodeData extends GraphNodeData {
  kind: GraphNodeType;
}

const NODE_STYLES: Record<GraphNodeType, { backgroundColor: string; borderColor: string }> = {
  plan: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  request: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  debug: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  ideation: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  discussion: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
  task: { backgroundColor: '#6b7280', borderColor: '#6b7280' },
  commit: { backgroundColor: '#374151', borderColor: '#374151' },
};

const H_SPACING = 260;
const V_SPACING = 140;
const NODE_WIDTH = 190;

function withNewlines(label: string, extras: string[]): string {
  const filtered = [label, ...extras].map(text => text.trim()).filter(Boolean);
  return filtered.join('\n');
}

function buildNodeLabel(node: GraphNodeApi): string {
  const label = node.data?.label?.trim() || node.id;
  const extras: string[] = [];

  if (node.data.status) {
    extras.push(`status: ${node.data.status}`);
  }

  if (node.data.commit_hash) {
    extras.push(`commit: ${node.data.commit_hash}`);
  }

  return withNewlines(label, extras);
}

function calculatePositions(nodes: GraphNodeApi[], edges: GraphEdgeApi[]): Map<string, { x: number; y: number }> {
  const nodeIds = new Set(nodes.map(node => node.id));
  const incomingCount = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const levelById = new Map<string, number>();

  nodes.forEach(node => {
    incomingCount.set(node.id, 0);
    levelById.set(node.id, 0);
    adj.set(node.id, []);
  });

  edges.forEach(edge => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return;
    }
    const current = incomingCount.get(edge.target) ?? 0;
    incomingCount.set(edge.target, current + 1);
    adj.get(edge.source)!.push(edge.target);
  });

  const queue: string[] = [];
  incomingCount.forEach((incoming, nodeId) => {
    if (incoming === 0) {
      queue.push(nodeId);
    }
  });

  const remainingIncoming = new Map(incomingCount);
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    processed.add(current);
    const nextLevel = (levelById.get(current) ?? 0) + 1;
    const children = adj.get(current) ?? [];

    children.forEach(childId => {
      const candidateLevel = nextLevel;
      if ((levelById.get(childId) ?? 0) < candidateLevel) {
        levelById.set(childId, candidateLevel);
      }

      const remaining = Math.max((remainingIncoming.get(childId) ?? 0) - 1, 0);
      remainingIncoming.set(childId, remaining);
      if (remaining === 0) {
        queue.push(childId);
      }
    });
  }

  // cyclic graph fallback: keep unprocessed nodes at level 0
  const levels = new Map<number, string[]>();
  nodes.forEach(node => {
    const id = node.id;
    if (!processed.has(id) && (incomingCount.get(id) ?? 0) > 0) {
      levelById.set(id, 0);
    }

    const level = levelById.get(id) ?? 0;
    const items = levels.get(level) ?? [];
    items.push(id);
    levels.set(level, items);
  });

  const positions = new Map<string, { x: number; y: number }>();
  levels.forEach((ids, level) => {
    const totalHeight = (ids.length - 1) * V_SPACING;
    const startY = -totalHeight / 2;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: level * H_SPACING,
        y: startY + index * V_SPACING,
      });
    });
  });

  return positions;
}

export function PlanDiagramTab({ planId, projectId }: PlanDiagramTabProps) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<GraphResponse>(`/api/plans/${planId}/graph`, projectId);
      setGraph({
        nodes: data.nodes ?? [],
        edges: data.edges ?? [],
      });
    } catch (err) {
      console.error('Failed to fetch plan graph:', err);
      setError('그래프를 불러오지 못했습니다.');
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, [planId, projectId]);

  useEffect(() => {
    if (!planId || !projectId) {
      return;
    }
    fetchGraph();
  }, [fetchGraph, planId, projectId]);

  const nodes = useMemo(() => {
    if (!graph) {
      return [];
    }

    const nodeIds = new Set(graph.nodes.map(node => node.id));
    const positions = calculatePositions(
      graph.nodes,
      graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    );

    return graph.nodes.map<Node<DiagramNodeData>>(node => {
      const style = NODE_STYLES[node.type];
      const position = positions.get(node.id) ?? { x: 0, y: 0 };

      return {
        id: node.id,
        type: 'default',
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          ...node.data,
          kind: node.type,
          label: buildNodeLabel(node),
        },
        style: {
          width: NODE_WIDTH,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderWidth: 2,
          borderStyle: 'solid',
          color: '#ffffff',
          borderRadius: 10,
          padding: 10,
          boxShadow: '0 2px 6px rgb(0 0 0 / 0.18)',
          whiteSpace: 'pre-wrap',
          textAlign: 'center',
          fontSize: 12,
        },
      };
    });
  }, [graph]);

  const edges = useMemo(() => {
    if (!graph) {
      return [];
    }

    const nodeIds = new Set(graph.nodes.map(node => node.id));
    return graph.edges
      .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map<Edge>(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default',
      }));
  }, [graph]);

  if (loading) {
    return (
      <div className="h-full w-full p-6">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6">
        {error}
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6">
        그래프 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesConnectable={false}
        className="h-full min-h-0 w-full"
      >
        <Background variant="dots" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

