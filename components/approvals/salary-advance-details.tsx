"use client";

import type { PendingApproval } from "@/lib/approvals/types";

interface SalaryAdvanceDetailsProps {
  approval: PendingApproval;
}

export function SalaryAdvanceDetails({ approval }: SalaryAdvanceDetailsProps) {
  const salary = approval.request.salary_advance_request;
  if (!salary) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Avans Miktarı</p>
          <p className="text-sm font-semibold">
            {salary.amount.toLocaleString('tr-TR')} TL
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ödeme Şekli</p>
          <p className="text-sm font-semibold">
            {salary.payment_method === 'CASH' ? 'Nakit' : 'Banka Havalesi'}
          </p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Maaş Kesinti Muvafakatı</p>
        <p className="text-sm font-semibold">
          {salary.salary_deduction_consent ? 'Onaylandı' : 'Onaylanmadı'}
        </p>
      </div>
    </>
  );
}

