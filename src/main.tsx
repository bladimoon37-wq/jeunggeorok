import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MAX_FILE_BYTES,
  PRODUCT_NOTICE,
  appendNumberHistory,
  buildCaseReportHtml,
  buildReviewSummary,
  defaultExhibitPrefix,
  displayTimelineDate,
  evidenceCsv,
  formatExhibitNumber,
  isSupportedEvidenceFilename,
  makeId,
  metadataJson,
  mimeExtensionWarning,
  nextExhibitNumber,
  nowIso,
  sanitizeDownloadFilename,
  sha256Blob,
  sortFactsTimeline,
  validateClaim,
  validateFact,
  verifyEvidenceBlob,
  type CaseRecord,
  type ClaimRecord,
  type ClaimReviewStatus,
  type DatePrecision,
  type EvidenceRecord,
  type FactRecord,
  type FactReviewStatus,
  type IntegrityResult,
  type PartyRole,
  type ReviewSummary,
  type SubmissionRecord,
  type SubmissionStatus,
  type VerificationStatus,
} from './core';
import { buildCaseBackupZip, validateCaseBackupZip } from './backup';
import {
  addEvidence,
  addSubmission,
  clearAllData,
  createCase,
  deleteCaseCascade,
  deleteClaim,
  deleteEvidenceAndCleanReferences,
  deleteFact,
  deleteSubmission,
  ensureStorageCapacity,
  getExistingIds,
  listAllEvidence,
  listCases,
  listClaims,
  listEvidence,
  listFacts,
  listSubmissions,
  putClaim,
  putFact,
  restoreAtomic,
  updateCase,
  updateEvidenceMetadata,
} from './db';
import './style.css';

type Tab = 'evidence' | 'claims' | 'timeline' | 'submissions' | 'review' | 'backup';

const CASE_TYPES = ['임대차보증금 반환', '대여금', '물품대금', '손해배상', '계약금 반환', '기타 민사'];
const SUBMISSION_STATUSES: SubmissionStatus[] = ['미제출', '제출 준비', '제출 완료', '보완 필요', '제출 여부 미확인'];
const CLAIM_STATUSES: ClaimReviewStatus[] = ['사용자 주장', '관련 증거 있음', '다툼 있음', '추가 확인 필요'];
const FACT_STATUSES: FactReviewStatus[] = ['사용자 기록', '관련 증거 있음', '다툼 있음', '추가 확인 필요'];
const DATE_PRECISIONS: Array<{ value: DatePrecision; label: string }> = [
  { value: 'TIMESTAMP', label: '정확한 일시' }, { value: 'DATE', label: '날짜만 확인' }, { value: 'MONTH', label: '월까지만 확인' }, { value: 'UNKNOWN', label: '날짜 미상' },
];

const newCase = (): CaseRecord => ({
  case_id: makeId('CASE'), case_title: '', case_number: '', court_name: '', case_type: CASE_TYPES[0], party_role: '원고', opponent_name: '', case_status: '준비중', created_at: nowIso(), updated_at: nowIso(),
});

const newEvidenceMeta = (caseId: string, role: PartyRole, currentEvidence: EvidenceRecord[]): Omit<EvidenceRecord, 'file_blob'> => {
  const prefix = defaultExhibitPrefix(role);
  const main = nextExhibitNumber(currentEvidence, prefix);
  return {
    evidence_id: makeId('EVD'), case_id: caseId, original_filename: '', display_title: '', file_type: '', mime_type: '', mime_warning: '', file_size: 0, sha256: '', source_description: '', created_or_occurred_at: 'UNKNOWN', acquired_at: new Date().toISOString().slice(0, 10), verification_status: 'UNVERIFIED', notes: '', proof_purpose: '', exhibit_prefix: prefix, exhibit_main_no: main, exhibit_sub_no: null, exhibit_number: formatExhibitNumber(prefix, main, null), number_history: [], submission_status: '미제출', created_at: nowIso(), updated_at: nowIso(),
  };
};

const newClaim = (caseId: string): ClaimRecord => ({ claim_id: makeId('CLM'), case_id: caseId, claim_statement: '', proof_purpose: '', linked_supporting_evidence: [], linked_contradicting_evidence: [], review_status: '사용자 주장', notes: '', created_at: nowIso(), updated_at: nowIso() });
const newFact = (caseId: string): FactRecord => ({ fact_id: makeId('FACT'), case_id: caseId, event_date: 'UNKNOWN', date_precision: 'UNKNOWN', event_description: '', linked_evidence_ids: [], review_status: '사용자 기록', created_at: nowIso(), updated_at: nowIso() });
const newSubmission = (caseId: string): SubmissionRecord => ({ submission_id: makeId('SUB'), case_id: caseId, evidence_id: '', submission_date: new Date().toISOString().slice(0, 10), submission_method: '', submission_reference: '', submitted_copy_hash: '0'.repeat(64), receipt_attachment_id: '', created_at: nowIso() });

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = sanitizeDownloadFilename(filename); document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') { downloadBlob(filename, new Blob([text], { type: mime })); }

