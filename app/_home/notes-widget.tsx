"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { CountBadge, WidgetHeader } from "./widget-header";

interface TodoTask {
  id: string;
  title: string;
  body: string | null;
  status:
    | "notStarted"
    | "inProgress"
    | "completed"
    | "waitingOnOthers"
    | "deferred";
  isCompleted: boolean;
  createdAtUtc: string;
  lastModifiedUtc: string;
}

const TODO_URL = "https://to-do.office.com/tasks/";

export function NotesWidget({ className }: { className?: string }) {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const pendingIds = useRef<Set<string>>(new Set());

  const fetchTasks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/todo/tasks", { signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 412 && data?.error === "reauth_required") {
          throw new Error("Microsoft hesabı bağlı değil. Çıkış yapıp tekrar girin.");
        }
        if (res.status === 412 && data?.error === "reconsent_required") {
          throw new Error("Oturum yenilenmeli. Çıkış yapıp tekrar girin.");
        }
        throw new Error(data?.message ?? `Hata: ${res.status}`);
      }
      setTasks((data?.tasks ?? []) as TodoTask[]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchTasks(controller.signal);
    return () => controller.abort();
  }, [fetchTasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      return b.createdAtUtc.localeCompare(a.createdAtUtc);
    });
  }, [tasks]);

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/todo/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? `Hata: ${res.status}`);
      }
      const task = data?.task as TodoTask;
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Görev eklenemedi");
    } finally {
      setCreating(false);
    }
  }, [newTitle, creating]);

  const handleToggle = useCallback(async (task: TodoTask) => {
    if (pendingIds.current.has(task.id)) return;
    pendingIds.current.add(task.id);

    const nextStatus = task.isCompleted ? "notStarted" : "completed";
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: nextStatus, isCompleted: nextStatus === "completed" }
          : t
      )
    );

    try {
      const res = await fetch(`/api/todo/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? `Hata: ${res.status}`);
      }
      const updated = data?.task as TodoTask;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: unknown) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.error(err instanceof Error ? err.message : "Görev güncellenemedi");
    } finally {
      pendingIds.current.delete(task.id);
    }
  }, []);

  const handleDelete = useCallback(async (task: TodoTask) => {
    if (pendingIds.current.has(task.id)) return;
    pendingIds.current.add(task.id);

    let previous: TodoTask[] = [];
    setTasks((prev) => {
      previous = prev;
      return prev.filter((t) => t.id !== task.id);
    });

    try {
      const res = await fetch(`/api/todo/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? `Hata: ${res.status}`);
      }
    } catch (err: unknown) {
      setTasks(previous);
      toast.error(err instanceof Error ? err.message : "Görev silinemedi");
    } finally {
      pendingIds.current.delete(task.id);
    }
  }, []);


  const openTasks = sortedTasks.filter((t) => !t.isCompleted);
  const completedTasks = sortedTasks.filter((t) => t.isCompleted);

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <WidgetHeader
        icon={StickyNote}
        title="Notlarım"
        badge={!loading && openTasks.length > 0 ? <CountBadge value={openTasks.length} /> : null}
        action={
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs text-muted-foreground">
            <a href={TODO_URL} target="_blank" rel="noopener noreferrer" title={`Microsoft To Do'da aç ("RT Enerji" listesi)`}>
              To Do
              <ExternalLink className="size-3" />
            </a>
          </Button>
        }
      />

      {/* To Do'daki gibi satır içi ekleme: Enter ile kaydeder. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
        className="flex items-center gap-2 border-b px-4 transition-colors focus-within:bg-muted/40"
      >
        {creating ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Plus className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Görev ekle…"
          aria-label="Yeni görev"
          disabled={creating}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        {newTitle.trim() !== "" && (
          <Button type="submit" size="sm" className="h-7 px-2.5 text-xs" disabled={creating}>
            Ekle
          </Button>
        )}
      </form>

      {/* Yan kolondayken (@4xl) takvimin yanındaki kalan boşluğu doldurur; h-0 + grow
          + min-h: görev sayısı ne olursa olsun sağ kolonu (dolayısıyla sayfayı) uzatmaz. */}
      <div className="max-h-72 overflow-y-auto px-2 py-1.5 @4xl/page:h-0 @4xl/page:max-h-none @4xl/page:min-h-48 @4xl/page:grow">
        {error ? (
          <div className="m-2 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-3 px-2 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-3.5 flex-1" />
              </div>
            ))}
          </div>
        ) : sortedTasks.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Henüz görev yok.</p>
        ) : (
          <>
            {openTasks.length === 0 ? (
              <p className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" />
                Tüm görevler tamamlandı.
              </p>
            ) : (
              <ul className="flex flex-col">
                {openTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </ul>
            )}

            {completedTasks.length > 0 && (
              <div className="mt-1 border-t px-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  aria-expanded={showCompleted}
                  className="flex items-center gap-1 rounded-sm py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <ChevronRight
                    className={cn("size-3.5 transition-transform", showCompleted && "rotate-90")}
                  />
                  Tamamlananlar ({completedTasks.length})
                </button>
                {showCompleted && (
                  <ul className="-mx-2 flex flex-col">
                    {completedTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: TodoTask;
  onToggle: (task: TodoTask) => Promise<void>;
  onDelete: (task: TodoTask) => Promise<void>;
}) {
  const inputId = `task-${task.id}`;

  return (
    <li className="group flex items-start gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/50">
      <Checkbox
        id={inputId}
        checked={task.isCompleted}
        onCheckedChange={() => void onToggle(task)}
        className="mt-1.5"
      />
      {/* Metne dokunmak da işaretler — dokunmatikte küçük kutuyu hedeflemek zor. */}
      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer py-1">
        <span
          className={cn(
            "block break-words text-sm leading-snug",
            task.isCompleted && "text-muted-foreground line-through"
          )}
        >
          {task.title}
        </span>
        {task.body && (
          <span className="line-clamp-1 text-xs text-muted-foreground">{task.body}</span>
        )}
      </label>
      {/* Fare olan cihazda hover'da belirir; dokunmatikte (hover yok) hep görünür. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 text-muted-foreground hover:text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
        onClick={() => void onDelete(task)}
        aria-label="Görevi sil"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}
