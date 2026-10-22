import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildCaseBackupZip, validateCaseBackupZip } from './backup';
import { BACKUP_TYPE, sha256Blob, type CaseRecord, type ClaimRecord, type EvidenceRecord, type FactRecord, type SubmissionRecord } from './core';

const c: CaseRecord = { case_id: 'CASE-BACKUP', case_title: '가상 사건', case_number: '2026가단12345', court_name: '가상 법원', case_type: '임대차보증금 반환', party_role: '원고', opponent_name: '가상 임대인', case_status: '준비중', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' };
async function e(): Promise<EvidenceRecord> { const blob = new Blob(['original bytes'], { type: 'text/plain' }); return { evidence_id: 'EVD-BACKUP', case_id: c.case_id, original_filename: '계약서.txt', display_title: '계약서', file_type: 'TXT', mime_type: 'text/plain', mime_warning: '', file_size: blob.size, sha256: await sha256Blob(blob), source_description: '가상 출처', created_or_occurred_at: '2026-02-16', acquired_at: '2026-10-21', verification_status: 'UNVERIFIED', notes: '', proof_purpose: '계약 확인', exhibit_prefix: '갑', exhibit_main_no: 1, exhibit_sub_no: null, exhibit_number: '갑 제1호증', number_history: [], submission_status: '미제출', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z', file_blob: blob }; }
const cl = (evidenceId: string): ClaimRecord => ({ claim_id: 'CLM-BACKUP', case_id: c.case_id, claim_statement: '사용자 주장', proof_purpose: '계약 확인', linked_supporting_evidence: [evidenceId], linked_contradicting_evidence: [], review_status: '관련 증거 있음', notes: '', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' });
const fa = (evidenceId: string): FactRecord => ({ fact_id: 'FACT-BACKUP', case_id: c.case_id, event_date: '2026-02-16', date_precision: 'DATE', event_description: '가상 사실', linked_evidence_ids: [evidenceId], review_status: '관련 증거 있음', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' });
const su = (evidenceId: string, hash: string): SubmissionRecord => ({ submission_id: 'SUB-BACKUP', case_id: c.case_id, evidence_id: evidenceId, submission_date: '2026-10-21', submission_method: '가상 제출', submission_reference: 'TEST', submitted_copy_hash: hash, receipt_attachment_id: '', created_at: '2026-10-21T00:00:00Z' });

describe('ZIP 전체 백업/복원 검증', () => {
  it('원본과 메타데이터가 포함된 실제 ZIP을 만든다', async () => {
    const evidence = await e(); const blob = await buildCaseBackupZip(c, [evidence], [cl(evidence.evidence_id)], [fa(evidence.evidence_id)], [su(evidence.evidence_id, evidence.sha256)]);
    expect(blob.type).toContain('zip'); const zip = await JSZip.loadAsync(blob); expect(zip.file('manifest.json')).toBeTruthy(); expect(zip.file('files/original/EVD-BACKUP/계약서.txt')).toBeTruthy();
  });
  it('정상 백업을 재해시 후 복원 번들로 승인한다', async () => {
    const evidence = await e(); const blob = await buildCaseBackupZip(c, [evidence], [cl(evidence.evidence_id)], [fa(evidence.evidence_id)], []); const bundle = await validateCaseBackupZip(blob);
    expect(bundle.manifest.package_type).toBe(BACKUP_TYPE); expect(bundle.evidence).toHaveLength(1); expect(await sha256Blob(bundle.evidence[0].file_blob)).toBe(evidence.sha256);
  });
  it('원본이 변조된 백업을 거부한다', async () => {
    const evidence = await e(); const blob = await buildCaseBackupZip(c, [evidence], [], [], []); const zip = await JSZip.loadAsync(blob); zip.file('files/original/EVD-BACKUP/계약서.txt', 'tampered'); const corrupted = await zip.generateAsync({ type: 'blob' });
    await expect(validateCaseBackupZip(corrupted)).rejects.toThrow(/SHA-256|크기 불일치/);
  });
  it('메타데이터 변조도 해시로 거부한다', async () => {
    const evidence = await e(); const blob = await buildCaseBackupZip(c, [evidence], [], [], []); const zip = await JSZip.loadAsync(blob); const rows = JSON.parse(await zip.file('cases.json')!.async('text')); rows[0].case_title = '변조'; zip.file('cases.json', JSON.stringify(rows)); const corrupted = await zip.generateAsync({ type: 'blob' });
    await expect(validateCaseBackupZip(corrupted)).rejects.toThrow(/메타데이터 해시 불일치/);
  });
  it('필수 manifest 누락을 거부한다', async () => { const zip = new JSZip(); zip.file('cases.json', '[]'); const blob = await zip.generateAsync({ type: 'blob' }); await expect(validateCaseBackupZip(blob)).rejects.toThrow(/필수 백업 항목 누락/); });
  it('사건 간 증거 혼합을 거부한다', async () => {
    const evidence = await e(); const blob = await buildCaseBackupZip(c, [evidence], [], [], []); const zip = await JSZip.loadAsync(blob); const metas = JSON.parse(await zip.file('evidence.json')!.async('text')); metas[0].case_id = 'OTHER'; const text = JSON.stringify(metas, null, 2); zip.file('evidence.json', text);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text')); const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); manifest.metadata_sha256['evidence.json'] = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''); zip.file('manifest.json', JSON.stringify(manifest, null, 2)); const bad = await zip.generateAsync({ type: 'blob' });
    await expect(validateCaseBackupZip(bad)).rejects.toThrow(/사건 간 증거 혼합/);
  });
  it('동일 사건 내 중복 SHA-256을 거부한다', async () => {
    const evidence = await e(); const second = { ...evidence, evidence_id: 'EVD-BACKUP-2', exhibit_main_no: 2, exhibit_number: '갑 제2호증' }; await expect(buildCaseBackupZip(c, [evidence, second], [], [], [])).resolves.toBeInstanceOf(Blob);
    const blob = await buildCaseBackupZip(c, [evidence, second], [], [], []); await expect(validateCaseBackupZip(blob)).rejects.toThrow(/중복 SHA-256/);
  });
});
