import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function OnboardingListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "EMPLOYEE_ONBOARDING",
        pageTitle: "İşe Giriş Takip Formları",
        pageDescription: "İnsan Kaynakları departmanının tüm işe giriş takip taleplerini görüntüleyin",
        newButtonLabel: "Yeni İşe Giriş Formu",
        newRoute: "/onboarding/new",
        apiPath: "/api/onboarding",
      }}
    />
  );
}
