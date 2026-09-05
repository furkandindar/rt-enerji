"use client";

// Vekalet tanımlama formu (Faz B / B3).
// mode="self": kişi kendi adına vekil tanımlar (profil sayfası).
// mode="admin": ORG_ADMIN herkes adına tanımlar (Vekaletler sayfası).
// Kapsam (karar 8): bu aşamada yalnız Finans Onay Kapağı — süreç seçici yok,
// bilgi metni var; /api/delegations/options tek süreç döner.

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUser } from "@/lib/contexts/user-context";
import { istanbulInputToTimestamptz, utcToIstanbulInput } from "@/lib/timezone";

const formSchema = z
  .object({
    delegator_employee_id: z.string().optional(),
    delegate_employee_id: z.string().min(1, "Vekil seçimi zorunludur"),
    workflow_code: z.string().min(1),
    starts_at: z.string().min(1, "Başlangıç zorunludur"),
    ends_at: z.string().min(1, "Bitiş zorunludur"),
    reason: z.string().max(500, "En fazla 500 karakter").optional(),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "Bitiş, başlangıçtan sonra olmalıdır",
    path: ["ends_at"],
  })
  .refine((v) => !v.delegator_employee_id || v.delegator_employee_id !== v.delegate_employee_id, {
    message: "Kişi kendisini vekil olarak seçemez",
    path: ["delegate_employee_id"],
  });

type FormValues = z.infer<typeof formSchema>;

interface OptionEmployee {
  id: string;
  first_name: string;
  last_name: string;
  position_title: string | null;
}

interface OptionWorkflow {
  id: string;
  code: string;
  name: string;
}

interface DelegationSheetProps {
  mode: "self" | "admin";
  trigger: React.ReactNode;
  onCreated?: () => void;
}

function defaultRange(): { starts_at: string; ends_at: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { starts_at: utcToIstanbulInput(start), ends_at: utcToIstanbulInput(end) };
}

export function DelegationSheet({ mode, trigger, onCreated }: DelegationSheetProps) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<OptionEmployee[]>([]);
  const [workflows, setWorkflows] = useState<OptionWorkflow[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      delegator_employee_id: "",
      delegate_employee_id: "",
      workflow_code: "",
      reason: "",
      ...defaultRange(),
    },
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoadingOptions(true);
    fetch("/api/delegations/options")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const emps: OptionEmployee[] = data.employees || [];
        const wfs: OptionWorkflow[] = data.workflows || [];
        setEmployees(emps);
        setWorkflows(wfs);
        if (wfs[0]) form.setValue("workflow_code", wfs[0].code);
      })
      .catch((err) => {
        console.error("[delegation-sheet] options failed:", err);
        toast.error("Seçenekler yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Admin modunda "adına" listesi: adaylar + kendisi (options kendisini hariç tutar)
  const delegatorOptions = useMemo<OptionEmployee[]>(() => {
    if (mode !== "admin") return [];
    const self: OptionEmployee[] =
      user?.employeeId && user.name
        ? [
            {
              id: user.employeeId,
              first_name: user.name,
              last_name: "",
              position_title: null,
            },
          ]
        : [];
    return [...self, ...employees].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "tr")
    );
  }, [mode, employees, user]);

  const selectedDelegator = form.watch("delegator_employee_id");
  const delegateOptions = useMemo(() => {
    const excludeId = mode === "admin" ? selectedDelegator : user?.employeeId;
    return employees.filter((e) => e.id !== excludeId);
  }, [employees, mode, selectedDelegator, user?.employeeId]);

  const workflowName = workflows[0]?.name ?? "Finans Onay Kapağı";

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delegator_employee_id:
            mode === "admin" && values.delegator_employee_id ? values.delegator_employee_id : undefined,
          delegate_employee_id: values.delegate_employee_id,
          workflow_code: values.workflow_code,
          starts_at: istanbulInputToTimestamptz(values.starts_at),
          ends_at: istanbulInputToTimestamptz(values.ends_at),
          reason: values.reason?.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Vekalet kaydedilemedi");
      }
      toast.success("Vekalet tanımlandı");
      setOpen(false);
      form.reset({
        delegator_employee_id: "",
        delegate_employee_id: "",
        workflow_code: values.workflow_code,
        reason: "",
        ...defaultRange(),
      });
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vekalet kaydedilemedi");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Vekalet Tanımla</SheetTitle>
          <SheetDescription>
            {mode === "admin"
              ? "Seçilen kişi adına, belirtilen tarih aralığında vekil tanımlayın."
              : "İzinli olduğunuz dönemde onaylarınızı sizin adınıza kim işleyecek?"}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pb-4">
            {mode === "admin" && (
              <FormField
                control={form.control}
                name="delegator_employee_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adına (vekalet veren)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={isLoadingOptions}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kişi seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {delegatorOptions.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.first_name} {e.last_name}
                            {e.position_title ? ` — ${e.position_title}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="delegate_employee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vekil</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={isLoadingOptions}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingOptions ? "Yükleniyor..." : "Vekil seçin"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {delegateOptions.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
                          {e.position_title ? ` — ${e.position_title}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Yalnız uygulama hesabı olan aktif çalışanlar listelenir.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Kapsam: {workflowName}</p>
              <p className="text-muted-foreground">
                Vekil, bu süreçte sizin adınıza onay verebilir, revize isteyebilir ve YKB imzalı taramayı
                yükleyebilir. Diğer süreçler bu aşamada vekalete kapalıdır.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="starts_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Başlangıç</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ends_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bitiş</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gerekçe (isteğe bağlı)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Örn. yıllık izin" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="px-0">
              <Button type="submit" disabled={isSubmitting || isLoadingOptions}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Kaydet
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
