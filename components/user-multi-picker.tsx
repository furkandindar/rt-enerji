"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface UserMultiPickerEmployee {
  id: string;
  first_name: string;
  last_name: string;
  employee_no?: string | null;
}

interface UserMultiPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  employees: UserMultiPickerEmployee[];
  excludeEmployeeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function UserMultiPicker({
  value,
  onChange,
  employees,
  excludeEmployeeIds = [],
  placeholder = "Kişi ara ve ekle...",
  disabled = false,
  className,
}: UserMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const employeeMap = useMemo(() => {
    const map = new Map<string, UserMultiPickerEmployee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const excludedSet = useMemo(
    () => new Set([...value, ...excludeEmployeeIds]),
    [value, excludeEmployeeIds],
  );

  const availableEmployees = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return employees
      .filter((e) => !excludedSet.has(e.id))
      .filter((e) => {
        if (!q) return true;
        const full = `${e.first_name} ${e.last_name}`.toLocaleLowerCase("tr-TR");
        const no = (e.employee_no || "").toLocaleLowerCase("tr-TR");
        return full.includes(q) || no.includes(q);
      })
      .sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(
          `${b.first_name} ${b.last_name}`,
          "tr-TR",
        ),
      );
  }, [employees, excludedSet, search]);

  const addEmployee = (id: string) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setSearch("");
  };

  const removeEmployee = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  const moveEmployee = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((id, index) => {
            const emp = employeeMap.get(id);
            const name = emp ? `${emp.first_name} ${emp.last_name}` : "Bilinmeyen kullanıcı";
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm"
              >
                <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                <span className="flex-1 truncate">{name}</span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6"
                    disabled={disabled || index === 0}
                    onClick={() => moveEmployee(index, -1)}
                    aria-label="Yukarı taşı"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6"
                    disabled={disabled || index === value.length - 1}
                    onClick={() => moveEmployee(index, 1)}
                    aria-label="Aşağı taşı"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => removeEmployee(id)}
                    aria-label="Kaldır"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full justify-start text-muted-foreground font-normal"
          >
            <Plus className="mr-2 h-4 w-4" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim veya sicil no..."
              className="h-7 border-0 p-0 shadow-none focus-visible:ring-0"
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-56">
            {availableEmployees.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search ? "Eşleşen kişi yok" : "Eklenebilecek kişi kalmadı"}
              </p>
            ) : (
              <ul className="py-1">
                {availableEmployees.map((emp) => (
                  <li key={emp.id}>
                    <button
                      type="button"
                      onClick={() => addEmployee(emp.id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{emp.first_name} {emp.last_name}</span>
                      {emp.employee_no && (
                        <span className="text-xs text-muted-foreground shrink-0">#{emp.employee_no}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
