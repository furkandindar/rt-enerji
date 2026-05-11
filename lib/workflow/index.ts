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
  getUnreadNotificationCount,
} from './notification-service';
// V5: Lifecycle helper'ları
export {
  canEditRequest,
  canWithdrawRequest,
  canCancelRequest,
  canRequestRevision,
  resetApprovalChain,
  applyAuditStamp,
} from './lifecycle';
export type { LifecycleUser } from './lifecycle';
export {
  WORKFLOW_EDIT_ROUTE,
  WORKFLOW_PATCH_ROUTE,
  getEditUrl,
  getPatchUrl,
} from './route-map';

