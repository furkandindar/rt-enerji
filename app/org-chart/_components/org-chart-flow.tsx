"use client";

import { useEffect, useCallback, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  Node,
  Edge,
  ConnectionLineType,
  ReactFlowProvider,
  BaseEdge,
  EdgeProps,
} from "reactflow";
import { toPng } from "html-to-image";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge } from "elkjs/lib/elk-api";
import "reactflow/dist/style.css";
import { UnitNode } from "./unit-node";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
  is_unit_head: boolean;
  employees: Employee[];
  color: string | null;
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

type EdgePoint = { x: number; y: number };

function TreeEdge({
  id,
  data,
  style,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const points = (data as { points?: EdgePoint[] } | undefined)?.points;

  // Use React Flow's actual handle positions for endpoints (always match the
  // handle dots in the DOM regardless of size estimation drift). Use ELK's
  // interior bend Y as the shared trunk level — sibling edges from the same
  // parent get the same trunk Y from ELK and visually merge into one trunk.
  const interiorBends = points && points.length >= 2 ? points.slice(1, -1) : [];
  const trunkY = interiorBends[0]?.y ?? (sourceY + targetY) / 2;
  const path = `M ${sourceX},${sourceY} L ${sourceX},${trunkY} L ${targetX},${trunkY} L ${targetX},${targetY}`;

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}

const edgeTypes = {
  tree: TreeEdge,
};

const NODE_WIDTH = 260;
const FALLBACK_HEIGHT = 180;

const elk = new ELK();

const elkOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "60",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.padding": "[top=20,left=20,bottom=20,right=20]",
};

const nodeLayoutOptions = {
  "elk.portConstraints": "FIXED_POS",
};

function estimateNodeHeight(positions: Position[]): number {
  // Mirrors UnitNode markup: header row + headPosition block + otherPositions + per-employee rows + paddings
  const HEADER = 64;
  const PADDING = 24;
  const HEAD_POSITION = 56;
  const OTHER_POSITION_BASE = 32;
  const EMPLOYEE_ROW = 18;

  const head = positions.find((p) => p.is_unit_head);
  const others = positions.filter((p) => !p.is_unit_head);
  const headEmps = head?.employees.length ?? (head ? 1 : 0); // empty head still renders one "Boş" row
  const otherEmps = others.reduce((sum, p) => sum + p.employees.length, 0);

  return (
    HEADER +
    PADDING +
    (head ? HEAD_POSITION + headEmps * EMPLOYEE_ROW : 0) +
    others.length * OTHER_POSITION_BASE +
    otherEmps * EMPLOYEE_ROW
  );
}

