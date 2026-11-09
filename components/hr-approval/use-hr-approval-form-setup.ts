"use client";

// İK Onay formlarının (İşe Giriş / İşten Çıkış Onay) ortak sayfa kurulumu:
// talep sahibinin imzası, şirket sözlüğü ve 1. adımın ek dosya ayarı.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SignatureFont } from "@/lib/signature/types";
import type { AttachmentRules } from "@/lib/attachments/pending-files";

export interface HrFormSignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export interface HrFormCompanyOption {
  id: string;
  name: string;
}

export interface HrFormAttachmentSetup {
  configId: string | null;
  label: string;
  rules: AttachmentRules;
}

const DEFAULT_ATTACHMENT: HrFormAttachmentSetup = {
  configId: null,
  label: "Ek Dosyalar",
  rules: { allowedMimeTypes: null, maxFileSizeBytes: 20 * 1024 * 1024, maxFiles: 20 },
};

export function useHrApprovalFormSetup(workflowCode: string) {
  const [loading, setLoading] = useState(true);
  const [signatureInfo, setSignatureInfo] = useState<HrFormSignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [companies, setCompanies] = useState<HrFormCompanyOption[]>([]);
  const [attachment, setAttachment] = useState<HrFormAttachmentSetup>(DEFAULT_ATTACHMENT);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const loadSignature = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: appUser } = await supabase
        .from("app_users")
        .select("employee:employees(signature_text, signature_font)")
        .eq("id", user.id)
        .single();
      const employee = (appUser as { employee?: { signature_text: string | null; signature_font: string | null } | null } | null)
        ?.employee;
      if (employee && !cancelled) {
        setSignatureInfo({
          signatureText: employee.signature_text,
          signatureFont: employee.signature_font as SignatureFont | null,
        });
      }
    };

    const loadCompanies = async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (data && !cancelled) setCompanies(data);
    };

    const loadAttachmentConfig = async () => {
      const { data: wfDef } = await supabase
        .from("workflow_definitions")
        .select("id")
        .eq("code", workflowCode)
        .maybeSingle();
      if (!wfDef) return;
      const { data: step } = await supabase
        .from("workflow_steps")
        .select("id")
        .eq("workflow_definition_id", wfDef.id)
        .eq("step_order", 1)
        .maybeSingle();
      if (!step) return;
      const { data: configs } = await supabase
        .from("workflow_step_attachments")
        .select("id, label, allowed_mime_types, max_file_size_bytes, max_files")
        .eq("workflow_step_id", step.id)
        .limit(1);
      const config = configs?.[0];
      if (config && !cancelled) {
        setAttachment({
          configId: config.id,
          label: config.label,
          rules: {
            allowedMimeTypes: config.allowed_mime_types,
            maxFileSizeBytes: config.max_file_size_bytes,
            maxFiles: config.max_files,
          },
        });
      }
    };

    Promise.all([loadSignature(), loadCompanies(), loadAttachmentConfig()])
      .catch((err) => console.error("[hr-approval-form] setup load failed:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workflowCode]);

  return { loading, signatureInfo, companies, attachment };
}
