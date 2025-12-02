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
import { EmployeeSheet } from "./employee-sheet";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
}

interface EmployeesTableProps {
  employees: Employee[];
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "ACTIVE":
      return <Badge variant="success">Aktif</Badge>;
    case "INACTIVE":
      return <Badge variant="destructive">Pasif</Badge>;
    default:
      return <Badge variant="destructive">{status}</Badge>;
  }
};

export function EmployeesTable({ employees }: EmployeesTableProps) {
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
            <TableHead className="font-semibold sm:pl-4">Sicil No</TableHead>
            <TableHead className="font-semibold">Ad Soyad</TableHead>
            <TableHead className="font-semibold">Email</TableHead>
            <TableHead className="font-semibold">Telefon</TableHead>
            <TableHead className="font-semibold">İşe Giriş</TableHead>
            <TableHead className="font-semibold">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id}>
              <TableCell className="sm:pl-4 font-mono">
                {employee.employee_no || "-"}
              </TableCell>
              <TableCell>
                {employee.first_name} {employee.last_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {employee.email || "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {employee.phone || "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {employee.hire_date
                  ? format(new Date(employee.hire_date), "dd MMM yyyy", { locale: tr })
                  : "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getStatusBadge(employee.status)}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(employee.id)}
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
        <EmployeeSheet
          mode="edit"
          employeeId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}

