// Süreç Tanımları (admin, salt okunur) — Faz 1.
//
// workflow_definitions + workflow_steps + workflow_initiators + workflow_step_attachments
// tablolarını, sabit pozisyonların güncel sahipleriyle birlikte tek bir görünüm
// modeline derler. Onay motorunun (workflow-service.ts) onaycı çözümleme kurallarına
// göre yapılandırma uyarıları da burada üretilir; UI yalnız gösterir.
//
// Yalnız SELECT yapar; yazma yok. RLS: bu tablolar tüm authenticated kullanıcılara
// açıktır, ancak sayfa/route seviyesinde ORG_ADMIN kontrolü yapılır.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionType, ApproverType, StepCondition, WorkflowStepPhase } from './types';

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
  attachments: ConfigStepAttachment[];
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

export interface WorkflowConfigOverview {
  workflows: ConfigWorkflow[];
  unit_heads: UnitHeadEntry[];
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
  const [definitionsRes, stepsRes, attachmentsRes, initiatorsRes, unitsRes, unitHeadPositionsRes] =
    await Promise.all([
      supabase
        .from('workflow_definitions')
        .select('id, code, name, description, is_active, is_restricted, created_at, updated_at')
        .order('name'),
      supabase
        .from('workflow_steps')
        .select(
          'id, workflow_definition_id, step_order, name, approver_type, action_type, phase, form_section_key, is_required, condition, static_position_id'
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
      supabase
        .from('positions')
        .select('id, title, is_active, is_unit_head, location, unit_id')
        .eq('is_unit_head', true),
    ]);

  const firstError =
    definitionsRes.error ||
    stepsRes.error ||
    attachmentsRes.error ||
    initiatorsRes.error ||
    unitsRes.error ||
    unitHeadPositionsRes.error;
  if (firstError) {
    throw new Error(`Süreç tanımları yüklenemedi: ${firstError.message}`);
  }

  const definitions = (definitionsRes.data ?? []) as DefinitionRow[];
  const steps = (stepsRes.data ?? []) as StepRow[];
  const attachments = (attachmentsRes.data ?? []) as AttachmentRow[];
  const initiators = (initiatorsRes.data ?? []) as InitiatorRow[];
  const units = (unitsRes.data ?? []) as UnitRow[];
  const unitHeadPositions = (unitHeadPositionsRes.data ?? []) as PositionRow[];

  // 2) Adımların ve başlatıcıların referans verdiği pozisyonlar
  const referencedPositionIds = new Set<string>();
  for (const s of steps) if (s.static_position_id) referencedPositionIds.add(s.static_position_id);
  for (const i of initiators) if (i.position_id) referencedPositionIds.add(i.position_id);
  for (const p of unitHeadPositions) referencedPositionIds.delete(p.id); // zaten elimizde

  let referencedPositions: PositionRow[] = [];
  if (referencedPositionIds.size > 0) {
    const { data, error } = await supabase
      .from('positions')
      .select('id, title, is_active, is_unit_head, location, unit_id')
      .in('id', Array.from(referencedPositionIds));
    if (error) throw new Error(`Pozisyonlar yüklenemedi: ${error.message}`);
    referencedPositions = (data ?? []) as PositionRow[];
  }

  const allPositions = [...unitHeadPositions, ...referencedPositions];
  const allPositionIds = allPositions.map((p) => p.id);

  // 3) Bu pozisyonlardaki aktif atamalar (motorla aynı filtre: end_date IS NULL)
  let holders: HolderRow[] = [];
  if (allPositionIds.length > 0) {
    const { data, error } = await supabase
      .from('employee_positions')
      .select('position_id, employee_id, is_primary, employee:employees(id, first_name, last_name, status)')
      .in('position_id', allPositionIds)
      .is('end_date', null);
    if (error) throw new Error(`Pozisyon atamaları yüklenemedi: ${error.message}`);
    holders = ((data ?? []) as unknown[]).map((row) => {
      const r = row as Omit<HolderRow, 'employee'> & { employee: HolderRow['employee'] | HolderRow['employee'][] };
      return { ...r, employee: unwrapOne(r.employee) };
    });
  }

  // 4) Sözlükler
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

  // 5) Süreçleri derle
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
        attachments: attachmentsByStep.get(s.id) ?? [],
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

  // 6) Birim amirleri (UNIT_HEAD çözümleme tablosu) — motor: is_unit_head & is_active → .single()
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

  return {
    workflows,
    unit_heads,
    generated_at: new Date().toISOString(),
  };
}
