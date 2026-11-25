"use client";

// /users — "Kullanıcılar ve Roller" (users.manage_roles: Admin, Yönetici).
// Rol matrisi DB'den gelir (app_roles + permissions + role_permissions); rol
// değişikliği PATCH /api/admin/users/[id]/role → public.set_user_role() (gerekçe +
// denetim kaydı). Müdür elle atanmaz: aktif birim amiri pozisyonundan türetilir.
// Atanabilir roller / değiştirilebilir kullanıcılar API'den gelir (roles[].assignable,
// users[].can_change): kişi kendi izinlerini aşan rolü veremez, öyle bir rolü değiştiremez.
// SQL: sql/feature_roles_1_permissions.sql, sql/feature_roles_2_unit_manager_scope.sql,
//      sql/feature_roles_3_role_matrix_v2.sql
//
// Yerleşim: TableCell varsayılanı whitespace-nowrap'tir ve ana içerik alanı en geniş
// satıra göre genişler. Uzun metin taşıyan hücreler (açıklama, pozisyon, e-posta,
// gerekçe) bilinçli olarak satır kaydırır (WRAP) — aksi halde sayfa ekrandan taşar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Minus, Search, ShieldCheck, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatTrDateTime } from "@/lib/timezone";

interface RoleDef {
  code: string;
  label: string;
  description: string;
  is_member: boolean;
  /** Gizli rol (Süper Admin): yalnız sistem hesabına döner; atanamaz, matriste yok. */
  is_hidden: boolean;
  sort_order: number;
  /** Görüntüleyen bu rolü atayabilir mi (izinleri görüntüleyeninkilerin alt kümesi). */
  assignable: boolean;
}
interface PermissionDef {
  code: string;
  label: string;
  description: string;
  category: string;
  sort_order: number;
}
interface UserRow {
  id: string;
  email: string | null;
  role: string;
  employee_name: string | null;
  employee_status: string | null;
  positions: { title: string; unit_name: string | null; is_unit_head: boolean }[];
  is_unit_manager: boolean;
  is_self: boolean;
  /** Görüntüleyen bu kişinin rolünü değiştirebilir mi (kendisi / gizli / daha yetkili değil). */
  can_change: boolean;
}
interface RoleChange {
  id: string;
  user_email: string | null;
  old_role: string | null;
  new_role: string;
  changed_by_email: string | null;
  reason: string | null;
  changed_at: string;
}
interface UsersPayload {
  users: UserRow[];
  roles: RoleDef[];
  permissions: PermissionDef[];
  role_permissions: { role: string; permission: string }[];
  changes: RoleChange[];
}

// Uzun metin hücreleri: satır kaydır, uzun e-posta/kelimeyi böl.
const WRAP = "whitespace-normal [overflow-wrap:anywhere]";

const ROLE_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ORG_ADMIN: "default",
  ORG_MANAGER: "secondary",
  ORG_IT: "secondary",
  ORG_VIEWER: "outline",
  NONE: "destructive",
};

