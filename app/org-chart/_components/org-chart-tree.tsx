"use client";

import { cn } from "@/lib/utils";
import { Building2, Briefcase, User } from "lucide-react";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string | null;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
  is_unit_head: boolean;
  employees: Employee[];
}

interface UnitNode {
  id: string;
  name: string;
  code: string | null;
  unit_type: string | null;
  positions: Position[];
  children: UnitNode[];
}

interface OrgChartTreeProps {
  data: UnitNode[];
}

function UnitCard({ unit }: { unit: UnitNode }) {
  const headPosition = unit.positions.find((p) => p.is_unit_head);
  const otherPositions = unit.positions.filter((p) => !p.is_unit_head);

  return (
    <div className="flex flex-col items-center">
      {/* Unit Card */}
      <div className="rounded-lg border bg-card p-4 shadow-sm min-w-[200px] max-w-[280px]">
        {/* Unit Header */}
        <div className="flex items-center gap-2 border-b pb-2 mb-2">
          <Building2 className="h-4 w-4 text-primary" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{unit.name}</h3>
            {unit.unit_type && (
              <p className="text-xs text-muted-foreground">{unit.unit_type}</p>
            )}
          </div>
        </div>

        {/* Unit Head Position */}
        {headPosition && (
          <div className="bg-primary/5 rounded-md p-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">{headPosition.title}</span>
            </div>
            {headPosition.employees.length > 0 ? (
              headPosition.employees.map((emp) => (
                <div key={emp.id} className="flex items-center gap-1.5 mt-1 ml-4">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">
                    {emp.first_name} {emp.last_name}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-1.5 mt-1 ml-4">
                <User className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground italic">Boş</span>
              </div>
            )}
          </div>
        )}

        {/* Other Positions */}
        {otherPositions.length > 0 && (
          <div className="space-y-1">
            {otherPositions.slice(0, 3).map((pos) => (
              <div key={pos.id} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{pos.title}</span>
                </div>
                {pos.employees.map((emp) => (
                  <div key={emp.id} className="flex items-center gap-1.5 ml-4">
                    <User className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {emp.first_name} {emp.last_name}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {otherPositions.length > 3 && (
              <p className="text-xs text-muted-foreground text-center">
                +{otherPositions.length - 3} pozisyon daha
              </p>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {unit.children.length > 0 && (
        <>
          {/* Vertical line down from parent */}
          <div className="w-px h-6 bg-border" />

          {/* Children nodes with connecting lines */}
          <div className="flex">
            {unit.children.map((child, index) => {
              const isFirst = index === 0;
              const isLast = index === unit.children.length - 1;
              const isOnly = unit.children.length === 1;

              return (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Horizontal + Vertical connector */}
                  <div className="relative flex w-full h-6">
                    {/* Left horizontal line - extends beyond center */}
                    {!isFirst && (
                      <div className="absolute top-0 right-1/2 left-0 h-px bg-border" />
                    )}
                    {/* Right horizontal line - extends beyond center */}
                    {!isLast && (
                      <div className="absolute top-0 left-1/2 right-0 h-px bg-border" />
                    )}
                    {/* Center vertical line */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-border" />
                  </div>
                  {/* Card with padding */}
                  <div className="px-4">
                    <UnitCard unit={child} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChartTree({ data }: OrgChartTreeProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Henüz organizasyon verisi bulunmuyor
      </div>
    );
  }

  return (
    <div className="overflow-auto p-8">
      <div className="flex flex-col items-center gap-4 min-w-max">
        {data.map((unit) => (
          <UnitCard key={unit.id} unit={unit} />
        ))}
      </div>
    </div>
  );
}

