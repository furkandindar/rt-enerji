"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ConnectionLineType,
  ReactFlowProvider,
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import { UnitNode } from "./unit-node";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface Position {
  id: string;
  title: string;
  is_unit_head: boolean;
  employees: Employee[];
}

interface UnitData {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  unit_type: string | null;
  positions: Position[];
}

interface OrgChartFlowProps {
  units: UnitData[];
}

const nodeTypes = {
  unit: UnitNode,
};

const nodeWidth = 260;
const nodeHeight = 180;

// Dagre layout algorithm
function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function OrgChartFlowInner({ units }: OrgChartFlowProps) {
  // Convert units to nodes and edges
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = units.map((unit) => ({
      id: unit.id,
      type: "unit",
      position: { x: 0, y: 0 },
      data: {
        name: unit.name,
        code: unit.code,
        unit_type: unit.unit_type,
        positions: unit.positions,
      },
    }));

    const edges: Edge[] = units
      .filter((unit) => unit.parent_id)
      .map((unit) => ({
        id: `${unit.parent_id}-${unit.id}`,
        source: unit.parent_id!,
        target: unit.id,
        type: "smoothstep",
        animated: false,
        style: { stroke: "hsl(var(--border))", strokeWidth: 2 },
      }));

    // Apply layout
    return getLayoutedElements(nodes, edges);
  }, [units]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  if (units.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Henüz organizasyon verisi bulunmuyor
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      connectionLineType={ConnectionLineType.SmoothStep}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      attributionPosition="bottom-left"
    >
      <Background gap={20} size={1} />
      <Controls />
      <MiniMap
        nodeStrokeColor="hsl(var(--border))"
        nodeColor="hsl(var(--muted))"
        nodeBorderRadius={8}
        maskColor="hsl(var(--muted) / 0.6)"
        style={{
          backgroundColor: "hsl(var(--background))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "8px",
        }}
      />
    </ReactFlow>
  );
}

// Wrapper with ReactFlowProvider
export function OrgChartFlow({ units }: OrgChartFlowProps) {
  return (
    <ReactFlowProvider>
      <OrgChartFlowInner units={units} />
    </ReactFlowProvider>
  );
}

