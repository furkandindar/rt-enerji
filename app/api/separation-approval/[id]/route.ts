import { createUpdateHandler } from "@/lib/hr-approval/api";
import { SEPARATION_APPROVAL_API } from "@/lib/hr-approval/api-config";

// PATCH /api/separation-approval/[id] — talep sahibi Taslak/Revize'de formu günceller
export const PATCH = createUpdateHandler(SEPARATION_APPROVAL_API);
