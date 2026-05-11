import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function SeparationListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "EMPLOYEE_SEPARATION",
        pageTitle: "İşten Çıkış Takip Formları",
        pageDescription: "İnsan Kaynakları departmanının tüm işten çıkış takip taleplerini görüntüleyin",
        newButtonLabel: "Yeni İşten Çıkış Formu",
        newRoute: "/separation/new",
        apiPath: "/api/separation",
      }}
    />
  );
}
