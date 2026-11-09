import { createUpdateHandler } from "@/lib/hr-approval/api";
import { ONBOARDING_APPROVAL_API } from "@/lib/hr-approval/api-config";

// PATCH /api/onboarding-approval/[id] — talep sahibi Taslak/Revize'de formu günceller
export const PATCH = createUpdateHandler(ONBOARDING_APPROVAL_API);
