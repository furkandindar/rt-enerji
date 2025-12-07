"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export function ExportPdfButton() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      // Get the React Flow viewport element
      const flowElement = document.querySelector(".react-flow") as HTMLElement;
      if (!flowElement) {
        console.error("React Flow element not found");
        return;
      }

      // Get the viewport for proper dimensions
      const viewportElement = document.querySelector(".react-flow__viewport") as HTMLElement;
      if (!viewportElement) {
        console.error("React Flow viewport not found");
        return;
      }

      // Create image from the flow
      const dataUrl = await toPng(flowElement, {
        backgroundColor: "#ffffff",
        quality: 1,
        pixelRatio: 2,
        filter: (node) => {
          // Exclude controls, minimap, and attribution from export
          if (node.classList) {
            return (
              !node.classList.contains("react-flow__controls") &&
              !node.classList.contains("react-flow__minimap") &&
              !node.classList.contains("react-flow__attribution")
            );
          }
          return true;
        },
      });

      // Get image dimensions
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const width = img.width;
      const height = img.height;

      // Create PDF (landscape if wider than tall)
      const isLandscape = width > height;
      const pdf = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "px",
        format: [width / 2, height / 2], // Divide by pixelRatio
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, width / 2, height / 2);
      pdf.save("organizasyon-semasi.pdf");
    } catch (error) {
      console.error("PDF export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button onClick={handleExportPDF} disabled={isExporting} size="sm">
      {isExporting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-2" />
      )}
      PDF İndir
    </Button>
  );
}

