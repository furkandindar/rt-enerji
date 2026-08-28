import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function FinanceApprovalCoverListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "FINANCE_APPROVAL_COVER",
        pageTitle: "Onay Kapağı (Finans)",
        pageDescription: "Finans departmanının tüm onay kapağı taleplerini görüntüleyin",
        newButtonLabel: "Yeni Onay Kapağı",
        newRoute: "/finance-approval-cover/new",
        apiPath: "/api/finance-approval-cover",
        // Talep No / Sayı / Oluşturulma / Durum / İşlemler
        columns: {
          requester: false,
          updatedAt: false,
          documentNo: { header: "Sayı", path: "finance_request.document_no" },
        },
      }}
    />
  );
}