function EvidencePicker({ evidence, selected, onChange }: { evidence: EvidenceRecord[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (!evidence.length) return <p className="muted">먼저 이 사건에 증거를 등록하십시오.</p>;
  return <div className="check-grid">{evidence.map((item) => <label className="check-item" key={item.evidence_id}><input type="checkbox" checked={selected.includes(item.evidence_id)} onChange={(event) => onChange(event.target.checked ? [...selected, item.evidence_id] : selected.filter((id) => id !== item.evidence_id))} /><span><strong>{item.exhibit_number || '미부여'}</strong><small>{item.display_title}</small></span></label>)}</div>;
}

function App() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [activeCaseId, setActiveCaseId] = useState('');
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [facts, setFacts] = useState<FactRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [tab, setTab] = useState<Tab>('evidence');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseForm, setCaseForm] = useState<CaseRecord>(newCase());
  const [editingCase, setEditingCase] = useState(false);
  const [evidenceMeta, setEvidenceMeta] = useState<Omit<EvidenceRecord, 'file_blob'>>(newEvidenceMeta('', '원고', []));
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [editingEvidence, setEditingEvidence] = useState<EvidenceRecord | null>(null);
  const [numberReason, setNumberReason] = useState('');
  const [claimForm, setClaimForm] = useState<ClaimRecord>(newClaim(''));
  const [editingClaim, setEditingClaim] = useState(false);
  const [factForm, setFactForm] = useState<FactRecord>(newFact(''));
  const [editingFact, setEditingFact] = useState(false);
  const [submissionForm, setSubmissionForm] = useState<SubmissionRecord>(newSubmission(''));
  const [integrity, setIntegrity] = useState<IntegrityResult[]>([]);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const activeCase = cases.find((item) => item.case_id === activeCaseId) ?? null;
  const visibleCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase();
    return q ? cases.filter((item) => [item.case_title, item.case_number, item.court_name, item.case_type, item.opponent_name].some((v) => v.toLowerCase().includes(q))) : cases;
  }, [cases, caseSearch]);

  async function refreshCases(prefer?: string) {
    const rows = await listCases(); setCases(rows);
    const target = prefer ?? activeCaseId;
    if (target && rows.some((item) => item.case_id === target)) setActiveCaseId(target); else setActiveCaseId(rows[0]?.case_id ?? '');
  }
  async function refreshCaseData(caseId: string) {
    if (!caseId) { setEvidence([]); setClaims([]); setFacts([]); setSubmissions([]); setReview(null); setIntegrity([]); return { ev: [] as EvidenceRecord[] }; }
    const [ev, cl, fa, su] = await Promise.all([listEvidence(caseId), listClaims(caseId), listFacts(caseId), listSubmissions(caseId)]);
    setEvidence(ev); setClaims(cl); setFacts(fa); setSubmissions(su); setReview(null); setIntegrity([]);
    return { ev };
  }

  useEffect(() => { refreshCases().catch((error) => setMessage(String(error))); }, []);
  useEffect(() => {
    const c = cases.find((item) => item.case_id === activeCaseId);
    refreshCaseData(activeCaseId).then(({ ev }) => {
      if (c) {
        setEvidenceMeta(newEvidenceMeta(c.case_id, c.party_role, ev)); setEvidenceFile(null); setEditingEvidence(null); setNumberReason('');
        setClaimForm(newClaim(c.case_id)); setEditingClaim(false); setFactForm(newFact(c.case_id)); setEditingFact(false); setSubmissionForm(newSubmission(c.case_id));
      }
    }).catch((error) => setMessage(String(error)));
  }, [activeCaseId, cases]);

  async function saveCase() {
    setBusy(true); try {
      const record = { ...caseForm, updated_at: nowIso() };
      if (editingCase) await updateCase(record); else await createCase(record);
      await refreshCases(record.case_id); setCaseForm(newCase()); setEditingCase(false); setMessage(editingCase ? '사건 정보를 수정했습니다.' : '새 사건을 생성했습니다.');
    } catch (error) { setMessage(`사건 저장 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); }
  }

  function startEditCase(record: CaseRecord) { setCaseForm(record); setEditingCase(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function removeCase(record: CaseRecord) {
    if (!confirm(`사건 “${record.case_title}”과 연결된 모든 로컬 자료를 삭제합니까? 먼저 백업을 권장합니다.`)) return;
    if (!confirm('삭제는 되돌릴 수 없습니다. 정말 삭제하시겠습니까?')) return;
    setBusy(true); try { await deleteCaseCascade(record.case_id); await refreshCases(); setMessage('사건과 연결 데이터를 삭제했습니다.'); } catch (error) { setMessage(`삭제 실패: ${String(error)}`); } finally { setBusy(false); }
  }

  async function saveEvidence() {
    if (!activeCase) return;
    setBusy(true); try {
      if (editingEvidence) {
        const nextNumber = formatExhibitNumber(evidenceMeta.exhibit_prefix, evidenceMeta.exhibit_main_no, evidenceMeta.exhibit_sub_no);
        if (editingEvidence.submission_status === '제출 완료' && nextNumber !== editingEvidence.exhibit_number && !confirm(`제출 완료로 기록된 증거번호를 ${editingEvidence.exhibit_number || '미부여'} → ${nextNumber || '미부여'}로 변경합니까? 변경 이력이 기록됩니다.`)) return;
        const history = appendNumberHistory(editingEvidence, nextNumber, numberReason);
        const updated: EvidenceRecord = { ...editingEvidence, ...evidenceMeta, exhibit_number: nextNumber, number_history: history, updated_at: nowIso(), file_blob: editingEvidence.file_blob };
        await updateEvidenceMetadata(updated); setMessage('증거 메타데이터를 수정했습니다. 원본 바이트와 SHA-256은 변경하지 않았습니다.');
      } else {
        if (!evidenceFile) throw new Error('원본 파일을 선택하십시오');
        if (evidenceFile.size > MAX_FILE_BYTES) throw new Error('단일 파일은 최대 20MiB까지 저장할 수 있습니다');
        if (!isSupportedEvidenceFilename(evidenceFile.name)) throw new Error('V0.1 기본 지원 형식(PDF/JPG/PNG/TXT/HWP/HWPX/DOC/DOCX/XLS/XLSX/MP3/M4A/MP4)이 아닙니다');
        await ensureStorageCapacity(evidenceFile.size);
        const sha256 = await sha256Blob(evidenceFile);
        const ext = evidenceFile.name.includes('.') ? evidenceFile.name.split('.').pop()!.toUpperCase() : 'BINARY';
        const exhibit_number = formatExhibitNumber(evidenceMeta.exhibit_prefix, evidenceMeta.exhibit_main_no, evidenceMeta.exhibit_sub_no);
        const record: EvidenceRecord = { ...evidenceMeta, original_filename: evidenceFile.name, display_title: evidenceMeta.display_title || evidenceFile.name, file_type: ext, mime_type: evidenceFile.type || 'application/octet-stream', mime_warning: mimeExtensionWarning(evidenceFile.name, evidenceFile.type), file_size: evidenceFile.size, sha256, exhibit_number, created_at: nowIso(), updated_at: nowIso(), file_blob: evidenceFile };
        await addEvidence(record); setMessage(`원본 저장 완료 · SHA-256 ${sha256.slice(0, 16)}…`);
      }
      const refreshed = await listEvidence(activeCase.case_id); setEvidence(refreshed); setEvidenceMeta(newEvidenceMeta(activeCase.case_id, activeCase.party_role, refreshed)); setEvidenceFile(null); setEditingEvidence(null); setNumberReason(''); setReview(null); setIntegrity([]);
    } catch (error) { setMessage(`증거 저장 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); }
  }

  function startEditEvidence(item: EvidenceRecord) {
    const { file_blob: _blob, ...meta } = item; setEvidenceMeta(meta); setEditingEvidence(item); setEvidenceFile(null); setNumberReason(''); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function verifyOne(item: EvidenceRecord) {
    setBusy(true); try { const result = await verifyEvidenceBlob(item); setIntegrity((prev) => [...prev.filter((x) => x.evidence_id !== item.evidence_id), result]); setMessage(result.ok ? `무결성 PASS: ${item.exhibit_number || item.evidence_id}` : `INTEGRITY FAILURE: ${result.error}`); } finally { setBusy(false); }
  }
  async function downloadOriginal(item: EvidenceRecord) {
    setBusy(true); try { const result = await verifyEvidenceBlob(item); if (!result.ok) throw new Error(`INTEGRITY FAILURE — 원본 다운로드 차단: ${result.error}`); downloadBlob(item.original_filename, item.file_blob); setMessage('SHA-256 재검증 후 원본을 다운로드했습니다.'); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }
  async function removeEvidence(item: EvidenceRecord) {
    if (!confirm(`${item.exhibit_number || item.display_title} 증거를 삭제합니까? 연결된 주장/타임라인 참조도 원자적으로 정리됩니다. 번호는 다른 증거에 자동 재배정되지 않습니다.`)) return;
    if (item.submission_status === '제출 완료' && !confirm('이 증거는 제출 완료로 기록되어 있습니다. 제출 기록도 함께 정리됩니다. 계속합니까?')) return;
    setBusy(true); try { const result = await deleteEvidenceAndCleanReferences(item.evidence_id); await refreshCaseData(item.case_id); setMessage(`증거 삭제 완료 · 주장 참조 ${result.cleanedClaims}건, 타임라인 ${result.cleanedFacts}건, 제출기록 ${result.deletedSubmissions}건 정리`); } catch (error) { setMessage(`증거 삭제 실패: ${String(error)}`); } finally { setBusy(false); }
  }

  async function saveClaim() {
    if (!activeCase) return; setBusy(true); try {
      const record = { ...claimForm, updated_at: nowIso() }; const errors = validateClaim(record, new Map(evidence.map((item) => [item.evidence_id, item]))); if (errors.length) throw new Error(errors.join('; '));
      await putClaim(record); setClaims(await listClaims(activeCase.case_id)); setClaimForm(newClaim(activeCase.case_id)); setEditingClaim(false); setMessage('주장과 입증취지 연결을 저장했습니다.');
    } catch (error) { setMessage(`주장 저장 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); }
  }
  async function removeClaim(id: string) { if (!confirm('이 주장 기록을 삭제합니까?')) return; await deleteClaim(id); if (activeCase) setClaims(await listClaims(activeCase.case_id)); }

  async function saveFact() {
    if (!activeCase) return; setBusy(true); try {
      const record = { ...factForm, updated_at: nowIso(), event_date: factForm.date_precision === 'UNKNOWN' ? 'UNKNOWN' : factForm.event_date }; const errors = validateFact(record, new Map(evidence.map((item) => [item.evidence_id, item]))); if (errors.length) throw new Error(errors.join('; '));
      await putFact(record); setFacts(await listFacts(activeCase.case_id)); setFactForm(newFact(activeCase.case_id)); setEditingFact(false); setMessage('사건 타임라인을 저장했습니다.');
    } catch (error) { setMessage(`타임라인 저장 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); }
  }
  async function removeFact(id: string) { if (!confirm('이 타임라인 기록을 삭제합니까?')) return; await deleteFact(id); if (activeCase) setFacts(await listFacts(activeCase.case_id)); }

  async function saveSubmission() {
    if (!activeCase) return; setBusy(true); try {
      const target = evidence.find((item) => item.evidence_id === submissionForm.evidence_id); if (!target) throw new Error('제출 증거를 선택하십시오');
      const check = await verifyEvidenceBlob(target); if (!check.ok || !check.actual_sha256) throw new Error(`INTEGRITY FAILURE — 제출 기록 생성 차단: ${check.error}`);
      const record: SubmissionRecord = { ...submissionForm, submitted_copy_hash: check.actual_sha256, created_at: nowIso() };
      await addSubmission(record); setSubmissions(await listSubmissions(activeCase.case_id)); setEvidence(await listEvidence(activeCase.case_id)); setSubmissionForm(newSubmission(activeCase.case_id)); setMessage('사용자 제출 기록을 저장했습니다. 실제 법원 접수 여부는 자동 확인하지 않습니다.');
    } catch (error) { setMessage(`제출 기록 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); }
  }

  async function runReview() {
    if (!activeCase) return; setBusy(true); try {
      const results = await Promise.all(evidence.map(verifyEvidenceBlob)); const allEvidence = await listAllEvidence(); const summary = buildReviewSummary(evidence, facts, claims, submissions, results, allEvidence); setIntegrity(results); setReview(summary); setMessage(`검토 완료: ${summary.verdict}`);
    } catch (error) { setMessage(`검토 실패: ${String(error)}`); } finally { setBusy(false); }
  }
  async function guardIntegrity() {
    const results = await Promise.all(evidence.map(verifyEvidenceBlob)); setIntegrity(results); const failed = results.filter((x) => !x.ok); if (failed.length) throw new Error(`INTEGRITY FAILURE — 출력/백업 차단: ${failed.map((x) => x.evidence_id).join(', ')}`); return results;
  }
  async function currentReview() {
    const results = await guardIntegrity(); const allEvidence = await listAllEvidence(); const summary = buildReviewSummary(evidence, facts, claims, submissions, results, allEvidence); setReview(summary); return summary;
  }
  async function exportHtml(printMode = false) {
    if (!activeCase) return; setBusy(true); try {
      const summary = await currentReview(); const html = buildCaseReportHtml(activeCase, evidence, claims, facts, submissions, summary);
      if (printMode) { const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); setMessage('A4 보고서를 새 탭에서 열었습니다. 브라우저 인쇄 → PDF 저장을 사용하십시오.'); }
      else { downloadText(`증거록_${activeCase.case_number || activeCase.case_id}.html`, html, 'text/html;charset=utf-8'); setMessage('무결성 재검증 후 HTML 보고서를 생성했습니다.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }
  async function exportCsv() { if (!activeCase) return; setBusy(true); try { await guardIntegrity(); downloadText(`증거목록_${activeCase.case_number || activeCase.case_id}.csv`, evidenceCsv(activeCase, evidence, claims), 'text/csv;charset=utf-8'); setMessage('CSV Formula Injection 방어가 적용된 증거목록을 생성했습니다.'); } catch (error) { setMessage(String(error)); } finally { setBusy(false); } }
  async function exportMetadata() { if (!activeCase) return; setBusy(true); try { await guardIntegrity(); downloadText(`증거록_메타데이터_${activeCase.case_number || activeCase.case_id}.json`, metadataJson(activeCase, evidence, claims, facts, submissions), 'application/json;charset=utf-8'); setMessage('원본 파일 바이트를 제외한 JSON 메타데이터를 내보냈습니다. 전체 백업은 ZIP을 사용하십시오.'); } catch (error) { setMessage(String(error)); } finally { setBusy(false); } }
  async function exportBackup() { if (!activeCase) return; setBusy(true); try { const zip = await buildCaseBackupZip(activeCase, evidence, claims, facts, submissions); downloadBlob(`증거록_전체백업_${activeCase.case_number || activeCase.case_id}.zip`, zip); setMessage('UNENCRYPTED 전체 백업 ZIP을 생성했습니다. 원본 파일과 해시가 포함됩니다. 안전한 위치에 보관하십시오.'); } catch (error) { setMessage(`백업 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); } }
  async function restoreBackup() {
    if (!restoreFile) return setMessage('복원할 ZIP 백업을 선택하십시오.');
    setBusy(true); try {
      const bundle = await validateCaseBackupZip(restoreFile); const existing = await getExistingIds();
      const conflicts = [existing.caseIds.includes(bundle.caseRecord.case_id) ? `case_id ${bundle.caseRecord.case_id}` : '', ...bundle.evidence.filter((x) => existing.evidenceIds.includes(x.evidence_id)).map((x) => `evidence_id ${x.evidence_id}`), ...bundle.claims.filter((x) => existing.claimIds.includes(x.claim_id)).map((x) => `claim_id ${x.claim_id}`), ...bundle.facts.filter((x) => existing.factIds.includes(x.fact_id)).map((x) => `fact_id ${x.fact_id}`), ...bundle.submissions.filter((x) => existing.submissionIds.includes(x.submission_id)).map((x) => `submission_id ${x.submission_id}`)].filter(Boolean);
      if (conflicts.length) throw new Error(`silent overwrite 금지 — ID 충돌: ${conflicts.join(', ')}`);
      await ensureStorageCapacity(bundle.manifest.total_raw_bytes); if (!confirm(`백업 검증 PASS. 사건 “${bundle.caseRecord.case_title}”을 새 사건으로 복원합니까? 기존 데이터는 복원 성공 전 삭제되지 않습니다.`)) return;
      await restoreAtomic(bundle);
      const restoredEvidence = await listEvidence(bundle.caseRecord.case_id); const checks = await Promise.all(restoredEvidence.map(verifyEvidenceBlob)); if (checks.some((x) => !x.ok)) throw new Error('복원 직후 원본 재검증에 실패했습니다');
      await refreshCases(bundle.caseRecord.case_id); setRestoreFile(null); setMessage(`복원 완료 및 원본 재검증 PASS: ${restoredEvidence.length}개 증거`);
    } catch (error) { setMessage(`복원 거부/실패: ${error instanceof Error ? error.message : String(error)} — 기존 데이터는 유지됩니다.`); } finally { setBusy(false); }
  }

  async function loadSampleCase() {
    setBusy(true); try {
      const sampleId = 'SAMPLE-2026-GADAN-12345'; if (cases.some((c) => c.case_id === sampleId)) throw new Error('가상 샘플 사건이 이미 존재합니다');
      const c: CaseRecord = { case_id: sampleId, case_title: '임대차보증금 반환 (가상 샘플)', case_number: '2026가단12345', court_name: '가상 테스트 법원', case_type: '임대차보증금 반환', party_role: '원고', opponent_name: '가상 임대인', case_status: '준비중', created_at: nowIso(), updated_at: nowIso() };
      await createCase(c);
      const specs = [
        ['EVD-SAMPLE-001', '갑 제1호증', '임대차계약서', '갑제1호증_임대차계약서_가상.txt', '[가상 테스트 자료]\n보증금 45,000,000원\n계약기간 2024-02-17 ~ 2026-02-16', '계약 체결 및 보증금 약정 내용', '계약 당사자가 보관한 사본', '2024-02-17'],
        ['EVD-SAMPLE-002', '갑 제2호증', '보증금 이체내역', '갑제2호증_보증금이체내역_가상.txt', '[가상 테스트 자료]\n2024-02-16 보증금 45,000,000원 이체', '보증금 지급 사실', '가상 은행 이체 기록', '2024-02-16'],
        ['EVD-SAMPLE-003', '갑 제3호증', '계약 종료 통지', '갑제3호증_계약종료통지_가상.txt', '[가상 테스트 자료]\n2025-12-01 계약 종료 및 반환 요청 통지', '계약 종료 의사 표시 및 반환 요청', '사용자가 보관한 가상 통지 기록', '2025-12-01'],
      ] as const;
      for (let i = 0; i < specs.length; i++) {
        const [evidence_id, exhibit_number, display_title, filename, contents, proof, source, occurred] = specs[i]; const blob = new Blob([contents], { type: 'text/plain' }); const hash = await sha256Blob(blob);
        await addEvidence({ evidence_id, case_id: c.case_id, original_filename: filename, display_title, file_type: 'TXT', mime_type: 'text/plain', mime_warning: '', file_size: blob.size, sha256: hash, source_description: source, created_or_occurred_at: occurred, acquired_at: '2026-10-21', verification_status: 'UNVERIFIED', notes: '민감정보 없는 가상 테스트 자료', proof_purpose: proof, exhibit_prefix: '갑', exhibit_main_no: i + 1, exhibit_sub_no: null, exhibit_number, number_history: [], submission_status: '미제출', created_at: nowIso(), updated_at: nowIso(), file_blob: blob });
      }
      await putClaim({ claim_id: 'CLM-SAMPLE-001', case_id: c.case_id, claim_statement: '임대차계약 종료 후 보증금 반환이 필요하다는 사용자 주장', proof_purpose: '계약관계, 보증금 지급 및 종료 통지 자료를 함께 검토', linked_supporting_evidence: ['EVD-SAMPLE-001', 'EVD-SAMPLE-002', 'EVD-SAMPLE-003'], linked_contradicting_evidence: [], review_status: '관련 증거 있음', notes: '관련 증거가 있다는 의미이며 법원이 사실을 인정했다는 의미가 아님', created_at: nowIso(), updated_at: nowIso() });
      await putFact({ fact_id: 'FACT-SAMPLE-001', case_id: c.case_id, event_date: '2024-02-16', date_precision: 'DATE', event_description: '보증금 45,000,000원을 지급한 것으로 기록됨', linked_evidence_ids: ['EVD-SAMPLE-002'], review_status: '관련 증거 있음', created_at: nowIso(), updated_at: nowIso() });
      await putFact({ fact_id: 'FACT-SAMPLE-002', case_id: c.case_id, event_date: '2025-12-01', date_precision: 'DATE', event_description: '계약 종료 및 보증금 반환 요청 통지가 있었다고 기록됨', linked_evidence_ids: ['EVD-SAMPLE-003'], review_status: '관련 증거 있음', created_at: nowIso(), updated_at: nowIso() });
      await refreshCases(c.case_id); setTab('evidence'); setMessage('가상 임대차보증금 반환 샘플 사건을 생성했습니다. 모든 자료는 가상 테스트 데이터입니다.');
    } catch (error) { setMessage(`샘플 생성 실패: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(false); }
  }

  async function wipeAll() {
    if (!confirm('이 브라우저의 증거록 데이터 전체를 삭제합니까? 먼저 모든 사건을 백업하십시오.')) return;
    const phrase = prompt('전체 삭제 확인을 위해 DELETE를 입력하십시오.'); if (phrase !== 'DELETE') return setMessage('전체 삭제가 취소되었습니다.');
    setBusy(true); try { await clearAllData(); await refreshCases(); setMessage('이 브라우저의 증거록 데이터 전체를 삭제했습니다.'); } finally { setBusy(false); }
  }

  const integrityMap = new Map(integrity.map((item) => [item.evidence_id, item]));

  return <div className="app-shell">
    <header className="topbar"><div><div className="brand">증거록</div><div className="tagline">흩어진 증거를, 명확한 기록으로.</div></div><div className="local-badge">● LOCAL ONLY · 외부 AI/API 없음</div></header>
    <div className="privacy-banner"><strong>개인정보 보호 안내</strong> 사건 자료와 원본 파일은 이 브라우저의 IndexedDB에 저장됩니다. 로컬 저장은 암호화를 의미하지 않으며, 브라우저 데이터 삭제 시 자료가 사라질 수 있습니다. 정기적으로 전체 백업을 별도 안전 장소에 보관하십시오.</div>
    {message && <div className="message" role="status">{message}</div>}
    <div className="workspace">
      <aside className="sidebar">
        <section className="panel sticky-panel"><div className="section-title"><h2>사건 관리</h2><span>{cases.length}건</span></div>
          <input placeholder="사건명·사건번호 검색" value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)} />
          <div className="case-list">{visibleCases.map((item) => <button key={item.case_id} className={`case-card ${item.case_id === activeCaseId ? 'active' : ''}`} onClick={() => setActiveCaseId(item.case_id)}><strong>{item.case_title}</strong><span>{item.case_number || '사건번호 미부여'}</span><small>{item.party_role} · {item.case_status}</small></button>)}{!cases.length && <p className="muted">등록된 사건이 없습니다.</p>}</div>
          <hr />
          <h3>{editingCase ? '사건 수정' : '새 사건'}</h3>
          <label>사건명<input value={caseForm.case_title} onChange={(e) => setCaseForm({ ...caseForm, case_title: e.target.value })} placeholder="예: 임대차보증금 반환" /></label>
          <label>사건번호 <small>(접수 전 공란 가능)</small><input value={caseForm.case_number} onChange={(e) => setCaseForm({ ...caseForm, case_number: e.target.value })} placeholder="예: 2026가단12345" /></label>
          <label>법원명 <small>(선택)</small><input value={caseForm.court_name} onChange={(e) => setCaseForm({ ...caseForm, court_name: e.target.value })} /></label>
          <label>사건 유형<select value={caseForm.case_type} onChange={(e) => setCaseForm({ ...caseForm, case_type: e.target.value })}>{CASE_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <div className="two-col"><label>역할<select value={caseForm.party_role} onChange={(e) => setCaseForm({ ...caseForm, party_role: e.target.value as PartyRole })}><option>원고</option><option>피고</option><option>기타</option></select></label><label>상태<select value={caseForm.case_status} onChange={(e) => setCaseForm({ ...caseForm, case_status: e.target.value as CaseRecord['case_status'] })}><option>준비중</option><option>진행중</option><option>종결</option><option>보관</option></select></label></div>
          <label>상대방 <small>(선택)</small><input value={caseForm.opponent_name} onChange={(e) => setCaseForm({ ...caseForm, opponent_name: e.target.value })} /></label>
          <div className="button-row"><button className="primary" disabled={busy} onClick={saveCase}>{editingCase ? '사건 수정 저장' : '사건 생성'}</button>{editingCase && <button onClick={() => { setEditingCase(false); setCaseForm(newCase()); }}>취소</button>}</div>
          <button className="ghost full" disabled={busy} onClick={loadSampleCase}>가상 임대차 사건 불러오기</button>
        </section>
      </aside>

      <main className="main-content">{!activeCase ? <section className="empty-state"><h1>민사소송 증거 정리, 증거록</h1><p>왼쪽에서 사건을 생성하거나 민감정보 없는 가상 샘플 사건을 불러오십시오.</p><p>{PRODUCT_NOTICE}</p></section> : <>
        <section className="case-header"><div><span className="eyebrow">{activeCase.case_number || '사건번호 미부여'}</span><h1>{activeCase.case_title}</h1><p>{activeCase.court_name || '법원 미기록'} · {activeCase.party_role} · {activeCase.case_type}</p></div><div className="button-row"><button onClick={() => startEditCase(activeCase)}>사건 정보 수정</button><button className="danger-outline" onClick={() => removeCase(activeCase)}>사건 삭제</button></div></section>
        <nav className="tabs">{([['evidence', '증거 보관함'], ['claims', '주장·입증취지'], ['timeline', '사건 타임라인'], ['submissions', '제출 기록'], ['review', '검토·출력'], ['backup', '백업·복원']] as [Tab, string][]).map(([key, label]) => <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>

        {tab === 'evidence' && <div className="content-grid"><section className="panel"><div className="section-title"><h2>{editingEvidence ? '증거 정보 수정' : '원본 증거 등록'}</h2><span>단일 파일 최대 20MiB</span></div>
          <p className="help">원본 파일은 앱에서 실행하거나 OCR하지 않고 바이너리 그대로 보관합니다. 등록 시 SHA-256을 계산하며, 해시는 진위나 법적 증거능력을 보증하지 않습니다.</p>
          {!editingEvidence && <label>원본 파일<input type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.mp3,.m4a,.mp4" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} /></label>}
          {editingEvidence && <div className="immutable-box">원본 파일: <strong>{editingEvidence.original_filename}</strong><br />SHA-256: <code>{editingEvidence.sha256}</code><br />원본 바이트·해시·파일명은 수정할 수 없습니다.</div>}
          <label>증거명<input value={evidenceMeta.display_title} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, display_title: e.target.value })} placeholder="예: 임대차계약서" /></label>
          <div className="three-col"><label>접두사<input value={evidenceMeta.exhibit_prefix} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, exhibit_prefix: e.target.value, exhibit_number: formatExhibitNumber(e.target.value, evidenceMeta.exhibit_main_no, evidenceMeta.exhibit_sub_no) })} /></label><label>호증 번호<input type="number" min="1" value={evidenceMeta.exhibit_main_no ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setEvidenceMeta({ ...evidenceMeta, exhibit_main_no: v, exhibit_number: formatExhibitNumber(evidenceMeta.exhibit_prefix, v, evidenceMeta.exhibit_sub_no) }); }} /></label><label>가지번호 <small>(선택)</small><input type="number" min="1" value={evidenceMeta.exhibit_sub_no ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setEvidenceMeta({ ...evidenceMeta, exhibit_sub_no: v, exhibit_number: formatExhibitNumber(evidenceMeta.exhibit_prefix, evidenceMeta.exhibit_main_no, v) }); }} /></label></div>
          <div className="number-preview">표시 증거번호: <strong>{formatExhibitNumber(evidenceMeta.exhibit_prefix, evidenceMeta.exhibit_main_no, evidenceMeta.exhibit_sub_no) || '미부여'}</strong></div>
          {editingEvidence && <label>번호 변경 사유 <small>(번호 변경 시 이력 기록)</small><input value={numberReason} onChange={(e) => setNumberReason(e.target.value)} placeholder="예: 제출 전 순서 조정" /></label>}
          <label>작성자 또는 출처<input value={evidenceMeta.source_description} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, source_description: e.target.value })} placeholder="예: 계약 당사자 보관 사본" /></label>
          <label>작성/발생일 <small>YYYY-MM-DD, YYYY-MM 또는 UNKNOWN</small><input value={evidenceMeta.created_or_occurred_at} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, created_or_occurred_at: e.target.value })} /></label>
          <label>취득일<input value={evidenceMeta.acquired_at} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, acquired_at: e.target.value })} /></label>
          <label>입증취지<textarea rows={2} value={evidenceMeta.proof_purpose} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, proof_purpose: e.target.value })} placeholder="이 증거로 무엇을 확인하려는지 사용자가 기록" /></label>
          <div className="two-col"><label>검증 상태<select value={evidenceMeta.verification_status} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, verification_status: e.target.value as VerificationStatus })}><option>UNVERIFIED</option><option>VERIFIED</option><option>DISPUTED</option></select></label><label>제출 상태<select value={evidenceMeta.submission_status} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, submission_status: e.target.value as SubmissionStatus })}>{SUBMISSION_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label></div>
          <label>메모<textarea rows={2} value={evidenceMeta.notes} onChange={(e) => setEvidenceMeta({ ...evidenceMeta, notes: e.target.value })} /></label>
          <div className="button-row"><button className="primary" disabled={busy} onClick={saveEvidence}>{editingEvidence ? '메타데이터 수정 저장' : '원본 저장 및 해시 계산'}</button>{editingEvidence && <button onClick={() => { setEditingEvidence(null); setEvidenceMeta(newEvidenceMeta(activeCase.case_id, activeCase.party_role, evidence)); }}>취소</button>}</div>
        </section><section className="panel wide"><div className="section-title"><h2>증거 목록</h2><span>{evidence.length}개</span></div>{evidence.length === 0 ? <p className="muted">등록된 증거가 없습니다.</p> : <div className="table-wrap"><table><thead><tr><th>증거번호</th><th>증거명 / 원본</th><th>SHA-256</th><th>상태</th><th>무결성</th><th>동작</th></tr></thead><tbody>{evidence.map((item) => { const check = integrityMap.get(item.evidence_id); return <tr key={item.evidence_id}><td><strong>{item.exhibit_number || '미부여'}</strong>{item.number_history.length > 0 && <small>{item.number_history.length}회 변경</small>}</td><td>{item.display_title}<small>{item.original_filename} · {(item.file_size / 1024).toFixed(1)} KiB</small>{item.mime_warning && <small className="warning-text">⚠ {item.mime_warning}</small>}</td><td><code>{item.sha256.slice(0, 12)}…</code></td><td>{item.verification_status}<small>{item.submission_status}</small></td><td>{check ? <span className={check.ok ? 'pass' : 'fail'}>{check.ok ? '✓ PASS' : '✕ FAILURE'}</span> : '미검증'}</td><td><div className="compact-actions"><button onClick={() => verifyOne(item)}>검증</button><button onClick={() => downloadOriginal(item)}>원본</button><button onClick={() => startEditEvidence(item)}>수정</button><button className="danger-link" onClick={() => removeEvidence(item)}>삭제</button></div></td></tr>; })}</tbody></table></div>}</section></div>}

        {tab === 'claims' && <div className="content-grid"><section className="panel"><h2>{editingClaim ? '주장 수정' : '주장·입증취지 등록'}</h2><label>사용자 주장<textarea rows={3} value={claimForm.claim_statement} onChange={(e) => setClaimForm({ ...claimForm, claim_statement: e.target.value })} /></label><label>입증취지<textarea rows={3} value={claimForm.proof_purpose} onChange={(e) => setClaimForm({ ...claimForm, proof_purpose: e.target.value })} /></label><label>검토 상태<select value={claimForm.review_status} onChange={(e) => setClaimForm({ ...claimForm, review_status: e.target.value as ClaimReviewStatus })}>{CLAIM_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label><h3>지원 증거</h3><EvidencePicker evidence={evidence} selected={claimForm.linked_supporting_evidence} onChange={(ids) => setClaimForm({ ...claimForm, linked_supporting_evidence: ids })} /><h3>반대 증거</h3><EvidencePicker evidence={evidence} selected={claimForm.linked_contradicting_evidence} onChange={(ids) => setClaimForm({ ...claimForm, linked_contradicting_evidence: ids })} /><label>메모<textarea rows={2} value={claimForm.notes} onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })} /></label><div className="button-row"><button className="primary" disabled={busy} onClick={saveClaim}>{editingClaim ? '주장 수정 저장' : '주장 저장'}</button>{editingClaim && <button onClick={() => { setClaimForm(newClaim(activeCase.case_id)); setEditingClaim(false); }}>취소</button>}</div></section><section className="panel wide"><h2>주장·증거 연결표</h2><p className="help">“관련 증거 있음”은 증거가 연결되었다는 뜻일 뿐, 법원이 사실을 인정했다는 뜻이 아닙니다.</p>{claims.map((item) => <article className="record-card" key={item.claim_id}><div><strong>{item.claim_statement}</strong><p>입증취지: {item.proof_purpose || '미기록'}</p><small>지원: {item.linked_supporting_evidence.map((id) => evidence.find((e) => e.evidence_id === id)?.exhibit_number || id).join(', ') || '없음'} · 반대: {item.linked_contradicting_evidence.map((id) => evidence.find((e) => e.evidence_id === id)?.exhibit_number || id).join(', ') || '없음'}</small></div><div><span className="status-pill">{item.review_status}</span><div className="compact-actions"><button onClick={() => { setClaimForm(item); setEditingClaim(true); }}>수정</button><button className="danger-link" onClick={() => removeClaim(item.claim_id)}>삭제</button></div></div></article>)}{!claims.length && <p className="muted">등록된 주장이 없습니다.</p>}</section></div>}

        {tab === 'timeline' && <div className="content-grid"><section className="panel"><h2>{editingFact ? '사실관계 수정' : '사건 타임라인 등록'}</h2><label>날짜 정밀도<select value={factForm.date_precision} onChange={(e) => { const precision = e.target.value as DatePrecision; setFactForm({ ...factForm, date_precision: precision, event_date: precision === 'UNKNOWN' ? 'UNKNOWN' : '' }); }}>{DATE_PRECISIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>{factForm.date_precision !== 'UNKNOWN' && <label>날짜 값<input value={factForm.event_date} onChange={(e) => setFactForm({ ...factForm, event_date: e.target.value })} placeholder={factForm.date_precision === 'MONTH' ? '2026-10' : factForm.date_precision === 'DATE' ? '2026-10-21' : '2026-10-21T13:00:00+09:00'} /></label>}<label>사실관계 기록<textarea rows={4} value={factForm.event_description} onChange={(e) => setFactForm({ ...factForm, event_description: e.target.value })} /></label><label>검토 상태<select value={factForm.review_status} onChange={(e) => setFactForm({ ...factForm, review_status: e.target.value as FactReviewStatus })}>{FACT_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label><h3>관련 증거</h3><EvidencePicker evidence={evidence} selected={factForm.linked_evidence_ids} onChange={(ids) => setFactForm({ ...factForm, linked_evidence_ids: ids })} /><div className="button-row"><button className="primary" disabled={busy} onClick={saveFact}>{editingFact ? '타임라인 수정 저장' : '타임라인 저장'}</button>{editingFact && <button onClick={() => { setFactForm(newFact(activeCase.case_id)); setEditingFact(false); }}>취소</button>}</div></section><section className="panel wide"><h2>시간순 기록</h2>{sortFactsTimeline(facts).map((item) => <article className="timeline-item" key={item.fact_id}><div className="timeline-date">{displayTimelineDate(item.event_date, item.date_precision)}</div><div><strong>{item.event_description}</strong><p>{item.linked_evidence_ids.map((id) => evidence.find((e) => e.evidence_id === id)?.exhibit_number || id).join(', ') || '관련 증거 없음'}</p><small>{item.review_status}</small></div><div className="compact-actions"><button onClick={() => { setFactForm(item); setEditingFact(true); }}>수정</button><button className="danger-link" onClick={() => removeFact(item.fact_id)}>삭제</button></div></article>)}{!facts.length && <p className="muted">등록된 타임라인이 없습니다.</p>}</section></div>}

        {tab === 'submissions' && <div className="content-grid"><section className="panel"><h2>제출 기록</h2><p className="help">실제 법원 접수 여부를 자동 확인하지 않습니다. 사용자가 기록하는 제출 이력입니다. 최신 파일 형식·용량·절차는 전자소송포털에서 별도로 확인하십시오.</p><label>증거<select value={submissionForm.evidence_id} onChange={(e) => setSubmissionForm({ ...submissionForm, evidence_id: e.target.value })}><option value="">선택</option>{evidence.map((item) => <option key={item.evidence_id} value={item.evidence_id}>{item.exhibit_number || '미부여'} — {item.display_title}</option>)}</select></label><label>제출일<input value={submissionForm.submission_date} onChange={(e) => setSubmissionForm({ ...submissionForm, submission_date: e.target.value })} /></label><label>제출 방법<input value={submissionForm.submission_method} onChange={(e) => setSubmissionForm({ ...submissionForm, submission_method: e.target.value })} placeholder="예: 전자소송포털 (사용자 기록)" /></label><label>제출 참조<input value={submissionForm.submission_reference} onChange={(e) => setSubmissionForm({ ...submissionForm, submission_reference: e.target.value })} placeholder="접수번호 등 사용자가 확인한 값" /></label><label>접수증/확인서 증거 <small>(선택)</small><select value={submissionForm.receipt_attachment_id} onChange={(e) => setSubmissionForm({ ...submissionForm, receipt_attachment_id: e.target.value })}><option value="">없음</option>{evidence.map((item) => <option key={item.evidence_id} value={item.evidence_id}>{item.exhibit_number || '미부여'} — {item.display_title}</option>)}</select></label><button className="primary" disabled={busy} onClick={saveSubmission}>무결성 검증 후 제출 기록 저장</button></section><section className="panel wide"><h2>사용자 기록 제출 이력</h2>{submissions.length ? <div className="table-wrap"><table><thead><tr><th>제출일</th><th>증거</th><th>방법</th><th>참조</th><th>제출 사본 해시</th><th></th></tr></thead><tbody>{submissions.map((item) => <tr key={item.submission_id}><td>{item.submission_date}</td><td>{evidence.find((e) => e.evidence_id === item.evidence_id)?.exhibit_number || item.evidence_id}</td><td>{item.submission_method || '미기록'}</td><td>{item.submission_reference || '미기록'}</td><td><code>{item.submitted_copy_hash.slice(0, 12)}…</code></td><td><button className="danger-link" onClick={async () => { if (confirm('이 제출 기록만 삭제합니까?')) { await deleteSubmission(item.submission_id); setSubmissions(await listSubmissions(activeCase.case_id)); } }}>삭제</button></td></tr>)}</tbody></table></div> : <p className="muted">제출 기록이 없습니다.</p>}</section></div>}

        {tab === 'review' && <><section className="action-panel"><div><h2>Evidence Review</h2><p>원본 해시, 번호 중복, 증거 없는 주장, 날짜 미상, 출처 누락, 사건 간 참조를 점검합니다.</p></div><button className="primary" disabled={busy} onClick={runReview}>전체 무결성 및 검토 실행</button></section>{review && <section className={`review-card ${review.verdict === 'INTEGRITY FAILURE' ? 'critical' : ''}`}><div><span className="eyebrow">판정</span><h2>{review.verdict}</h2><p>READY FOR HUMAN REVIEW는 법적 적합성, 제출 가능성 또는 승소 가능성을 보증하지 않습니다.</p></div><div className="metric-grid"><div><strong>{review.total_evidence}</strong><span>전체 증거</span></div><div><strong>{review.hash_failures}</strong><span>해시 실패</span></div><div><strong>{review.unnumbered_evidence}</strong><span>번호 미부여</span></div><div><strong>{review.claims_without_support}</strong><span>증거 없는 주장</span></div><div><strong>{review.claims_with_contradictions}</strong><span>반대 증거 연결</span></div><div><strong>{review.unknown_dates}</strong><span>날짜 미상</span></div><div><strong>{review.missing_sources}</strong><span>출처 누락</span></div><div><strong>{review.cross_case_reference_errors}</strong><span>사건 간 참조 오류</span></div></div></section>}<section className="panel"><h2>보고서 및 내보내기</h2><p className="help">모든 출력 직전에 저장된 원본의 SHA-256을 다시 계산합니다. 불일치가 있으면 정상 출력이 차단됩니다.</p><div className="export-grid"><button onClick={() => exportHtml(false)}>A4 HTML 보고서</button><button onClick={() => exportHtml(true)}>인쇄 / PDF 저장 화면</button><button onClick={exportCsv}>증거목록 CSV</button><button onClick={exportMetadata}>메타데이터 JSON</button></div><div className="notice-box">{PRODUCT_NOTICE}</div></section></>}

        {tab === 'backup' && <div className="content-grid"><section className="panel"><h2>사건 전체 백업</h2><p className="help">ZIP에는 manifest, 사건/증거/주장/타임라인/제출 메타데이터와 원본 파일 전체가 포함됩니다. 백업은 암호화되지 않습니다.</p><button className="primary full" disabled={busy} onClick={exportBackup}>무결성 검증 후 전체 ZIP 백업</button><div className="warning-box">⚠ 백업 파일 자체에 민감한 사건 자료가 포함됩니다. 안전한 위치에 별도 보관하십시오. “로컬 저장”은 “암호화 저장”을 의미하지 않습니다.</div></section><section className="panel"><h2>백업 복원</h2><p className="help">경로 조작, 잘못된 스키마, 크기 한도, 원본 해시, 사건 간 참조 및 ID 충돌을 검사한 뒤 하나의 IndexedDB 트랜잭션으로 복원합니다.</p><input type="file" accept=".zip,application/zip" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} /><button className="primary full" disabled={busy || !restoreFile} onClick={restoreBackup}>백업 검증 및 복원</button><p className="muted">복원 실패 시 기존 사건 데이터를 삭제하지 않습니다. 동일 ID가 이미 존재하면 silent overwrite 없이 복원을 차단합니다.</p></section><section className="panel wide"><h2>로컬 데이터 관리</h2><p>공용 PC에서는 사용하지 않는 것을 권장합니다. 브라우저 데이터 정리 기능을 실행하면 IndexedDB 자료가 삭제될 수 있습니다.</p><button className="danger-outline" onClick={wipeAll}>이 브라우저의 증거록 데이터 전체 삭제</button></section></div>}
      </>}</main>
    </div>
    <footer><strong>증거록 V0.1 · Korea / Civil Litigation</strong><span>법원 공식 서비스가 아닙니다 · 자동 법률 판단/AI 증거 해석/전자소송 자동 제출 없음</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
