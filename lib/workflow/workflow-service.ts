// Workflow Engine Service - V3
// Onaycı belirleme, approval chain oluşturma ve workflow yetkilendirme

import { SupabaseClient } from '@supabase/supabase-js';
import { WorkflowStep, WorkflowDefinition } from './types';

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

/**
 * Bir pozisyonun unit_id'sini getirir
 */
async function getPositionUnitId(
  supabase: SupabaseClient,
  positionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('positions')
    .select('unit_id')
    .eq('id', positionId)
    .single();

  return data?.unit_id || null;
}

/**
 * Bir birimde, belirtilen kişi hariç, alternatif bir çalışan bulur.
 * Önce aynı birimde herhangi biri aranır (level_band sıralaması ile).
 * Bulunamazsa null döner.
 */
async function findAlternativeInUnit(
  supabase: SupabaseClient,
  unitId: string,
  excludeEmployeeId: string
): Promise<string | null> {
  // Birimde aktif pozisyonları ve çalışanları bul (level_band sıralı - düşük önce)
  const { data: assignments } = await supabase
    .from('employee_positions')
    .select(`
      employee_id,
      position:positions!inner (
        id,
        unit_id,
        level_band,
        is_active
      )
    `)
    .eq('position.unit_id', unitId)
    .eq('position.is_active', true)
    .is('end_date', null)
    .neq('employee_id', excludeEmployeeId);

  if (!assignments || assignments.length === 0) {
    return null;
  }

  // Level band'e göre sırala (100 en üst, 500 en alt - düşük değer önce)
  const sorted = assignments.sort((a, b) => {
    const levelA = (a.position as unknown as { level_band: number }).level_band;
    const levelB = (b.position as unknown as { level_band: number }).level_band;
    return levelA - levelB;
  });

  // İlk bulunanı döndür
  return sorted[0].employee_id;
}

/**
 * STATIC_POSITION için alternatif onaycı bulur.
 *
 * Kural:
 * 1. Pozisyondaki kişiyi bul
 * 2. Eğer talep eden = onaycı ise → Aynı birimde alternatif ara
 * 3. Alternatif yoksa → Üst birime escalate et
 * 4. Üst birimde de yoksa → Kendi kendini onaylar (self-approval)
 */
