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
import { CreateUnitTypeSheet } from "./create-unit-type-sheet";

interface UnitType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface UnitTypesTableProps {
  unitTypes: UnitType[];
}

export function UnitTypesTable({ unitTypes }: UnitTypesTableProps) {
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
            <TableHead className="font-semibold w-1/4">Açıklama</TableHead>
            {/* <TableHead className="font-semibold">Sıra</TableHead> */}
            <TableHead className="font-semibold w-1/10">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {unitTypes.map((unitType) => (
            <TableRow key={unitType.id}>
              <TableCell className="sm:pl-4">{unitType.code}</TableCell>
              <TableCell>{unitType.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {unitType.description || "-"}
              </TableCell>
              {/* <TableCell>{unitType.display_order}</TableCell> */}
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={unitType.is_active ? "success" : "destructive"}>
                    {unitType.is_active ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(unitType.id)}
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
        <CreateUnitTypeSheet
          mode="edit"
          unitTypeId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