async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  heights: Map<string, number>
) {
  const graph = {
    id: "root",
    layoutOptions: elkOptions,
    children: nodes.map((n) => {
      const h = heights.get(n.id) ?? FALLBACK_HEIGHT;
      return {
        id: n.id,
        width: NODE_WIDTH,
        height: h,
        layoutOptions: nodeLayoutOptions,
        ports: [
          {
            id: `${n.id}__north`,
            x: NODE_WIDTH / 2,
            y: 0,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "NORTH" },
          },
          {
            id: `${n.id}__south`,
            x: NODE_WIDTH / 2,
            y: h,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "SOUTH" },
          },
        ],
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [`${e.source}__south`],
      targets: [`${e.target}__north`],
    })),
  };

  const layout = await elk.layout(graph);

  const positionMap = new Map<string, { x: number; y: number }>();
  layout.children?.forEach((c) => {
    positionMap.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
  });

  const edgeRouting = new Map<string, EdgePoint[]>();
  (layout.edges as ElkExtendedEdge[] | undefined)?.forEach((e) => {
    const section = e.sections?.[0];
    if (!section) return;
    const pts: EdgePoint[] = [
      { x: section.startPoint.x, y: section.startPoint.y },
      ...(section.bendPoints?.map((p) => ({ x: p.x, y: p.y })) ?? []),
      { x: section.endPoint.x, y: section.endPoint.y },
    ];
    edgeRouting.set(e.id, pts);
  });

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: positionMap.get(node.id) ?? { x: 0, y: 0 },
  }));

  const layoutedEdges = edges.map((edge) => ({
    ...edge,
    type: "tree",
    data: { points: edgeRouting.get(edge.id) },
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

function OrgChartFlowInner({ units }: OrgChartFlowProps) {
  const { getNodes, fitView } = useReactFlow();
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const rawNodes: Node[] = units.map((unit) => ({
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

    const rawEdges: Edge[] = units
      .filter((unit) => unit.parent_id)
      .map((unit) => ({
        id: `${unit.parent_id}-${unit.id}`,
        source: unit.parent_id!,
        target: unit.id,
        type: "tree",
        animated: false,
        style: { stroke: "hsl(var(--border))", strokeWidth: 2 },
      }));

    const heights = new Map(
      units.map((u) => [u.id, estimateNodeHeight(u.positions)])
    );

    let cancelled = false;
    getLayoutedElements(rawNodes, rawEdges, heights).then((layouted) => {
      if (cancelled) return;
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      // Re-fit after layout settles
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }));
    });

    return () => {
      cancelled = true;
    };
  }, [units, setNodes, setEdges, fitView]);

  // Capture full chart as image
  const captureFullChart = useCallback(async () => {
    const currentNodes = getNodes();
    if (currentNodes.length === 0) return null;

    // Calculate bounds of all nodes
    const bounds = getNodesBounds(currentNodes);
    const padding = 50;
    const imageWidth = bounds.width + padding * 2;
    const imageHeight = bounds.height + padding * 2;

    // Get viewport that shows all nodes
    const viewport = getViewportForBounds(
      bounds,
      imageWidth,
      imageHeight,
      0.5,
      2,
      padding
    );

    const viewportEl = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!viewportEl) return null;

    // Capture with calculated dimensions
    const dataUrl = await toPng(viewportEl, {
      backgroundColor: "#ffffff",
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });

    return { dataUrl, width: imageWidth, height: imageHeight };
  }, [getNodes]);

  // Export PDF
  const handleExportPdf = useCallback(async () => {
    setIsExportingPdf(true);
    try {
      const result = await captureFullChart();
      if (!result) return;

      const { dataUrl, width, height } = result;

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([width, height]);

      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const pngBytes = Uint8Array.from(atob(base64Data), (c) =>
        c.charCodeAt(0)
      );
      const pngImage = await pdfDoc.embedPng(pngBytes);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "organizasyon-semasi.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF export error:", error);
    } finally {
      setIsExportingPdf(false);
    }
  }, [captureFullChart]);

  // Export Excel
  const handleExportExcel = useCallback(async () => {
    setIsExportingExcel(true);
    try {
      const result = await captureFullChart();
      if (!result) return;

      const base64Image = result.dataUrl.split(",")[1];
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "RT Enerji";
      workbook.created = new Date();

      // Sheet 1: Org Chart Image
      const chartSheet = workbook.addWorksheet("Organizasyon Şeması");
      const imageId = workbook.addImage({ base64: base64Image, extension: "png" });
      chartSheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: result.width, height: result.height },
      });

      // Sheet 2: Units
      const unitsSheet = workbook.addWorksheet("Birimler");
      unitsSheet.columns = [
        { header: "Birim Adı", key: "name", width: 35 },
        { header: "Birim Kodu", key: "code", width: 15 },
        { header: "Birim Tipi", key: "type", width: 20 },
        { header: "Üst Birim", key: "parent", width: 35 },
        { header: "Pozisyon Sayısı", key: "posCount", width: 18 },
      ];
      units.forEach((unit) => {
        const parent = units.find((u) => u.id === unit.parent_id);
        unitsSheet.addRow({
          name: unit.name,
          code: unit.code || "-",
          type: unit.unit_type || "-",
          parent: parent?.name || "-",
          posCount: unit.positions.length,
        });
      });
      unitsSheet.getRow(1).font = { bold: true };
      unitsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      // Sheet 3: Positions
      const posSheet = workbook.addWorksheet("Pozisyonlar");
      posSheet.columns = [
        { header: "Birim", key: "unit", width: 35 },
        { header: "Pozisyon", key: "position", width: 30 },
        { header: "Birim Başı", key: "isHead", width: 12 },
        { header: "Çalışan", key: "employee", width: 25 },
      ];
      units.forEach((unit) => {
        unit.positions.forEach((pos) => {
          if (pos.employees.length > 0) {
            pos.employees.forEach((emp) => {
              posSheet.addRow({
                unit: unit.name,
                position: pos.title,
                isHead: pos.is_unit_head ? "Evet" : "Hayır",
                employee: `${emp.first_name} ${emp.last_name}`,
              });
            });
          } else {
            posSheet.addRow({
              unit: unit.name,
              position: pos.title,
              isHead: pos.is_unit_head ? "Evet" : "Hayır",
              employee: "(Boş)",
            });
          }
        });
      });
      posSheet.getRow(1).font = { bold: true };
      posSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

      // Download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `organizasyon-semasi-${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Excel export error:", error);
    } finally {
      setIsExportingExcel(false);
    }
  }, [captureFullChart, units]);

  if (units.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Henüz organizasyon verisi bulunmuyor
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Export Buttons */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <Button onClick={handleExportExcel} disabled={isExportingExcel} variant="outline" size="sm">
          {isExportingExcel ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
          Excel
        </Button>
        <Button onClick={handleExportPdf} disabled={isExportingPdf} size="sm">
          {isExportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          PDF
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
    </div>
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

