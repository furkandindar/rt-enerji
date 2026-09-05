import type { SignatureFont } from '@/lib/signature/types';

// PDF template'lerinin ortak kullandığı tipler. Supabase'ten gelen request join
// ağacının PDF render katmanında okunan kısmını kapsar; her template kendi
// "feature request" şeklini bu dosya dışında tanımlar.

export interface SignatureInfo {
  text: string;
  font: SignatureFont;
  /**
   * Vekalet (Faz B): imza atanan onaycıya değil vekile aitse, imzanın altına
   * basılacak küçük etiket (örn. "Vekaleten: Ümmühan Oğuz"). Kolon başlığı ve
   * ad yine atanan onaycınındır; imza ve etiket vekilindir.
   */
  onBehalfNote?: string;
}

export interface PdfRequest {
  id: string;
  created_at: string;
  // Süreç sürümlerine göre ek alanlar mevcut olabilir (ör. status, request_no).
  // Render katmanında kullanılmadığı için tip içine konmadı; gerektiğinde
  // ekleyenin dosyasına özgü interface ile genişletilebilir.
}

export interface EmployeePositionLink {
  is_primary: boolean;
  end_date: string | null;
  position?: { title: string | null } | null;
}

export interface PdfRequester {
  id: string;
  first_name: string;
  last_name: string;
  employee_positions?: EmployeePositionLink[] | null;
  signature_text?: string | null;
  signature_font?: SignatureFont | null;
}

export interface PdfApprover {
  id: string;
  first_name: string | null;
  last_name: string | null;
  signature_text?: string | null;
  signature_font?: SignatureFont | null;
}

export interface PdfWorkflowStep {
  step_order: number;
  name: string | null;
  approver_type?: 'REQUESTER' | 'UNIT_HEAD' | 'STATIC_POSITION' | 'DYNAMIC_USER_LIST';
  phase?: 'APPROVAL' | 'COMPLETION';
  form_section_key?: string | null;
  static_position?: { title: string | null } | null;
}

export interface PdfApproval {
  id?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  comment: string | null;
  decided_at?: string | null;
  workflow_step: PdfWorkflowStep;
  approver: PdfApprover;
  // Vekalet (Faz B): işlemi fiilen yapan (vekil); null = onaycının kendisi
  acted_by?: PdfApprover | null;
}
