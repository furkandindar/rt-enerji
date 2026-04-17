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
import { CompanySheet } from "./company-sheet";

interface Company {
  id: string;
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface CompaniesTableProps {
  companies: Company[];
}

export function CompaniesTable({ companies }: CompaniesTableProps) {
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
            <TableHead className="font-semibold w-1/3 sm:pl-4">Kod</TableHead>
            <TableHead className="font-semibold w-1/2">Ad</TableHead>
            {/* <TableHead className="font-semibold">Sıra</TableHead> */}
            <TableHead className="font-semibold w-1/10">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell className="sm:pl-4">{company.code}</TableCell>
              <TableCell>{company.name}</TableCell>
              {/* <TableCell>{company.display_order}</TableCell> */}
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={company.is_active ? "success" : "destructive"}>
                    {company.is_active ? "Aktif" : "Pasif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditClick(company.id)}
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
        <CompanySheet
          mode="edit"
          companyId={selectedId}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      )}
    </>
  );
}
