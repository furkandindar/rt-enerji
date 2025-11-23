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
import { OrganizationalUnitSheet } from "./organizational-unit-sheet";

interface UnitType {
  id: string;
  name: string;
  code: string;
}

interface ParentUnit {
  id: string;
  name: string;
  code: string | null;
}

interface OrganizationalUnit {
  id: string;
  code: string | null;
  name: string;
  unit_type: UnitType;
  parent: ParentUnit | null;
  description: string | null;
  order_index: number;
  is_active: boolean;
}

interface OrganizationalUnitsTableProps {
  organizationalUnits: OrganizationalUnit[];
}

export function OrganizationalUnitsTable({ organizationalUnits }: OrganizationalUnitsTableProps) {
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
            <TableHead className="font-semibold w-1/6 sm:pl-4">Kod</TableHead>
            <TableHead className="font-semibold w-1/5">Ad</TableHead>
            <TableHead className="font-semibold w-1/5">Birim Tipi</TableHead>
            <TableHead className="font-semibold w-1/5">Üst Birim</TableHead>
            <TableHead className="font-semibold w-1/4">Açıklama</TableHead>
            <TableHead className="font-semibold w-1/10">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizationalUnits.map((unit) => (
            <TableRow key={unit.id}>
              <TableCell className="sm:pl-4">{unit.code || "-"}</TableCell>
              <TableCell>{unit.name}</TableCell>
              <TableCell>{unit.unit_type?.name || "-"}</TableCell>
              <TableCell className="text-muted-foreground">
                {unit.parent
                  ? unit.parent.code
                    ? `${unit.parent.code} - ${unit.parent.name}`
                    : unit.parent.name
                  : "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {unit.description || "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={unit.is_active ? "success" : "destructive"}>
                    {unit.is_active ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(unit.id)}
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
        <OrganizationalUnitSheet
          mode="edit"
          organizationalUnitId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

