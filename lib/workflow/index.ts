// Workflow Engine - V3 / V5
// Public exports

export * from './types';
export {
  determineApprover,
  createApprovalChain,
  getWorkflowDefinitionByCode,
  // V3: Yeni fonksiyonlar
  canStartWorkflow,
  getAvailableWorkflows,
} from './workflow-service';
export {
  createNotification,
  notifyApprover,
  notifyRequestApproved,
  notifyRequestRejected,
  notifyRequestUpdated,
  notifyRevisionRequested,
  notifyDelegationAssigned,
  notifyDelegationCancelled,
  getUnreadNotificationCount,
} from './notification-service';
// Vekalet (Faz B): lib/workflow/delegation service-role client import eder;
// client bundle'a sızmasın diye index'ten re-export EDİLMEZ — sunucu kodu
// doğrudan '@/lib/workflow/delegation' import eder.
// V5: Lifecycle helper'ları
export {
  canEditRequest,
  canWithdrawRequest,
  canCancelRequest,
  canRequestRevision,
  resetApprovalChain,
  applyAuditStamp,
  ACTIONABLE_REQUEST_STATUSES,
} from './lifecycle';
export type { LifecycleUser } from './lifecycle';
export {
  WORKFLOW_EDIT_ROUTE,
  WORKFLOW_PATCH_ROUTE,
  getEditUrl,
  getPatchUrl,
} from './route-map';

