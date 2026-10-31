// Süreç Tanımları (admin) — görünüm modeli.
//
// workflow_definitions + workflow_steps + workflow_initiators + workflow_step_attachments
// tablolarını, sabit pozisyonların güncel sahipleriyle birlikte tek bir görünüm
// modeline derler. Onay motorunun (workflow-service.ts) onaycı çözümleme kurallarına
// göre yapılandırma uyarıları da burada üretilir; UI yalnız gösterir. Faz 2a: sabit
// pozisyonlu adımın pozisyonu panelden değiştirilebilir — seçim listesi
// (assignable_positions) ve adım değişiklik logu (workflow_step_changes) da burada yüklenir;
// yazma PATCH /api/workflow-steps/[id] üzerinden.
//
// Yalnız SELECT yapar. RLS: konfigürasyon tabloları tüm authenticated kullanıcılara
// açıktır, ancak sayfa/route seviyesinde ORG_ADMIN kontrolü yapılır.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionType, ApproverType, StepCondition, WorkflowStepPhase } from './types';
import { resolveExtraApproverTarget } from './extra-approvers-shared';
import { positionAssignmentBlocker } from './step-position-rules';

// ============================================================================
// Görünüm modeli
// ============================================================================

export type ConfigWarningLevel = 'error' | 'warning';

export interface ConfigWarning {
  level: ConfigWarningLevel;
  message: string;
}

export interface ConfigHolder {
  employee_id: string;
  full_name: string;
  status: string; // employees.status: ACTIVE | INACTIVE
  is_primary: boolean;
}

export interface ConfigUnitRef {
  id: string;
  name: string;
}

export interface ConfigPosition {
  id: string;
  title: string;
  job_code: string | null;
  is_active: boolean;
  is_unit_head: boolean;
  location: string | null;
  unit: ConfigUnitRef | null;
  /** Aktif atamalar (employee_positions.end_date IS NULL) */
  holders: ConfigHolder[];
}

export interface ConfigStepAttachment {
  id: string;
  label: string;
  is_required: boolean;
  max_files: number | null;
  max_file_size_bytes: number | null;
  allowed_mime_types: string[] | null;
}

/** Adımın pozisyon/ad değişikliği (workflow_step_changes, trigger yazar) */
export interface ConfigStepChange {
  created_at: string;
  /** Değiştiren çalışan; NULL = Table Editor / SQL */
  changed_by: string | null;
  old_position_title: string | null;
  new_position_title: string | null;
  old_name: string | null;
  new_name: string | null;
}

export interface ConfigStep {
  id: string;
  step_order: number;
  name: string;
  approver_type: ApproverType;
  action_type: ActionType | null;
  phase: WorkflowStepPhase;
  form_section_key: string | null;
  is_required: boolean;
  condition: StepCondition | null;
  static_position: ConfigPosition | null;
  /** Bu adımın onaycısı zincire ek onaycı ekleyebilir (Olur — Genel Müdür) */
  can_add_extra_approvers: boolean;
  attachments: ConfigStepAttachment[];
  /** En son değişiklik (log tablosu yoksa ya da kayıt yoksa null) */
  last_change: ConfigStepChange | null;
  warnings: ConfigWarning[];
}

export interface ConfigInitiator {
  id: string;
  position: ConfigPosition | null;
  unit: ConfigUnitRef | null;
}

export interface ConfigWorkflow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_restricted: boolean;
  created_at: string;
  updated_at: string | null;
  initiators: ConfigInitiator[];
  steps: ConfigStep[];
  warnings: ConfigWarning[];
}

/** UNIT_HEAD çözümlemesi için birim → amir pozisyonu → kişi tablosu */
export interface UnitHeadEntry {
  unit: { id: string; name: string; is_active: boolean; parent: ConfigUnitRef | null };
  /** is_unit_head = true & is_active = true pozisyon(lar); motor tam bir tane bekler */
  head_positions: ConfigPosition[];
  warnings: ConfigWarning[];
}

/** Sabit pozisyonlu adıma seçilebilecek pozisyon + atanamıyorsa nedeni */
export interface AssignablePosition extends ConfigPosition {
  /** positionAssignmentBlocker — null ise seçilebilir */
  blocker: string | null;
}