export default function UsersPage() {
  const [data, setData] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [pending, setPending] = useState<{ user: UserRow; role: string } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/users");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Kullanıcılar yüklenemedi");
        return;
      }
      setData(body as UsersPayload);
    } catch {
      setError("Kullanıcılar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const roleLabel = useCallback(
    (code: string | null) => data?.roles.find((r) => r.code === code)?.label ?? code ?? "-",
    [data]
  );

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLocaleLowerCase("tr");
    return data.users.filter((u) => {
      if (roleFilter === "UNIT_MANAGER" ? !u.is_unit_manager : roleFilter !== "all" && u.role !== roleFilter) {
        return false;
      }
      if (!q) return true;
      return [u.employee_name, u.email, ...u.positions.map((p) => p.title)]
        .filter(Boolean)
        .some((v) => v!.toLocaleLowerCase("tr").includes(q));
    });
  }, [data, query, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of data?.users ?? []) counts[u.role] = (counts[u.role] ?? 0) + 1;
    return counts;
  }, [data]);
  const unitManagerCount = useMemo(() => (data?.users ?? []).filter((u) => u.is_unit_manager).length, [data]);

  const matrix = useMemo(() => {
    if (!data) return { categories: [] as { name: string; perms: PermissionDef[] }[], has: () => false };
    const set = new Set(data.role_permissions.map((rp) => `${rp.role}|${rp.permission}`));
    const categories: { name: string; perms: PermissionDef[] }[] = [];
    for (const p of data.permissions) {
      let cat = categories.find((c) => c.name === p.category);
      if (!cat) categories.push((cat = { name: p.category, perms: [] }));
      cat.perms.push(p);
    }
    return { categories, has: (role: string, perm: string) => set.has(`${role}|${perm}`) };
  }, [data]);

  // Gizli rol (Süper Admin) matriste, kartlarda ve rol seçeneklerinde yer almaz.
  const visibleRoles = (data?.roles ?? []).filter((r) => !r.is_hidden);
  const assignableRoles = visibleRoles.filter((r) => r.assignable);
  const matrixRoles = visibleRoles.filter((r) => r.is_member);

  const confirmChange = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${pending.user.id}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: pending.role, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Rol değiştirilemedi");
        return;
      }
      toast.success(`${pending.user.employee_name || pending.user.email}: ${roleLabel(pending.role)}`);
      setPending(null);
      setReason("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kullanıcılar ve Roller</h1>
        <p className="text-muted-foreground">
          Kullanıcıların sistem rolünü atayın. Müdür rolü birim amiri pozisyonundan otomatik gelir.
        </p>
      </div>

      {/* Rol özeti */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {matrixRoles.map((r) => (
          <Card key={r.code}>
            <CardHeader className="pb-2">
              <CardDescription>{r.label}</CardDescription>
              <CardTitle className="text-2xl">{roleCounts[r.code] ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{r.description}</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Müdür (otomatik)</CardDescription>
            <CardTitle className="text-2xl">{unitManagerCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Aktif birim amiri pozisyonu olanlar. Birimi ve alt birimlerindeki talepleri salt okunur görür.
          </CardContent>
        </Card>
      </div>

      {/* Rol / yetki matrisi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Roller ve Yetkiler
          </CardTitle>
          <CardDescription>
            İçerik kısıtlı süreçler (İşe Giriş / İşten Çıkış Onay) rolden bağımsızdır: içeriği yalnız İK ve
            Genel Müdür görür.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Yetki</TableHead>
                {matrixRoles.map((r) => (
                  <TableHead key={r.code} className="text-center">
                    {r.label}
                  </TableHead>
                ))}
                <TableHead className="text-center">Müdür</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className={`${WRAP} min-w-[14rem]`}>
                  <div className="font-medium">Kendi talepleri ve sırası gelen onaylar</div>
                </TableCell>
                {matrixRoles.map((r) => (
                  <TableCell key={r.code} className="text-center">
                    <Check className="mx-auto h-4 w-4 text-success" />
                  </TableCell>
                ))}
                <TableCell className="text-center">
                  <Check className="mx-auto h-4 w-4 text-success" />
                </TableCell>
              </TableRow>
              {matrix.categories.map((cat) =>
                cat.perms.map((p, idx) => (
                  <TableRow key={p.code}>
                    <TableCell className={`${WRAP} min-w-[14rem]`}>
                      {idx === 0 && (
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {cat.name}
                        </div>
                      )}
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </TableCell>
                    {matrixRoles.map((r) => (
                      <TableCell key={r.code} className="text-center">
                        {matrix.has(r.code, p.code) ? (
                          <Check className="mx-auto h-4 w-4 text-success" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      {/* Müdür'ün tek yetkisi birim kapsamıdır — alt birimler dahil, salt okunur. */}
                      {p.code === "requests.view_unit" ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Check className="h-4 w-4 text-success" />
                          <span className="text-[10px] text-muted-foreground">alt birimler dahil</span>
                        </div>
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Kullanıcılar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersRound className="h-4 w-4" /> Kullanıcılar
          </CardTitle>
          <CardDescription>
            Rol değişikliği gerekçesiyle kayda geçer. Kendi rolünüzü ve sizden daha yetkili rolleri
            değiştiremezsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ad, e-posta veya pozisyon ara"
                className="pl-8"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Roller</SelectItem>
                {visibleRoles.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
                <SelectItem value="UNIT_MANAGER">Müdür (birim amiri)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{filteredUsers.length} kullanıcı</span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad Soyad</TableHead>
                  <TableHead>Pozisyon</TableHead>
                  <TableHead className="w-[200px]">Rol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className={`${WRAP} min-w-[10rem]`}>
                      <div className="font-medium">{u.employee_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className={`${WRAP} min-w-[12rem]`}>
                      {u.positions.length === 0 ? (
                        <span className="text-sm text-muted-foreground">Pozisyon yok</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {u.positions.map((p, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1 text-sm">
                              <span>{p.title}</span>
                              {p.unit_name && (
                                <span className="text-xs text-muted-foreground">· {p.unit_name}</span>
                              )}
                              {p.is_unit_head && (
                                <Badge variant="outline" className="text-[10px]">
                                  Müdür
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!u.can_change ? (
                        <Badge variant={ROLE_BADGE[u.role] ?? "outline"}>
                          {roleLabel(u.role)}
                          {u.is_self ? " (siz)" : ""}
                        </Badge>
                      ) : (
                        <Select
                          value={u.role}
                          onValueChange={(role) => {
                            if (role !== u.role) {
                              setReason("");
                              setPending({ user: u, role });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {assignableRoles.map((r) => (
                              <SelectItem key={r.code} value={r.code}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Son rol değişiklikleri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Son Rol Değişiklikleri</CardTitle>
        </CardHeader>
        <CardContent>
          {data.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>Değişiklik</TableHead>
                    <TableHead>Yapan</TableHead>
                    <TableHead>Gerekçe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.changes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatTrDateTime(c.changed_at)}</TableCell>
                      <TableCell className={`${WRAP} min-w-[10rem] text-sm`}>{c.user_email || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {roleLabel(c.old_role)} → <span className="font-medium">{roleLabel(c.new_role)}</span>
                      </TableCell>
                      <TableCell className={`${WRAP} min-w-[8rem] text-sm`}>{c.changed_by_email || "Sistem"}</TableCell>
                      <TableCell className={`${WRAP} min-w-[14rem] text-sm text-muted-foreground`}>
                        {c.reason || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pending} onOpenChange={(open) => !open && !saving && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rol değişikliği</DialogTitle>
            <DialogDescription>
              {pending && (
                <>
                  <span className="font-medium">{pending.user.employee_name || pending.user.email}</span>:{" "}
                  {roleLabel(pending.user.role)} → <span className="font-medium">{roleLabel(pending.role)}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {pending && (
            <p className="text-sm text-muted-foreground">
              {data.roles.find((r) => r.code === pending.role)?.description}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="role-reason">Gerekçe</Label>
            <Textarea
              id="role-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Örn. Genel Müdür talimatı, görev değişikliği"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={saving}>
              Vazgeç
            </Button>
            <Button onClick={confirmChange} disabled={saving || !reason.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
