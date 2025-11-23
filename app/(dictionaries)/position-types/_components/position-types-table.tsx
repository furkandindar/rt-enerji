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
import { PositionTypeSheet } from "./position-type-sheet";

interface PositionType {
  id: string;
  code: string;
  name: string;
  color: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface PositionTypesTableProps {
  positionTypes: PositionType[];
}

export function PositionTypesTable({ positionTypes }: PositionTypesTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleEditClick = (id: string) => {
    setSelectedId(id);
    setIsEditOpen(true);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-semibold w-1/4 sm:pl-4">Kod</TableHead>
            <TableHead className="font-semibold w-1/4">Ad</TableHead>
            <TableHead className="font-semibold w-1/6">Renk</TableHead>
            <TableHead className="font-semibold w-1/4">Açıklama</TableHead>
            <TableHead className="font-semibold w-1/10">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positionTypes.map((positionType) => (
            <TableRow key={positionType.id}>
              <TableCell className="sm:pl-4">{positionType.code}</TableCell>
              <TableCell>{positionType.name}</TableCell>
              <TableCell>
                {positionType.color ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded border"
                      style={{ backgroundColor: positionType.color }}
                    />
                    <span className="text-xs text-muted-foreground font-mono">
                      {positionType.color}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {positionType.description || "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={positionType.is_active ? "success" : "destructive"}>
                    {positionType.is_active ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(positionType.id)}
                  >
                    <SquarePen className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedId && (
        <PositionTypeSheet
          mode="edit"
          positionTypeId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

