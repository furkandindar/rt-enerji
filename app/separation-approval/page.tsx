import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function SeparationApprovalListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "EMPLOYEE_SEPARATION_APPROVAL",
        pageTitle: "İşten Çıkış Onay Formları",
        pageDescription: "İnsan Kaynakları departmanının işten çıkış onay formlarını görüntüleyin",
        newButtonLabel: "Yeni İşten Çıkış Onay Formu",
        newRoute: "/separation-approval/new",
        apiPath: "/api/separation-approval",
        columns: {
          requesterHeader: "Hazırlayan",
          documentNo: { header: "Çalışan", path: "separation_approval_request.employee_name" },
        },
      }}
    />
  );
}
