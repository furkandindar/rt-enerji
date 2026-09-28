"use client";

import { Loader2, Lock } from "lucide-react";
import { UserMultiPicker, type UserMultiPickerEmployee } from "@/components/user-multi-picker";
import { MAX_EXTRA_APPROVERS } from "@/lib/workflow/extra-approvers-shared";
import type { LockedExtraApproverView } from "./use-extra-approver-setup";

interface ExtraApproversFieldProps {
  /** Talep sahibinin kendi seçimleri (kilitliler hariç), sıralı */
  value: string[];
  onChange: (ids: string[]) => void;
  candidates: UserMultiPickerEmployee[];
  loadingCandidates: boolean;
  managerStepName: string | null;
  locked: LockedExtraApproverView[];
  /** Seçilemeyecek kişiler (talep sahibinin kendisi) */
  excludeEmployeeIds: string[];
  disabled?: boolean;
}

// Talep formunda opsiyonel "Ek Onaycılar" bölümü (Olur). Seçilenler, kişi
// ekleyebilen adımın (Genel Koordinatör) hemen önünde sırayla onay verir.
// Düzenleme modunda yöneticinin eklediği kişiler kilitli gösterilir: sunucu
// onları her turda zincire ekler, talep sahibi çıkaramaz.
export function ExtraApproversField({
  value,
  onChange,
  candidates,
  loadingCandidates,
  managerStepName,
  locked,
  excludeEmployeeIds,
  disabled = false,
}: ExtraApproversFieldProps) {
  const lockedIds = locked.map((l) => l.employee_id);
  const beforeStep = managerStepName ? `${managerStepName} onayından` : "son onaydan";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Ek Onaycılar (opsiyonel)</p>
        <p className="text-xs text-muted-foreground mt-1">
          Seçtiğiniz kişiler {beforeStep} hemen önce, seçim sırasıyla onay verir. Zincirde zaten yer alan
          kişiler (birim amiri, hukuk vb.) otomatik atlanır. Boş bırakılabilir.
        </p>
      </div>

      {locked.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="flex items-center gap-1.5 font-medium">
            <Lock className="h-3.5 w-3.5" />
            Zincire eklenen zorunlu onaycılar
          </p>
          <p className="mt-1 text-xs opacity-90">
            Bu kişiler sizin seçtiklerinizden sonra, {beforeStep} hemen önce onay verir; listeden çıkarılamaz.
          </p>
          <ul className="mt-2 space-y-1">
            {locked.map((l) => (
              <li key={l.employee_id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{l.employee_name ?? "Bilinmeyen çalışan"}</span>
                {l.added_by_name && (
                  <span className="text-xs opacity-80">— {l.added_by_name} ekledi</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loadingCandidates ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Çalışan listesi yükleniyor…
        </div>
      ) : (
        <UserMultiPicker
          value={value}
          onChange={onChange}
          employees={candidates}
          excludeEmployeeIds={[...excludeEmployeeIds, ...lockedIds]}
          disabled={disabled}
          maxSelected={MAX_EXTRA_APPROVERS}
          placeholder="Ek onaycı ara ve ekle..."
        />
      )}
    </div>
  );
}
