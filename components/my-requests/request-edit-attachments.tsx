"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AttachmentUploader } from "@/components/attachment-uploader";
import type { RequestAttachment, WorkflowStepAttachmentConfig } from "@/lib/workflow/types";

// Düzenleme (revize) modu için ek dosya alanı. Talep zaten var olduğundan
// yükleme/silme anında yapılır (AttachmentUploader → upload-url/confirm,
// DELETE /api/attachments/[id]); "Güncelle ve Gönder" beklenmez.
//
// Kapsam: formun kendi ekleri = workflow'un 1. adımına (talep eden) tanımlı
// attachment config'leri. Sonraki adımlarda yüklenen ekler burada görünmez.

interface Props {
  requestId: string;
  workflowCode: string;
  disabled?: boolean;
}

export function RequestEditAttachments({ requestId, workflowCode, disabled }: Props) {
  const [configs, setConfigs] = useState<WorkflowStepAttachmentConfig[]>([]);
  const [files, setFiles] = useState<RequestAttachment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: wfDef } = await supabase
        .from("workflow_definitions")
        .select("id")
        .eq("code", workflowCode)
        .single();
      if (!wfDef) return;

      const { data: step } = await supabase
        .from("workflow_steps")
        .select("id")
        .eq("workflow_definition_id", wfDef.id)
        .eq("step_order", 1)
        .single();
      if (!step) return;

      const { data: cfgs } = await supabase
        .from("workflow_step_attachments")
        .select("id, workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files")
        .eq("workflow_step_id", step.id);
      if (!cfgs || cfgs.length === 0) return;

      const { data: existing } = await supabase
        .from("request_attachments")
        .select("*")
        .eq("request_id", requestId)
        .in("step_attachment_config_id", cfgs.map((c) => c.id))
        .order("uploaded_at", { ascending: true });

      if (cancelled) return;
      setConfigs(cfgs as WorkflowStepAttachmentConfig[]);
      setFiles((existing ?? []) as RequestAttachment[]);
    })().catch((err) => console.error("[RequestEditAttachments] load failed:", err));
    return () => {
      cancelled = true;
    };
  }, [requestId, workflowCode]);

  return (
    <AttachmentUploader
      requestId={requestId}
      configs={configs}
      existingFiles={files}
      onUpload={(file) => setFiles((prev) => [...prev, file])}
      onDelete={(fileId) => setFiles((prev) => prev.filter((f) => f.id !== fileId))}
      disabled={disabled}
    />
  );
}
