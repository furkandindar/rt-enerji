"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SquarePen } from "lucide-react";
import { GradeLevelSheet } from "./grade-level-sheet";

interface GradeLevel {
  band: number;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface GradeLevelsTableProps {
  gradeLevels: GradeLevel[];
}

export function GradeLevelsTable({ gradeLevels }: GradeLevelsTableProps) {
  const [selectedBand, setSelectedBand] = useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleEditClick = (band: number) => {
    setSelectedBand(band);
    setIsEditOpen(true);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-semibold w-1/4 sm:pl-4">Seviye</TableHead>
            <TableHead className="font-semibold w-1/4">Ad</TableHead>
            <TableHead className="font-semibold w-1/4">Açıklama</TableHead>
            <TableHead className="font-semibold w-1/10">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {gradeLevels.map((gradeLevel) => (
            <TableRow key={gradeLevel.band}>
              <TableCell className="sm:pl-4">{gradeLevel.band}</TableCell>
              <TableCell>{gradeLevel.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {gradeLevel.description || "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={gradeLevel.is_active ? "success" : "destructive"}>
                    {gradeLevel.is_active ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(gradeLevel.band)}
                  >
                    <SquarePen className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedBand !== null && (
        <GradeLevelSheet
          mode="edit"
          gradeLevelBand={selectedBand}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

