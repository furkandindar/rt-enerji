import { createListHandler, createCreateHandler } from "@/lib/hr-approval/api";
import { SEPARATION_APPROVAL_API } from "@/lib/hr-approval/api-config";

// GET  /api/separation-approval — İşten Çıkış Onay Formu listesi (mine | department)
// POST /api/separation-approval — yeni İşten Çıkış Onay Formu
export const GET = createListHandler(SEPARATION_APPROVAL_API);
export const POST = createCreateHandler(SEPARATION_APPROVAL_API);
