import { createListHandler, createCreateHandler } from "@/lib/hr-approval/api";
import { ONBOARDING_APPROVAL_API } from "@/lib/hr-approval/api-config";

// GET  /api/onboarding-approval — İşe Giriş Onay Formu listesi (mine | department)
// POST /api/onboarding-approval — yeni İşe Giriş Onay Formu
export const GET = createListHandler(ONBOARDING_APPROVAL_API);
export const POST = createCreateHandler(ONBOARDING_APPROVAL_API);