export interface WorkflowConfigOverview {
  workflows: ConfigWorkflow[];
  unit_heads: UnitHeadEntry[];
  /** Aktif pozisyonlar (birim, başlık sırasıyla); atanamayanlar blocker ile işaretli */
  assignable_positions: AssignablePosition[];
  generated_at: string;
}

// ============================================================================
// Ham satır tipleri (select şekilleri)
// ============================================================================

interface DefinitionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_restricted: boolean | null;
  created_at: string;
  updated_at: string | null;
}

interface StepRow {
  id: string;
  workflow_definition_id: string;
  step_order: number;
  name: string;
  approver_type: ApproverType;
  action_type: string | null;
  phase: string;
  form_section_key: string | null;
  is_required: boolean;
  condition: unknown;
  static_position_id: string | null;
  can_add_extra_approvers?: boolean | null;
}

interface AttachmentRow {
  id: string;
  workflow_step_id: string;
  label: string;
  is_required: boolean;
  max_files: number | null;
  max_file_size_bytes: number | null;
  allowed_mime_types: string[] | null;
}

interface InitiatorRow {
  id: string;
  workflow_definition_id: string;
  position_id: string | null;
  unit_id: string | null;
}

interface PositionRow {
  id: string;
  title: string;
  job_code: string | null;
  is_active: boolean;
  is_unit_head: boolean;
  location: string | null;
  unit_id: string;
}

interface UnitRow {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  order_index: number;
}

interface StepChangeRow {
  workflow_step_id: string;
  created_at: string;
  old_position_title: string | null;
  new_position_title: string | null;
  old_name: string | null;
  new_name: string | null;
  changed_by: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

interface HolderRow {
  position_id: string;
  employee_id: string;
  is_primary: boolean;
  employee: { id: string; first_name: string; last_name: string; status: string } | null;
}

// ============================================================================
// Yardımcılar
// ============================================================================

function isStepCondition(value: unknown): value is StepCondition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { field?: unknown }).field === 'string'
  );
}

function toPhase(value: string): WorkflowStepPhase {
  return value === 'COMPLETION' ? 'COMPLETION' : 'APPROVAL';
}

function toActionType(value: string | null): ActionType | null {
  if (value === 'FILL_AND_SIGN' || value === 'SIGN_ONLY') return value;
  return null;
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Sabit pozisyon adımı için motorun (getEmployeeByPosition → .single()) davranışına
 * göre uyarı üretir. Çözümlenemeyen onaycı = createApprovalChain hata fırlatır,
 * yani o süreçte talep oluşturulamaz.
 */
function staticPositionWarnings(position: ConfigPosition | null, hasPositionId: boolean): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  if (!hasPositionId) {
    out.push({ level: 'error', message: 'Sabit pozisyon seçilmemiş; bu süreçte talep oluşturma hata verir.' });
    return out;
  }
  if (!position) {
    out.push({ level: 'error', message: 'Pozisyon kaydı bulunamadı; bu süreçte talep oluşturma hata verir.' });
    return out;
  }
  if (!position.is_active) {
    out.push({ level: 'warning', message: 'Pozisyon pasif durumda.' });
  }
  if (position.holders.length === 0) {
    out.push({ level: 'error', message: 'Pozisyonda aktif atama yok; onaycı çözümlenemez, talep oluşturma hata verir.' });
  } else if (position.holders.length > 1) {
    out.push({
      level: 'error',
      message: 'Pozisyonda birden fazla aktif atama var; motor tek kişi bekler, onaycı çözümlenemez.',
    });
  }
  const inactiveHolder = position.holders.find((h) => h.status !== 'ACTIVE');
  if (inactiveHolder) {
    out.push({
      level: 'warning',
      message: `Atanan çalışan pasif (${inactiveHolder.full_name}); onaylar bu kişide takılı kalır.`,
    });
  }
  return out;
}

// ============================================================================
// Ana yükleyici
// ============================================================================

