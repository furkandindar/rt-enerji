import { DepartmentProcessListPage } from "@/components/department-processes/department-process-list";

export default function OnboardingApprovalListPage() {
  return (
    <DepartmentProcessListPage
      config={{
        workflowCode: "EMPLOYEE_ONBOARDING_APPROVAL",
        pageTitle: "İşe Giriş Onay Formları",
        pageDescription: "İnsan Kaynakları departmanının işe giriş onay formlarını görüntüleyin",
        newButtonLabel: "Yeni İşe Giriş Onay Formu",
        newRoute: "/onboarding-approval/new",
        apiPath: "/api/onboarding-approval",
        columns: {
          requesterHeader: "Hazırlayan",
          documentNo: { header: "Aday", path: "onboarding_approval_request.candidate_name" },
        },
      }}
    />
  );
}
