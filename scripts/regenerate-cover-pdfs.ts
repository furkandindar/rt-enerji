// Finans / Muhasebe onay kapağı taslak PDF'lerini yeni şablonla yeniden üretir.
//
// Hedef küme: status = AWAITING_COMPLETION (RT Onayı bekleyen) VE pdf_path hâlâ
// otomatik taslak (`…_approval.pdf`). Islak imzalı tarama (`signed_*.pdf`) yazılmış
// talepler ASLA dokunulmaz — filtre hem SQL'de hem JS'te uygulanır.
//
// Yaptığı iş talep başına, workflow-service'teki otomatik üretimle aynı zincir:
//   generateRequestPDF → mergeAttachments → uploadRequestPDF → requests.pdf_path UPDATE
// (buildAndUploadRequestPDF kullanılmıyor: içindeki next/server `after()` Next request
// context'i dışında çalışmaz. SharePoint'e zaten terminal olmayan statü gitmiyor.)
//
// Çalıştırma (repo kökünden, deploy SONRASI — render lokalde yapılır, şablon lokaldeki
// koddur; Storage'a yüklenen dosya prod'un okuduğu dosyadır):
//   npx tsx scripts/regenerate-cover-pdfs.ts --dry-run                # sadece listele
//   npx tsx scripts/regenerate-cover-pdfs.ts --env=.env.prod.local --dry-run
//   npx tsx scripts/regenerate-cover-pdfs.ts --env=.env.prod.local
//   npx tsx scripts/regenerate-cover-pdfs.ts --env=.env.prod.local --ids=<uuid>,<uuid>
//   npx tsx scripts/regenerate-cover-pdfs.ts --env=.env.prod.local --limit=3
//
// Env dosyasında NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY olmalı.
// Varsayılan env dosyası .env.local (genelde DEV'e bakar) — prod için --env ver (--env-file DEĞİL: o Node'un kendi flag'i, tsx script'e iletmez).

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const TARGET_WORKFLOW_CODES = ['FINANCE_APPROVAL_COVER', 'ACCOUNTING_APPROVAL_COVER'];
const TARGET_STATUS = 'AWAITING_COMPLETION';
const DRAFT_PDF_SUFFIX = '_approval.pdf';

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const dryRun = flag('dry-run');
const envFile = opt('env') ?? '.env.local';
const onlyIds = opt('ids')?.split(',').map((s) => s.trim()).filter(Boolean);
const limit = opt('limit') ? Number(opt('limit')) : undefined;

// ---------- env ----------
// Mevcut process.env'i ezmez; sadece eksik anahtarları dosyadan doldurur.
function loadEnvFile(file: string) {
  const abs = path.resolve(process.cwd(), file);
  if (!existsSync(abs)) {
    console.error(`Env dosyası bulunamadı: ${abs}`);
    process.exit(1);
  }
  for (const raw of readFileSync(abs, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(envFile);

const projectRef = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0]; } catch { return '?'; }
})();

interface TargetRow {
  id: string;
  request_no: string | null;
  status: string;
  pdf_path: string | null;
  workflow_definition: { code: string } | { code: string }[] | null;
}

async function main() {
  // Env yüklendikten sonra import edilmeli (service role client env'i çağrı anında okur,
  // ama font kayıtları vs. modül yüklenirken çalışır — sırayı sabit tutalım).
  const { createServiceRoleClient } = await import('../lib/supabase/service-role');
  const { generateRequestPDF } = await import('../lib/pdf/generate-request-pdf');
  const { mergeAttachments } = await import('../lib/pdf/merge-attachments');
  const { uploadRequestPDF } = await import('../lib/storage/upload-request-pdf');

  const supabase = createServiceRoleClient();

  console.log(`Supabase projesi: ${projectRef}  |  mod: ${dryRun ? 'DRY-RUN (yazma yok)' : 'YAZMA'}`);

  let query = supabase
    .from('requests')
    .select('id, request_no, status, pdf_path, workflow_definition:workflow_definitions!inner(code)')
    .eq('status', TARGET_STATUS)
    .in('workflow_definition.code', TARGET_WORKFLOW_CODES)
    .like('pdf_path', `%${DRAFT_PDF_SUFFIX}`)
    .order('request_no');
  if (onlyIds?.length) query = query.in('id', onlyIds);

  const { data, error } = await query;
  if (error) {
    console.error('Talep listesi alınamadı:', error.message);
    process.exit(1);
  }

  // JS tarafında ikinci emniyet: sadece taslak dosyalar
  let targets = ((data ?? []) as TargetRow[]).filter(
    (r) => r.status === TARGET_STATUS && r.pdf_path?.endsWith(DRAFT_PDF_SUFFIX)
  );
  if (limit && limit > 0) targets = targets.slice(0, limit);

  const codeOf = (r: TargetRow) =>
    Array.isArray(r.workflow_definition) ? r.workflow_definition[0]?.code : r.workflow_definition?.code;

  console.log(`Hedef talep sayısı: ${targets.length}`);
  for (const r of targets) console.log(`  ${r.request_no}  ${codeOf(r)}  ${r.pdf_path}`);
  if (dryRun || targets.length === 0) return;

  console.log('\nYeniden üretim başlıyor...\n');
  let ok = 0, failed = 0, multiPage = 0;

  for (const r of targets) {
    const tag = `${r.request_no} (${r.id})`;
    try {
      // Yazmadan hemen önce taze kontrol: bu arada tarama yüklendiyse atla.
      const { data: fresh } = await supabase.from('requests').select('status, pdf_path').eq('id', r.id).single();
      if (!fresh || fresh.status !== TARGET_STATUS || !fresh.pdf_path?.endsWith(DRAFT_PDF_SUFFIX)) {
        console.log(`SKIP  ${tag} — durum değişmiş (${fresh?.status}, ${fresh?.pdf_path})`);
        continue;
      }

      const coverBuffer = await generateRequestPDF({ requestId: r.id, supabase });
      const coverPages = (await PDFDocument.load(coverBuffer)).getPageCount();
      const finalBuffer = await mergeAttachments(coverBuffer, r.id, supabase);
      const totalPages = (await PDFDocument.load(finalBuffer)).getPageCount();

      const pdfPath = await uploadRequestPDF({ requestId: r.id, pdfBuffer: finalBuffer });
      const { error: updErr } = await supabase
        .from('requests')
        .update({ pdf_path: pdfPath, pdf_status: 'success', pdf_last_error: null })
        .eq('id', r.id);
      if (updErr) throw new Error(`pdf_path update: ${updErr.message}`);

      if (coverPages > 1) multiPage++;
      ok++;
      console.log(`OK    ${tag} → ${pdfPath}  kapak=${coverPages} sayfa${coverPages > 1 ? '  ⚠ TAŞMA' : ''}, toplam=${totalPages}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${tag} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nBitti: ${ok} başarılı, ${failed} hatalı, ${multiPage} kapak hâlâ >1 sayfa.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