export async function loadWorkflowConfigOverview(
  supabase: SupabaseClient
): Promise<WorkflowConfigOverview> {
  // 1) Konfigürasyon tabloları (birbirinden bağımsız → paralel)
  const [definitionsRes, stepsRes, attachmentsRes, initiatorsRes, unitsRes, positionsRes, holdersRes, stepChangesRes] =
    await Promise.all([
      supabase
        .from('workflow_definitions')
        .select('id, code, name, description, is_active, is_restricted, created_at, updated_at')
        .order('name'),
      supabase
        .from('workflow_steps')
        .select(
          'id, workflow_definition_id, step_order, name, approver_type, action_type, phase, form_section_key, is_required, condition, static_position_id, can_add_extra_approvers'
        )
        .order('step_order'),
      supabase
        .from('workflow_step_attachments')
        .select('id, workflow_step_id, label, is_required, max_files, max_file_size_bytes, allowed_mime_types')
        .order('created_at'),
      supabase
        .from('workflow_initiators')
        .select('id, workflow_definition_id, position_id, unit_id'),
      supabase
        .from('organizational_units')
        .select('id, name, parent_id, is_active, order_index')
        .order('order_index')
        .order('name'),
      // Tüm pozisyonlar ve açık atamaları: adım/başlatıcı/amir pozisyonları + panelden
      // pozisyon değiştirme seçim listesi (~140 pozisyon; .in() filtresi URL'i şişirirdi).
      supabase
        .from('positions')
        .select('id, title, job_code, is_active, is_unit_head, location, unit_id'),
      // Motorla aynı filtre: end_date IS NULL
      supabase
        .from('employee_positions')
        .select('position_id, employee_id, is_primary, employee:employees(id, first_name, last_name, status)')
        .is('end_date', null),
      // Hata firstError'a girmez — aşağıda (2) tolere edilir
      supabase
        .from('workflow_step_changes')
        .select(
          'workflow_step_id, created_at, old_position_title, new_position_title, old_name, new_name, changed_by:employees!changed_by_employee_id(first_name, last_name)'
        )
        .order('created_at', { ascending: false }),
    ]);

  const firstError =
    definitionsRes.error ||
    stepsRes.error ||
    attachmentsRes.error ||
    initiatorsRes.error ||
    unitsRes.error ||
    positionsRes.error ||
    holdersRes.error;
  if (firstError) {
    throw new Error(`Süreç tanımları yüklenemedi: ${firstError.message}`);
  }

  const definitions = (definitionsRes.data ?? []) as DefinitionRow[];
  const steps = (stepsRes.data ?? []) as StepRow[];
  const attachments = (attachmentsRes.data ?? []) as AttachmentRow[];
  const initiators = (initiatorsRes.data ?? []) as InitiatorRow[];
  const units = (unitsRes.data ?? []) as UnitRow[];
  const allPositions = (positionsRes.data ?? []) as PositionRow[];
  const unitHeadPositions = allPositions.filter((p) => p.is_unit_head);
  const holders: HolderRow[] = ((holdersRes.data ?? []) as unknown[]).map((row) => {
    const r = row as Omit<HolderRow, 'employee'> & { employee: HolderRow['employee'] | HolderRow['employee'][] };
    return { ...r, employee: unwrapOne(r.employee) };
  });

  // 2) Adım değişiklik logu (sql/feature_workflow_step_change_log.sql). Tablo henüz
  //    yoksa ya da okunamazsa ekran geçmişsiz çalışır — log görünüm için zorunlu değil.
  const lastChangeByStep = new Map<string, ConfigStepChange>();
  if (stepChangesRes.error) {
    console.warn(
      '[config-overview] workflow_step_changes okunamadı (geçmiş gösterilmeyecek):',
      stepChangesRes.error.message
    );
  } else {
    for (const row of (stepChangesRes.data ?? []) as StepChangeRow[]) {
      if (lastChangeByStep.has(row.workflow_step_id)) continue; // en yenisi zaten alındı
      const by = unwrapOne(row.changed_by);
      lastChangeByStep.set(row.workflow_step_id, {
        created_at: row.created_at,
        changed_by: by ? `${by.first_name} ${by.last_name}`.trim() : null,
        old_position_title: row.old_position_title,
        new_position_title: row.new_position_title,
        old_name: row.old_name,
        new_name: row.new_name,
      });
    }
  }

  // 3) Sözlükler
  const unitById = new Map<string, UnitRow>(units.map((u) => [u.id, u]));
  const unitRef = (id: string | null | undefined): ConfigUnitRef | null => {
    if (!id) return null;
    const u = unitById.get(id);
    return u ? { id: u.id, name: u.name } : null;
  };

  const holdersByPosition = new Map<string, ConfigHolder[]>();
  for (const h of holders) {
    const list = holdersByPosition.get(h.position_id) ?? [];
    list.push({
      employee_id: h.employee_id,
      full_name: h.employee ? `${h.employee.first_name} ${h.employee.last_name}`.trim() : h.employee_id,
      status: h.employee?.status ?? 'UNKNOWN',
      is_primary: h.is_primary,
    });
    holdersByPosition.set(h.position_id, list);
  }
  for (const list of holdersByPosition.values()) {
    list.sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'));
  }

  const positionById = new Map<string, ConfigPosition>();
  for (const p of allPositions) {
    positionById.set(p.id, {
      id: p.id,
      title: p.title,
      job_code: p.job_code,
      is_active: p.is_active,
      is_unit_head: p.is_unit_head,
      location: p.location,
      unit: unitRef(p.unit_id),
      holders: holdersByPosition.get(p.id) ?? [],
    });
  }

  const attachmentsByStep = new Map<string, ConfigStepAttachment[]>();
  for (const a of attachments) {
    const list = attachmentsByStep.get(a.workflow_step_id) ?? [];
    list.push({
      id: a.id,
      label: a.label,
      is_required: a.is_required,
      max_files: a.max_files,
      max_file_size_bytes: a.max_file_size_bytes,
      allowed_mime_types: a.allowed_mime_types,
    });
    attachmentsByStep.set(a.workflow_step_id, list);
  }

  const stepsByDefinition = new Map<string, StepRow[]>();
  for (const s of steps) {
    const list = stepsByDefinition.get(s.workflow_definition_id) ?? [];
    list.push(s);
    stepsByDefinition.set(s.workflow_definition_id, list);
  }

  const initiatorsByDefinition = new Map<string, InitiatorRow[]>();
  for (const i of initiators) {
    const list = initiatorsByDefinition.get(i.workflow_definition_id) ?? [];
    list.push(i);
    initiatorsByDefinition.set(i.workflow_definition_id, list);
  }

  // 4) Süreçleri derle
  const workflows: ConfigWorkflow[] = definitions.map((d) => {
    const rawSteps = [...(stepsByDefinition.get(d.id) ?? [])].sort((a, b) => a.step_order - b.step_order);

    const configSteps: ConfigStep[] = rawSteps.map((s) => {
      const staticPosition = s.static_position_id ? positionById.get(s.static_position_id) ?? null : null;
      const warnings: ConfigWarning[] = [];
      if (s.approver_type === 'STATIC_POSITION') {
        warnings.push(...staticPositionWarnings(staticPosition, Boolean(s.static_position_id)));
      } else if (s.static_position_id) {
        warnings.push({
          level: 'warning',
          message: 'Adım tipi sabit pozisyon değil ama static_position_id dolu; motor bu alanı yok sayar.',
        });
      }
      if (!toActionType(s.action_type)) {
        warnings.push({ level: 'warning', message: 'action_type tanımsız; FILL_AND_SIGN varsayılır.' });
      }
      if (s.can_add_extra_approvers === true && !resolveExtraApproverTarget(rawSteps, s.id)) {
        warnings.push({
          level: 'error',
          message:
            'Ek onaycı ekleyebilir işaretli ama öncesinde (onay fazında) Dinamik Liste adımı yok ya da adım tamamlama fazında; özellik kapalı.',
        });
      }
      return {
        id: s.id,
        step_order: s.step_order,
        name: s.name,
        approver_type: s.approver_type,
        action_type: toActionType(s.action_type),
        phase: toPhase(s.phase),
        form_section_key: s.form_section_key,
        is_required: s.is_required,
        condition: isStepCondition(s.condition) ? s.condition : null,
        static_position: staticPosition,
        can_add_extra_approvers: s.can_add_extra_approvers === true,
        attachments: attachmentsByStep.get(s.id) ?? [],
        last_change: lastChangeByStep.get(s.id) ?? null,
        warnings,
      };
    });

    const configInitiators: ConfigInitiator[] = (initiatorsByDefinition.get(d.id) ?? []).map((i) => ({
      id: i.id,
      position: i.position_id ? positionById.get(i.position_id) ?? null : null,
      unit: unitRef(i.unit_id),
    }));

    const warnings: ConfigWarning[] = [];
    if (configSteps.length === 0) {
      warnings.push({ level: 'error', message: 'Adım tanımlı değil; bu süreçte talep oluşturulamaz.' });
    } else if (configSteps[0].approver_type !== 'REQUESTER') {
      warnings.push({
        level: 'warning',
        message: 'İlk adım REQUESTER değil; motor ilk adımı otomatik onaylamaz.',
      });
    }
    if (d.is_restricted && configInitiators.length === 0) {
      warnings.push({
        level: 'warning',
        message: 'Kısıtlı süreç ama başlatıcı tanımı yok; yalnız ORG_ADMIN başlatabilir.',
      });
    }
    for (const ini of configInitiators) {
      if (ini.position && ini.position.holders.length === 0) {
        warnings.push({
          level: 'warning',
          message: `Başlatıcı pozisyonda (${ini.position.title}) aktif atama yok.`,
        });
      }
    }

    return {
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      is_active: d.is_active,
      is_restricted: Boolean(d.is_restricted),
      created_at: d.created_at,
      updated_at: d.updated_at,
      initiators: configInitiators,
      steps: configSteps,
      warnings,
    };
  });

  // 5) Birim amirleri (UNIT_HEAD çözümleme tablosu) — motor: is_unit_head & is_active → .single()
  const headPositionsByUnit = new Map<string, ConfigPosition[]>();
  for (const p of unitHeadPositions) {
    const cfg = positionById.get(p.id);
    if (!cfg) continue;
    const list = headPositionsByUnit.get(p.unit_id) ?? [];
    list.push(cfg);
    headPositionsByUnit.set(p.unit_id, list);
  }

  const unit_heads: UnitHeadEntry[] = units.map((u) => {
    const heads = headPositionsByUnit.get(u.id) ?? [];
    const activeHeads = heads.filter((h) => h.is_active);
    const parent = unitRef(u.parent_id);
    const warnings: ConfigWarning[] = [];

    if (activeHeads.length === 0) {
      warnings.push({
        level: 'warning',
        message: parent
          ? `Aktif amir pozisyonu yok; talepler üst birime (${parent.name}) tırmanır.`
          : 'Aktif amir pozisyonu yok ve üst birim yok; talep eden kendini onaylar.',
      });
    } else if (activeHeads.length > 1) {
      warnings.push({
        level: 'error',
        message: 'Birden fazla aktif amir pozisyonu var; motor tek pozisyon bekler, çözümleme üst birime kayar.',
      });
    } else {
      const head = activeHeads[0];
      if (head.holders.length === 0) {
        warnings.push({
          level: 'warning',
          message: parent
            ? `Amir pozisyonunda aktif atama yok; talepler üst birime (${parent.name}) tırmanır.`
            : 'Amir pozisyonunda aktif atama yok ve üst birim yok; talep eden kendini onaylar.',
        });
      } else if (head.holders.length > 1) {
        warnings.push({
          level: 'error',
          message: 'Amir pozisyonunda birden fazla aktif atama var; motor tek kişi bekler.',
        });
      }
      const inactive = head.holders.find((h) => h.status !== 'ACTIVE');
      if (inactive) {
        warnings.push({ level: 'warning', message: `Amir pasif çalışan (${inactive.full_name}).` });
      }
    }

    return {
      unit: { id: u.id, name: u.name, is_active: u.is_active, parent },
      head_positions: heads,
      warnings,
    };
  });

  // 6) Panelden pozisyon değiştirme seçim listesi: aktif pozisyonlar, birim + başlık sırasıyla
  const assignable_positions: AssignablePosition[] = Array.from(positionById.values())
    .filter((p) => p.is_active)
    .map((p) => ({ ...p, blocker: positionAssignmentBlocker(p) }))
    .sort(
      (a, b) =>
        (a.unit?.name ?? '').localeCompare(b.unit?.name ?? '', 'tr') ||
        a.title.localeCompare(b.title, 'tr')
    );

  return {
    workflows,
    unit_heads,
    assignable_positions,
    generated_at: new Date().toISOString(),
  };
}
