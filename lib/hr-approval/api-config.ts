// İK Onay formlarının API yapılandırması (route dosyaları buradan bağlanır).
import type { HrApprovalApiConfig } from "./api";
import {
  ONBOARDING_APPROVAL_CODE,
  SEPARATION_APPROVAL_CODE,
  parseOnboardingApprovalInput,
  parseSeparationApprovalInput,
  type OnboardingApprovalInput,
  type SeparationApprovalInput,
} from "./forms";

export const ONBOARDING_APPROVAL_API: HrApprovalApiConfig<OnboardingApprovalInput> = {
  workflowCode: ONBOARDING_APPROVAL_CODE,
  detailTable: "onboarding_approval_requests",
  relation: "onboarding_approval_request",
  listColumns: "candidate_name, candidate_title, start_date",
  context: "onboarding-approval",
  parse: parseOnboardingApprovalInput,
};

export const SEPARATION_APPROVAL_API: HrApprovalApiConfig<SeparationApprovalInput> = {
  workflowCode: SEPARATION_APPROVAL_CODE,
  detailTable: "separation_approval_requests",
  relation: "separation_approval_request",
  listColumns: "employee_name, employee_title, separation_date",
  context: "separation-approval",
  parse: parseSeparationApprovalInput,
};
