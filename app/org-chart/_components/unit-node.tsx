"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import { Building2, Briefcase, User } from "lucide-react";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface PositionData {
  id: string;
  title: string;
  is_unit_head: boolean;
  employees: Employee[];
  color: string | null;
}

interface UnitNodeData {
  name: string;
  code: string | null;
  unit_type: string | null;
  positions: PositionData[];
}

function UnitNodeComponent({ data }: { data: UnitNodeData }) {
  const headPosition = data.positions.find((p) => p.is_unit_head);
  const otherPositions = data.positions.filter((p) => !p.is_unit_head);

  return (
    <div className="rounded-lg border bg-card shadow-md min-w-[220px] max-w-[280px]">
      {/* Top Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="bg-primary! w-3! h-3! border-2! border-background!"
      />

      {/* Unit Header */}
      <div className="flex items-center gap-2 p-3 border-b bg-muted/30 rounded-t-lg">
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{data.name}</h3>
          {data.unit_type && (
            <p className="text-xs text-muted-foreground">{data.unit_type}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Unit Head Position */}
        {headPosition && (
          <div
            className="rounded-md p-2 border-l-4"
            style={{
              borderLeftColor: headPosition.color || "hsl(var(--primary))",
              backgroundColor: headPosition.color ? `${headPosition.color}15` : "hsl(var(--primary) / 0.1)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <Briefcase
                className="h-3 w-3"
                style={{ color: headPosition.color || "hsl(var(--primary))" }}
              />
              <span
                className="text-xs font-medium truncate"
                style={{ color: headPosition.color || "hsl(var(--primary))" }}
              >
                {headPosition.title}
              </span>
            </div>
            {headPosition.employees.length > 0 ? (
              headPosition.employees.map((emp) => (
                <div key={emp.id} className="flex items-center gap-1.5 mt-1 ml-4">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs truncate">
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
          <div className="space-y-1.5">
            {otherPositions.slice(0, 3).map((pos) => (
              <div
                key={pos.id}
                className="text-xs rounded p-1.5 border-l-2"
                style={{
                  borderLeftColor: pos.color || "hsl(var(--muted-foreground))",
                  backgroundColor: pos.color ? `${pos.color}10` : "transparent",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Briefcase
                    className="h-3 w-3"
                    style={{ color: pos.color || "hsl(var(--muted-foreground))" }}
                  />
                  <span className="truncate">{pos.title}</span>
                </div>
                {pos.employees.map((emp) => (
                  <div key={emp.id} className="flex items-center gap-1.5 ml-4">
                    <User className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-muted-foreground truncate">
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

        {/* No positions */}
        {data.positions.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center">
            Pozisyon tanımlanmamış
          </p>
        )}
      </div>

      {/* Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="bg-primary! w-3! h-3! border-2! border-background!"
      />
    </div>
  );
}

export const UnitNode = memo(UnitNodeComponent);

