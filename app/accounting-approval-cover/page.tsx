import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function AccountingApprovalCoverListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "ACCOUNTING_APPROVAL_COVER",
        pageTitle: "Onay Kapağı (Muhasebe)",
        pageDescription: "Muhasebe departmanının tüm onay kapağı taleplerini görüntüleyin",
        newButtonLabel: "Yeni Onay Kapağı",
        newRoute: "/accounting-approval-cover/new",
        apiPath: "/api/accounting-approval-cover",
        // Talep No / Sayı / Hazırlayan / Oluşturulma / Durum / İşlemler
        columns: {
          requesterHeader: "Hazırlayan",
          updatedAt: false,
          documentNo: { header: "Sayı", path: "accounting_request.document_no" },
        },
      }}
    />
  );
}
