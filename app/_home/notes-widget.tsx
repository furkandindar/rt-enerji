"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

export function NotesWidget() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
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


  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Notlarım</CardTitle>
          <CardDescription>
            Microsoft To Do · &quot;RT Enerji&quot; listesi
          </CardDescription>
        </div>
        <StickyNote className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Yeni görev..."
            disabled={creating}
            className="h-9"
          />
          <Button
            type="submit"
            size="sm"
            disabled={creating || newTitle.trim() === ""}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-1">Ekle</span>
          </Button>
        </form>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Yükleniyor
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Henüz görev yok
          </div>
        ) : (
          <ScrollArea className="h-64 pr-3">
            <ul className="flex flex-col gap-1">
              {sortedTasks.map((task) => (
                <li
                  key={task.id}
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={task.isCompleted}
                    onCheckedChange={() => void handleToggle(task)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm leading-snug",
                        task.isCompleted &&
                          "text-muted-foreground line-through"
                      )}
                    >
                      {task.title}
                    </p>
                    {task.body && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {task.body}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => void handleDelete(task)}
                    aria-label="Görevi sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
