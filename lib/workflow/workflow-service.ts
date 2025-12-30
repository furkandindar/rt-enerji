// Workflow Engine Service - V2
// Onaycı belirleme ve approval chain oluşturma mantığı

import { SupabaseClient } from '@supabase/supabase-js';
import { WorkflowStep } from './types';

// ============================================================================
// Types
// ============================================================================

interface Position {
  id: string;
  title: string;
  unit_id: string;
  is_unit_head: boolean;
}

interface EmployeePosition {
  employee_id: string;
  position_id: string;
  is_primary: boolean;
  position: Position;
}

interface OrganizationalUnit {
  id: string;
  name: string;
  parent_id: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Çalışanın primary pozisyonunu getirir
 */
async function getEmployeePrimaryPosition(
  supabase: SupabaseClient,
  employeeId: string
): Promise<EmployeePosition | null> {
  const { data, error } = await supabase
    .from('employee_positions')
    .select(`
      employee_id,
      position_id,
      is_primary,
      position:positions (
        id,
        title,
        unit_id,
        is_unit_head
      )
    `)
    .eq('employee_id', employeeId)
    .eq('is_primary', true)
    .is('end_date', null)  // Aktif atama = bitiş tarihi yok
    .single();

  if (error || !data) return null;
  return data as unknown as EmployeePosition;
}

/**
 * Bir birimin müdürünü (is_unit_head=true) bulur
 */
async function getUnitHead(
  supabase: SupabaseClient,
  unitId: string
): Promise<string | null> {
  // 1. Birimde is_unit_head=true olan pozisyonu bul
  const { data: position } = await supabase
    .from('positions')
    .select('id')
    .eq('unit_id', unitId)
    .eq('is_unit_head', true)
    .eq('is_active', true)
    .single();

  if (!position) return null;

  // 2. Bu pozisyondaki aktif çalışanı bul
  const { data: assignment } = await supabase
    .from('employee_positions')
    .select('employee_id')
    .eq('position_id', position.id)
    .is('end_date', null)  // Aktif atama = bitiş tarihi yok
    .single();

  return assignment?.employee_id || null;
}

/**
 * Üst birimi getirir
 */
async function getParentUnit(
  supabase: SupabaseClient,
  unitId: string
): Promise<OrganizationalUnit | null> {
  const { data: unit } = await supabase
    .from('organizational_units')
    .select('parent_id')
    .eq('id', unitId)
    .single();

  if (!unit?.parent_id) return null;

  const { data: parentUnit } = await supabase
    .from('organizational_units')
    .select('id, name, parent_id')
    .eq('id', unit.parent_id)
    .single();

  return parentUnit || null;
}

/**
 * Static position'daki çalışanı bulur
 */
async function getEmployeeByPosition(
  supabase: SupabaseClient,
  positionId: string
): Promise<string | null> {
  const { data: assignment } = await supabase
    .from('employee_positions')
    .select('employee_id')
    .eq('position_id', positionId)
    .is('end_date', null)  // Aktif atama = bitiş tarihi yok
    .single();

  return assignment?.employee_id || null;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Bir adım için onaycıyı belirler
 *
 * Kurallar:
 * - REQUESTER: Talep eden kişi
 * - UNIT_HEAD: Talep edenin birim müdürü (escalation ile)
 * - STATIC_POSITION: Belirtilen pozisyondaki kişi
 */
export async function determineApprover(
  supabase: SupabaseClient,
  step: WorkflowStep,
  requesterEmployeeId: string
): Promise<string | null> {

  // REQUESTER: Talep eden kişi
  if (step.approver_type === 'REQUESTER') {
    return requesterEmployeeId;
  }

  // STATIC_POSITION: Belirtilen pozisyondaki kişi
  if (step.approver_type === 'STATIC_POSITION') {
    if (!step.static_position_id) {
      throw new Error(`Step "${step.name}" requires static_position_id`);
    }
    return getEmployeeByPosition(supabase, step.static_position_id);
  }

  // UNIT_HEAD: Talep edenin birim müdürü (escalation mantığı ile)
  if (step.approver_type === 'UNIT_HEAD') {
    return determineUnitHeadApprover(supabase, requesterEmployeeId);
  }

  return null;
}

/**
 * UNIT_HEAD için onaycıyı belirler (escalation mantığı ile)
 *
 * Kural:
 * 1. Talep edenin birim müdürünü bul
 * 2. Eğer talep eden = birim müdürü ise → üst birime git
 * 3. Üst birim yoksa → kendi kendini onaylar (self-approval)
 */
async function determineUnitHeadApprover(
  supabase: SupabaseClient,
  requesterEmployeeId: string
): Promise<string | null> {

  // 1. Talep edenin primary pozisyonunu al
  const requesterPosition = await getEmployeePrimaryPosition(supabase, requesterEmployeeId);
  if (!requesterPosition) {
    throw new Error('Requester has no primary position assigned');
  }

  let currentUnitId = requesterPosition.position.unit_id;
  let iterations = 0;
  const maxIterations = 10; // Sonsuz döngü koruması

  while (iterations < maxIterations) {
    iterations++;

    // 2. Mevcut birimin müdürünü bul
    const unitHeadEmployeeId = await getUnitHead(supabase, currentUnitId);

    // Birim müdürü bulunamadı
    if (!unitHeadEmployeeId) {
      // Üst birime bak
      const parentUnit = await getParentUnit(supabase, currentUnitId);
      if (parentUnit) {
        currentUnitId = parentUnit.id;
        continue;
      }
      // Üst birim de yoksa, hata fırlat
      throw new Error('No unit head found in the hierarchy');
    }

    // 3. Talep eden ≠ Birim müdürü → Bu kişi onaycı
    if (unitHeadEmployeeId !== requesterEmployeeId) {
      return unitHeadEmployeeId;
    }

    // 4. Talep eden = Birim müdürü → Üst birime escalate
    const parentUnit = await getParentUnit(supabase, currentUnitId);

    if (!parentUnit) {
      // En üst birim - kendi kendini onaylar (self-approval)
      return requesterEmployeeId;
    }

    // Üst birimde devam et
    currentUnitId = parentUnit.id;
  }

  throw new Error('Max iterations reached while determining approver');
}

/**
 * Bir talep için tüm approval kayıtlarını oluşturur.
 * Eğer ilk adım REQUESTER tipindeyse otomatik olarak onaylar.
 */
export async function createApprovalChain(
  supabase: SupabaseClient,
  requestId: string,
  workflowDefinitionId: string,
  requesterEmployeeId: string
): Promise<void> {

  // 1. Workflow adımlarını al
  const { data: steps, error: stepsError } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_definition_id', workflowDefinitionId)
    .order('step_order', { ascending: true });

  if (stepsError || !steps || steps.length === 0) {
    throw new Error('Failed to fetch workflow steps');
  }

  // 2. Her adım için onaycıyı belirle ve approval kaydı oluştur
  const approvals = [];
  let firstRequesterStepId: string | null = null;

  for (const step of steps) {
    const approverEmployeeId = await determineApprover(
      supabase,
      step as WorkflowStep,
      requesterEmployeeId
    );

    if (!approverEmployeeId) {
      throw new Error(`Could not determine approver for step: ${step.name}`);
    }

    // İlk adım REQUESTER tipinde mi kontrol et
    const isFirstRequesterStep = step.step_order === 1 && step.approver_type === 'REQUESTER';

    approvals.push({
      request_id: requestId,
      workflow_step_id: step.id,
      approver_employee_id: approverEmployeeId,
      // REQUESTER adımını otomatik onayla
      status: isFirstRequesterStep ? 'APPROVED' : 'PENDING',
      decided_at: isFirstRequesterStep ? new Date().toISOString() : null,
    });

    if (isFirstRequesterStep) {
      firstRequesterStepId = step.id;
    }
  }

  // 3. Tüm approval kayıtlarını ekle
  const { error: insertError } = await supabase
    .from('request_approvals')
    .insert(approvals);

  if (insertError) {
    throw new Error(`Failed to create approval chain: ${insertError.message}`);
  }

  // 4. Eğer ilk adım REQUESTER ise, current_step'i 2'ye güncelle
  if (firstRequesterStepId) {
    const { error: updateError } = await supabase
      .from('requests')
      .update({ current_step: 2 })
      .eq('id', requestId);

    if (updateError) {
      console.error('Failed to update current_step after auto-approval:', updateError);
    }
  }
}

/**
 * Workflow definition'ı code'a göre getirir
 */
export async function getWorkflowDefinitionByCode(
  supabase: SupabaseClient,
  code: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('workflow_definitions')
    .select('id, name')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  return data;
}

