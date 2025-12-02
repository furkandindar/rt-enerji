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
import { PositionAssignmentSheet } from "./position-assignment-sheet";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface PositionAssignment {
  id: string;
  employee_id: string;
  position_id: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    employee_no: string | null;
  } | null;
  position: {
    id: string;
    title: string;
    job_code: string;
  } | null;
}

interface PositionAssignmentsTableProps {
  assignments: PositionAssignment[];
}

const isActiveAssignment = (endDate: string | null): boolean => {
  if (!endDate) return true;
  return new Date(endDate) >= new Date();
};

export function PositionAssignmentsTable({ assignments }: PositionAssignmentsTableProps) {
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
            <TableHead className="font-semibold sm:pl-4">Çalışan</TableHead>
            <TableHead className="font-semibold">Pozisyon</TableHead>
            <TableHead className="font-semibold">Başlangıç</TableHead>
            <TableHead className="font-semibold">Bitiş</TableHead>
            <TableHead className="font-semibold">Birincil</TableHead>
            <TableHead className="font-semibold">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((assignment) => (
            <TableRow key={assignment.id}>
              <TableCell className="sm:pl-4">
                {assignment.employee ? (
                  <div>
                    <div className="font-medium">
                      {assignment.employee.first_name} {assignment.employee.last_name}
                    </div>
                    {assignment.employee.employee_no && (
                      <div className="text-sm text-muted-foreground font-mono">
                        {assignment.employee.employee_no}
                      </div>
                    )}
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                {assignment.position ? (
                  <div>
                    <div className="font-medium">{assignment.position.title}</div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {assignment.position.job_code}
                    </div>
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(assignment.start_date), "dd MMM yyyy", { locale: tr })}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {assignment.end_date
                  ? format(new Date(assignment.end_date), "dd MMM yyyy", { locale: tr })
                  : "-"}
              </TableCell>
              <TableCell>
                {assignment.is_primary ? (
                  <Badge variant="outline">Evet</Badge>
                ) : (
                  <span className="text-muted-foreground">Hayır</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={isActiveAssignment(assignment.end_date) ? "success" : "destructive"}>
                    {isActiveAssignment(assignment.end_date) ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(assignment.id)}
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
        <PositionAssignmentSheet
          mode="edit"
          assignmentId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

