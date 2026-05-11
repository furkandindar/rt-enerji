import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function OvertimeListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "OVERTIME",
        pageTitle: "Fazla Mesai Formları",
        pageDescription: "İnsan Kaynakları departmanının tüm fazla mesai taleplerini görüntüleyin",
        newButtonLabel: "Yeni Fazla Mesai Formu",
        newRoute: "/overtime/new",
        apiPath: "/api/overtime",
      }}
    />
  );
}
