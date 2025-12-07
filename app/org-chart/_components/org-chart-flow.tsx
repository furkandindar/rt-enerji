"use client";

import { useMemo, useCallback, useState } from "react";
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
} from "reactflow";
import { toPng } from "html-to-image";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import dagre from "dagre";
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
  const { getNodes } = useReactFlow();
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

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

    return getLayoutedElements(nodes, edges);
  }, [units]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

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
      const isLandscape = width > height;
      const pdf = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
      pdf.save("organizasyon-semasi.pdf");
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

