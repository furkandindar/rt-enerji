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
import { PositionSheet } from "./position-sheet";

interface GradeLevel {
  band: number;
  name: string;
}

interface OrganizationalUnit {
  id: string;
  name: string;
  code: string | null;
}

interface PositionType {
  id: string;
  name: string;
  code: string;
  color: string | null;
}

interface ReportsTo {
  id: string;
  title: string;
  job_code: string;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
  level_band: number;
  unit_id: string;
  position_type_id: string | null;
  reports_to_position_id: string | null;
  location: string | null;
  is_unit_head: boolean;
  is_active: boolean;
  order_index: number;
  grade_level: GradeLevel | null;
  organizational_unit: OrganizationalUnit | null;
  position_type: PositionType | null;
  reports_to: ReportsTo | null;
}

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
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
            <TableHead className="font-semibold sm:pl-4">Job Code</TableHead>
            <TableHead className="font-semibold">Başlık</TableHead>
            <TableHead className="font-semibold">Birim</TableHead>
            <TableHead className="font-semibold">Tip</TableHead>
            <TableHead className="font-semibold">Seviye</TableHead>
            <TableHead className="font-semibold">Rapor Verdiği</TableHead>
            <TableHead className="font-semibold">Lokasyon</TableHead>
            <TableHead className="font-semibold">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow key={position.id}>
              <TableCell className="sm:pl-4 font-mono">{position.job_code}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{position.title}</span>
                  {position.is_unit_head && (
                    <Badge variant="outline" className="w-fit mt-1 text-xs">
                      Birim Başkanı
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {position.organizational_unit
                  ? position.organizational_unit.code
                    ? `${position.organizational_unit.code} - ${position.organizational_unit.name}`
                    : position.organizational_unit.name
                  : "-"}
              </TableCell>
              <TableCell>
                {position.position_type ? (
                  <div className="flex items-center gap-2">
                    {position.position_type.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: position.position_type.color }}
                      />
                    )}
                    <span>{position.position_type.name}</span>
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                {position.grade_level
                  ? `${position.grade_level.band} - ${position.grade_level.name}`
                  : "-"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {position.reports_to
                  ? `${position.reports_to.job_code} - ${position.reports_to.title}`
                  : "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {position.location || "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={position.is_active ? "success" : "destructive"}>
                    {position.is_active ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(position.id)}
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
        <PositionSheet
          mode="edit"
          positionId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

