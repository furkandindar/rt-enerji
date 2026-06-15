// Workflow Engine Service - V3
// Onaycı belirleme, approval chain oluşturma ve workflow yetkilendirme

import { SupabaseClient } from '@supabase/supabase-js';
import { WorkflowStep, WorkflowDefinition, StepCondition, CreateRequestDynamicApprovers } from './types';

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
  // Talep eden = pozisyondaki kişi ise → self-approval (alternatif aranmaz)
  if (step.approver_type === 'STATIC_POSITION') {
    if (!step.static_position_id) {
      throw new Error(`Step "${step.name}" requires static_position_id`);
    }

    // Pozisyondaki kişiyi bul ve direkt döndür
    // Eğer talep eden kendisiyse, self-approval olarak işaretlenecek (createApprovalChain'de)
    const approverEmployeeId = await getEmployeeByPosition(supabase, step.static_position_id);
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
      // Üst birim de yoksa, en tepeye ulaştık → self-approval
      return requesterEmployeeId;
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
 * Koşullu adım kontrolü yapar.
 * Adımın condition'ı varsa formData ile karşılaştırır.
 * Koşul sağlanmıyorsa adım atlanmalıdır (true döner).
 *
 * @param condition - Adımın koşul tanımı (null ise her zaman çalışır)
 * @param formData - Süreç-spesifik form verisi (undefined ise koşul kontrolü yapılmaz)
 * @returns true ise adım atlanmalı (skip), false ise normal çalışmalı
 */
function shouldSkipStep(
  condition: StepCondition | null,
  formData?: Record<string, unknown>
): boolean {
  // Koşul yoksa adım her zaman çalışır
  if (!condition) return false;

  // formData yoksa koşul kontrolü yapılamaz, adım normal çalışır
  if (!formData) return false;

  // Koşul kontrolü: formData'daki değer, beklenen değerle eşleşiyor mu?
  const actualValue = formData[condition.field];
  return actualValue !== condition.value;
}

/**
 * Bir talep için tüm approval kayıtlarını oluşturur.
 *
 * Oluşturma anında otomatik onaylama (yalnızca):
 * 1. İlk adım REQUESTER tipinde ise (talep eden kendi formunu imzalıyor/gönderiyor)
 *
 * Koşullu adım (step.condition) formData ile eşleşmiyorsa adım HİÇ oluşturulmaz
 * (skip — DYNAMIC_USER_LIST ile aynı). Böylece sahte onaycı/sahte imza oluşmaz ve
 * sequence_order sürekli kalır; ilerleme motoru (PATCH /api/approvals/[id]) bozulmaz.
 *
 * İlk adım auto-approve edildikten sonra, talep edenin ilerideki SIGN_ONLY adımları da
 * otomatik onaylanır (form doldurmaya gerek olmayan mükerrer imzalar).
 *
 * Mükerrer onaycı (aynı kişi birden fazla adımda) durumu oluşturma anında DEĞİL,
 * onay verilme anında (PATCH /api/approvals/[id]) handle edilir. Böylece onaycı
 * gerçekten onay verdikten sonra ilerideki SIGN_ONLY adımları otomatik onaylanır.
 *
 * @param formData - Opsiyonel. Koşullu adımlar için süreç-spesifik form verisi.
 * @param dynamicApprovers - Opsiyonel. DYNAMIC_USER_LIST adımları için workflow_step_id → sıralı employee_id listesi eşlemesi.
 *                           Liste boş/tanımsız olan DYNAMIC_USER_LIST adımları atlanır.
 * @param cycle - V5: Bu chain'in hangi revize turuna ait olduğunu belirtir. İlk submit'te 0 (default),
 *                resubmit'te artırılarak çağrılır. Eski cycle'ın kayıtları audit için silinmez.
 */
export async function createApprovalChain(
  supabase: SupabaseClient,
  requestId: string,
  workflowDefinitionId: string,
  requesterEmployeeId: string,
  formData?: Record<string, unknown>,
  dynamicApprovers?: CreateRequestDynamicApprovers,
  cycle: number = 0
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

  // 2. Her adım için onaycı(lar)ı belirle ve approval kayıtları oluştur
  const approvals = [];
  let sequenceCounter = 0; // DYNAMIC_USER_LIST adımları dahil mutlak sıra

  for (const step of steps) {
    // Koşullu adım kontrolü (tüm tipler için geçerli).
    // Koşulu sağlanmayan adım HİÇ oluşturulmaz (skip) — tüm onaycı tipleri için
    // DYNAMIC_USER_LIST ile aynı davranış. Skip edilen adım sequence_order
    // numarası tüketmez, böylece zincir sürekli (1..N) kalır ve ilerleme motoru
    // (PATCH /api/approvals/[id]) bozulmaz. Eskiden standart tipler için APPROVED
    // satır yazılıyordu; bu "sahte onaycı + PDF'te sahte imza" üretiyordu.
    const isConditionNotMet = shouldSkipStep(
      (step as WorkflowStep).condition,
      formData
    );
    if (isConditionNotMet) continue;

    // DYNAMIC_USER_LIST: tek step, N sıralı approval satırı
    if (step.approver_type === 'DYNAMIC_USER_LIST') {
      // Liste boş/tanımsız ise adım tamamen atlanır
      const selectedIds = dynamicApprovers?.[step.id] ?? [];
      if (selectedIds.length === 0) continue;

      for (const employeeId of selectedIds) {
        sequenceCounter++;
        approvals.push({
          request_id: requestId,
          workflow_step_id: step.id,
          approver_employee_id: employeeId,
          status: 'PENDING',
          decided_at: null,
          sequence_order: sequenceCounter,
          action_type: step.action_type,
          revision_cycle: cycle,
        });
      }
      continue;
    }

    // Standart tipler (REQUESTER, UNIT_HEAD, STATIC_POSITION): tek approval satırı
    const approverEmployeeId = await determineApprover(
      supabase,
      step as WorkflowStep,
      requesterEmployeeId
    );

    if (!approverEmployeeId) {
      throw new Error(`Could not determine approver for step: ${step.name}`);
    }

    // Otomatik onaylama (oluşturma anında):
    // İlk adım REQUESTER tipinde ise (talep gönderimi = ilk onay).
    // NOT: Koşulu sağlanmayan adımlar yukarıda zaten skip edildi (satır oluşmaz).
    const isFirstRequesterStep = step.step_order === 1 && step.approver_type === 'REQUESTER';
    const autoApproveThisStep = isFirstRequesterStep;

    sequenceCounter++;
    approvals.push({
      request_id: requestId,
      workflow_step_id: step.id,
      approver_employee_id: approverEmployeeId,
      status: autoApproveThisStep ? 'APPROVED' : 'PENDING',
      decided_at: autoApproveThisStep ? new Date().toISOString() : null,
      sequence_order: sequenceCounter,
      action_type: step.action_type, // Forward-approve kontrolü için
      revision_cycle: cycle,
    });
  }

  // 3. İlk adım auto-approve edildiyse, talep edenin ilerideki SIGN_ONLY adımlarını da onayla
  const firstApproval = approvals[0];
  if (firstApproval && firstApproval.status === 'APPROVED' && firstApproval.approver_employee_id === requesterEmployeeId) {
    const now = new Date().toISOString();
    for (let i = 1; i < approvals.length; i++) {
      const futureApproval = approvals[i];
      if (
        futureApproval.status === 'PENDING' &&
        futureApproval.approver_employee_id === requesterEmployeeId &&
        futureApproval.action_type === 'SIGN_ONLY'
      ) {
        futureApproval.status = 'APPROVED';
        futureApproval.decided_at = now;
      }
    }
  }

  // 4. action_type alanını çıkar (DB'de yok), sonra tüm approval kayıtlarını ekle
  const approvalsForInsert = approvals.map((a) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { action_type, ...rest } = a;
    return rest;
  });

  const { error: insertError } = await supabase
    .from('request_approvals')
    .insert(approvalsForInsert);

  if (insertError) {
    throw new Error(`Failed to create approval chain: ${insertError.message}`);
  }

  // 5. Baştan itibaren ardışık APPROVED adımları atla ve current_step'i ayarla
  let currentStep = 1;
  for (const approval of approvals) {
    if (approval.status === 'APPROVED') {
      currentStep++;
    } else {
      break; // İlk PENDING adıma ulaştık
    }
  }

  // Tüm adımlar auto-approve olduysa request'i tamamla + PDF üret + bildirim gönder
  const allApproved = currentStep > approvals.length;
  if (allApproved) {
    const { error: updateError } = await supabase
      .from('requests')
      .update({
        status: 'APPROVED',
        current_step: approvals.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Failed to complete request after all auto-approvals:', updateError);
    }

    // PDF üret (stamp approval hariç — canvas imzası gerektirir)
    const { data: workflowDef } = await supabase
      .from('workflow_definitions')
      .select('code, name')
      .eq('id', workflowDefinitionId)
      .single();

    if (workflowDef?.code !== 'STAMP_APPROVAL') {
      try {
        const { generateRequestPDF } = await import('../pdf/generate-request-pdf');
        const { mergeAttachments } = await import('../pdf/merge-attachments');
        const { uploadRequestPDF } = await import('../storage/upload-request-pdf');

        console.log('Generating PDF after all auto-approvals for request:', requestId);
        const pdfBuffer = await generateRequestPDF({ requestId, supabase });
        const finalPdfBuffer = await mergeAttachments(pdfBuffer, requestId, supabase);
        const pdfPath = await uploadRequestPDF({ requestId, pdfBuffer: finalPdfBuffer });

        await supabase.from('requests').update({ pdf_path: pdfPath }).eq('id', requestId);
        console.log('PDF generated after all auto-approvals:', pdfPath);
      } catch (pdfError) {
        console.error('Error generating PDF after all auto-approvals:', pdfError);
      }
    }

    // Talep edene "onaylandı" bildirimi gönder
    try {
      const { notifyRequestApproved } = await import('./notification-service');
      await notifyRequestApproved(
        supabase,
        requesterEmployeeId,
        requestId,
        workflowDef?.name || 'Talep',
      );
    } catch (notifError) {
      console.error('Error sending notification after all auto-approvals:', notifError);
    }
  } else if (currentStep > 1) {
    // current_step'i ilk PENDING adıma ayarla
    const { error: updateError } = await supabase
      .from('requests')
      .update({ current_step: currentStep })
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

interface InitiatorRule {
  position_id: string | null;
  unit_id: string | null;
}

/**
 * Bir workflow'u başlatabilecek kuralları getirir (pozisyon veya departman bazlı)
 */
async function getWorkflowInitiatorRules(
  supabase: SupabaseClient,
  workflowDefinitionId: string
): Promise<InitiatorRule[]> {
  const { data, error } = await supabase
    .from('workflow_initiators')
    .select('position_id, unit_id')
    .eq('workflow_definition_id', workflowDefinitionId);

  if (error || !data) return [];
  return data as InitiatorRule[];
}

/**
 * Çalışanın primary pozisyonunun unit_id'sini getirir
 */
async function getEmployeeUnitId(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string | null> {
  const primaryPosition = await getEmployeePrimaryPosition(supabase, employeeId);
  return primaryPosition?.position.unit_id ?? null;
}

/**
 * Çalışanın belirli bir workflow'u başlatıp başlatamayacağını kontrol eder.
 * Kural bazlı kontrol: position_id eşleşmesi VEYA unit_id eşleşmesi yeterli.
 * ORG_ADMIN rolü tüm workflow'ları başlatabilir.
 */
export async function canStartWorkflow(
  supabase: SupabaseClient,
  employeeId: string,
  workflowDefinitionId: string,
  userRole?: string
): Promise<boolean> {
  // ORG_ADMIN her workflow'u başlatabilir
  if (userRole === 'ORG_ADMIN') return true;

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

  // 3. Initiator kurallarını al
  const rules = await getWorkflowInitiatorRules(supabase, workflowDefinitionId);
  if (rules.length === 0) return false;

  // 4. Çalışanın pozisyon ve departman bilgilerini al
  const [employeePositionIds, employeeUnitId] = await Promise.all([
    getEmployeePositionIds(supabase, employeeId),
    getEmployeeUnitId(supabase, employeeId),
  ]);

  // 5. Herhangi bir kural eşleşiyor mu?
  return rules.some(rule => {
    if (rule.position_id && employeePositionIds.includes(rule.position_id)) return true;
    if (rule.unit_id && employeeUnitId === rule.unit_id) return true;
    return false;
  });
}

/**
 * Çalışanın başlatabileceği tüm workflow'ları getirir.
 * ORG_ADMIN rolü tüm aktif workflow'ları görebilir.
 */
export async function getAvailableWorkflows(
  supabase: SupabaseClient,
  employeeId: string,
  userRole?: string
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

  // ORG_ADMIN tüm aktif workflow'ları görebilir
  if (userRole === 'ORG_ADMIN') {
    return workflows as WorkflowDefinition[];
  }

  // 2. Çalışanın pozisyon ve departman bilgilerini al
  const [employeePositionIds, employeeUnitId] = await Promise.all([
    getEmployeePositionIds(supabase, employeeId),
    getEmployeeUnitId(supabase, employeeId),
  ]);

  // 3. Her workflow için yetki kontrolü yap
  const availableWorkflows: WorkflowDefinition[] = [];

  for (const workflow of workflows) {
    // Kısıtlı değilse ekle
    if (!workflow.is_restricted) {
      availableWorkflows.push(workflow as WorkflowDefinition);
      continue;
    }

    // Kısıtlıysa, kural bazlı kontrol yap (pozisyon veya departman)
    const rules = await getWorkflowInitiatorRules(supabase, workflow.id);
    const hasPermission = rules.some(rule => {
      if (rule.position_id && employeePositionIds.includes(rule.position_id)) return true;
      if (rule.unit_id && employeeUnitId === rule.unit_id) return true;
      return false;
    });

    if (hasPermission) {
      availableWorkflows.push(workflow as WorkflowDefinition);
    }
  }

  return availableWorkflows;
}