async function findAlternativeForStaticPosition(
  supabase: SupabaseClient,
  positionId: string,
  requesterEmployeeId: string
): Promise<string | null> {
  // 1. Pozisyonun birimini al
  const unitId = await getPositionUnitId(supabase, positionId);
  if (!unitId) {
    return null;
  }

  let currentUnitId: string | null = unitId;
  let iterations = 0;
  const maxIterations = 10; // Sonsuz döngü koruması

  while (currentUnitId && iterations < maxIterations) {
    iterations++;

    // 2. Bu birimde alternatif ara
    const alternativeEmployeeId = await findAlternativeInUnit(
      supabase,
      currentUnitId,
      requesterEmployeeId
    );

    if (alternativeEmployeeId) {
      return alternativeEmployeeId;
    }

    // 3. Bulunamadı, üst birime bak
    const parentUnit = await getParentUnit(supabase, currentUnitId);
    if (!parentUnit) {
      // En üst birime ulaşıldı, alternatif yok
      break;
    }

    currentUnitId = parentUnit.id;
  }

  // 4. Hiç alternatif bulunamadı - self-approval (talep eden kendi kendini onaylar)
  console.warn(
    `No alternative approver found for position ${positionId}. ` +
    `Requester ${requesterEmployeeId} will self-approve.`
  );
  return requesterEmployeeId;
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
  // Eğer onaycı = talep eden ise, aynı birimde alternatif ara
  if (step.approver_type === 'STATIC_POSITION') {
    if (!step.static_position_id) {
      throw new Error(`Step "${step.name}" requires static_position_id`);
    }

    // Pozisyondaki kişiyi bul
    const approverEmployeeId = await getEmployeeByPosition(supabase, step.static_position_id);

    // Eğer onaycı = talep eden ise, alternatif bul
    if (approverEmployeeId === requesterEmployeeId) {
      return findAlternativeForStaticPosition(
        supabase,
        step.static_position_id,
        requesterEmployeeId
      );
    }

    return approverEmployeeId;
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
): Promise<{ id: string; name: string; is_restricted: boolean } | null> {
  const { data } = await supabase
    .from('workflow_definitions')
    .select('id, name, is_restricted')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  return data;
}

// ============================================================================
// V3: Workflow Yetkilendirme Fonksiyonları
// ============================================================================

/**
 * Çalışanın tüm pozisyonlarını getirir (primary ve secondary)
 */
async function getEmployeePositionIds(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('employee_positions')
    .select('position_id')
    .eq('employee_id', employeeId)
    .is('end_date', null); // Aktif atamalar

  if (error || !data) return [];
  return data.map(ep => ep.position_id);
}

/**
 * Bir workflow'u başlatabilecek pozisyon ID'lerini getirir
 */
async function getWorkflowInitiatorPositionIds(
  supabase: SupabaseClient,
  workflowDefinitionId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('workflow_initiators')
    .select('position_id')
    .eq('workflow_definition_id', workflowDefinitionId);

  if (error || !data) return [];
  return data.map(wi => wi.position_id);
}

/**
 * Çalışanın belirli bir workflow'u başlatıp başlatamayacağını kontrol eder
 */
export async function canStartWorkflow(
  supabase: SupabaseClient,
  employeeId: string,
  workflowDefinitionId: string
): Promise<boolean> {
  // 1. Workflow'u al
  const { data: workflow } = await supabase
    .from('workflow_definitions')
    .select('is_restricted')
    .eq('id', workflowDefinitionId)
    .eq('is_active', true)
    .single();

  if (!workflow) return false;

  // 2. Kısıtlı değilse herkes başlatabilir
  if (!workflow.is_restricted) return true;

  // 3. Çalışanın pozisyonlarını al
  const employeePositionIds = await getEmployeePositionIds(supabase, employeeId);
  if (employeePositionIds.length === 0) return false;

  // 4. İzin verilen pozisyonları al
  const allowedPositionIds = await getWorkflowInitiatorPositionIds(supabase, workflowDefinitionId);
  if (allowedPositionIds.length === 0) return false;

  // 5. Kesişim var mı?
  return employeePositionIds.some(epId => allowedPositionIds.includes(epId));
}

/**
 * Çalışanın başlatabileceği tüm workflow'ları getirir
 */
export async function getAvailableWorkflows(
  supabase: SupabaseClient,
  employeeId: string
): Promise<WorkflowDefinition[]> {
  // 1. Tüm aktif workflow'ları al
  const { data: workflows, error } = await supabase
    .from('workflow_definitions')
    .select(`
      id,
      code,
      name,
      description,
      is_active,
      is_restricted,
      created_at,
      updated_at
    `)
    .eq('is_active', true)
    .order('name');

  if (error || !workflows) return [];

  // 2. Çalışanın pozisyonlarını al
  const employeePositionIds = await getEmployeePositionIds(supabase, employeeId);

  // 3. Her workflow için yetki kontrolü yap
  const availableWorkflows: WorkflowDefinition[] = [];

  for (const workflow of workflows) {
    // Kısıtlı değilse ekle
    if (!workflow.is_restricted) {
      availableWorkflows.push(workflow as WorkflowDefinition);
      continue;
    }

    // Kısıtlıysa, pozisyon kontrolü yap
    const allowedPositionIds = await getWorkflowInitiatorPositionIds(supabase, workflow.id);
    const hasPermission = employeePositionIds.some(epId => allowedPositionIds.includes(epId));

    if (hasPermission) {
      availableWorkflows.push(workflow as WorkflowDefinition);
    }
  }

  return availableWorkflows;
}

