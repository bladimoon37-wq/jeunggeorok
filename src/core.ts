export type CaseStatus = '준비중' | '진행중' | '종결' | '보관';
export type PartyRole = '원고' | '피고' | '기타';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED';
export type SubmissionStatus = '미제출' | '제출 준비' | '제출 완료' | '보완 필요' | '제출 여부 미확인';
export type ClaimReviewStatus = '사용자 주장' | '관련 증거 있음' | '다툼 있음' | '추가 확인 필요';
export type FactReviewStatus = '사용자 기록' | '관련 증거 있음' | '다툼 있음' | '추가 확인 필요';
export type DatePrecision = 'TIMESTAMP' | 'DATE' | 'MONTH' | 'UNKNOWN';
export type ReviewVerdict = 'REVIEW REQUIRED' | 'UNVERIFIED' | 'INTEGRITY FAILURE' | 'READY FOR HUMAN REVIEW';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_EVIDENCE_PER_CASE = 100;
export const MAX_BACKUP_INPUT_BYTES = 40 * 1024 * 1024;
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 140;
export const BACKUP_TYPE = 'JEUNGGEOROK_CASE_BACKUP';
export const BACKUP_SCHEMA_VERSION = '0.1.0';
export const PRODUCT_NOTICE = '이 문서는 사용자가 등록한 자료를 정리한 것으로, 사실의 진실성, 법적 증거능력, 법원 제출 적합성 또는 소송 결과를 보증하지 않습니다.';

export interface CaseRecord {
  case_id: string;
  case_title: string;
  case_number: string;
  court_name: string;
  case_type: string;
  party_role: PartyRole;
  opponent_name: string;
  case_status: CaseStatus;
  created_at: string;
  updated_at: string;
}

export interface EvidenceNumberHistory {
  changed_at: string;
  previous_number: string;
  new_number: string;
  reason: string;
  changed_after_submission: boolean;
}

export interface EvidenceRecord {
  evidence_id: string;
  case_id: string;
  original_filename: string;
  display_title: string;
  file_type: string;
  mime_type: string;
  mime_warning: string;
  file_size: number;
  sha256: string;
  source_description: string;
  created_or_occurred_at: string;
  acquired_at: string;
  verification_status: VerificationStatus;
  notes: string;
  proof_purpose: string;
  exhibit_prefix: string;
  exhibit_main_no: number | null;
  exhibit_sub_no: number | null;
  exhibit_number: string;
  number_history: EvidenceNumberHistory[];
  submission_status: SubmissionStatus;
  created_at: string;
  updated_at: string;
  file_blob: Blob;
}

export interface ClaimRecord {
  claim_id: string;
  case_id: string;
  claim_statement: string;
  proof_purpose: string;
  linked_supporting_evidence: string[];
  linked_contradicting_evidence: string[];
  review_status: ClaimReviewStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface FactRecord {
  fact_id: string;
  case_id: string;
  event_date: string;
  date_precision: DatePrecision;
  event_description: string;
  linked_evidence_ids: string[];
  review_status: FactReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface SubmissionRecord {
  submission_id: string;
  case_id: string;
  evidence_id: string;
  submission_date: string;
  submission_method: string;
  submission_reference: string;
  submitted_copy_hash: string;
  receipt_attachment_id: string;
  created_at: string;
}

export interface IntegrityResult {
  evidence_id: string;
  expected_sha256: string;
  actual_sha256: string | null;
  ok: boolean;
  error?: string;
}

export interface ReviewSummary {
  total_evidence: number;
  unnumbered_evidence: number;
  hash_failures: number;
  missing_originals: number;
  duplicate_hash_groups: number;
  duplicate_exhibit_numbers: number;
  claims_without_support: number;
  claims_with_contradictions: number;
  unknown_dates: number;
  missing_sources: number;
  cross_case_reference_errors: number;
  verdict: ReviewVerdict;
}

export interface BackupManifestEntry {
  evidence_id: string;
  path: string;
  original_filename: string;
  file_size: number;
  sha256: string;
}

export interface BackupManifest {
  package_type: typeof BACKUP_TYPE;
  schema_version: typeof BACKUP_SCHEMA_VERSION;
  product: '증거록';
  exported_at: string;
  case_id: string;
  encrypted: false;
  file_count: number;
  total_raw_bytes: number;
  entries: BackupManifestEntry[];
  metadata_sha256: Record<string, string>;
  warning: string;
}

export interface RestoreBundle {
  caseRecord: CaseRecord;
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
  facts: FactRecord[];
  submissions: SubmissionRecord[];
  manifest: BackupManifest;
}

const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;
const TZ_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'txt', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'mp3', 'm4a', 'mp4']);

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix: string) {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${raw.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function validateExactDate(value: string) {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function validateMonth(value: string) {
  if (!MONTH_ONLY.test(value)) return false;
  const [, month] = value.split('-').map(Number);
  return month >= 1 && month <= 12;
}

export function validateTimezoneTimestamp(value: string) {
  return TZ_ISO.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateLooseEvidenceDate(value: string) {
  return value === 'UNKNOWN' || validateMonth(value) || validateExactDate(value) || validateTimezoneTimestamp(value);
}

export function validateTimelineDate(value: string, precision: DatePrecision) {
  if (precision === 'UNKNOWN') return value === 'UNKNOWN';
  if (precision === 'MONTH') return validateMonth(value);
  if (precision === 'DATE') return validateExactDate(value);
  return validateTimezoneTimestamp(value);
}

export function displayTimelineDate(value: string, precision: DatePrecision) {
  if (precision === 'UNKNOWN') return '날짜 미상';
  if (precision === 'MONTH') return `${value} (월까지만 확인)`;
  if (precision === 'DATE') return value;
  return value;
}

export function sortFactsTimeline(facts: FactRecord[]) {
  const key = (fact: FactRecord) => {
    if (fact.date_precision === 'UNKNOWN') return ['9999-99-99', 9, ''];
    if (fact.date_precision === 'MONTH') return [`${fact.event_date}-00`, 0, ''];
    if (fact.date_precision === 'DATE') return [fact.event_date, 1, ''];
    return [fact.event_date.slice(0, 10), 2, fact.event_date];
  };
  return [...facts].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    return String(ka[0]).localeCompare(String(kb[0])) || Number(ka[1]) - Number(kb[1]) || String(ka[2]).localeCompare(String(kb[2]));
  });
}

export function defaultExhibitPrefix(role: PartyRole) {
  return role === '피고' ? '을' : role === '원고' ? '갑' : '증';
}

export function formatExhibitNumber(prefix: string, mainNo: number | null, subNo: number | null) {
  if (!Number.isInteger(mainNo) || (mainNo ?? 0) <= 0) return '';
  const safePrefix = prefix.trim() || '증';
  const sub = Number.isInteger(subNo) && (subNo ?? 0) > 0 ? `의 ${subNo}` : '';
  return `${safePrefix} 제${mainNo}호증${sub}`;
}

export function nextExhibitNumber(evidence: EvidenceRecord[], prefix: string) {
  const used = evidence.filter((e) => e.exhibit_prefix === prefix && e.exhibit_main_no != null).map((e) => e.exhibit_main_no as number);
  return used.length ? Math.max(...used) + 1 : 1;
}

export function findDuplicateExhibitNumbers(evidence: EvidenceRecord[]) {
  const groups = new Map<string, string[]>();
  for (const item of evidence) {
    if (!item.exhibit_number.trim()) continue;
    const list = groups.get(item.exhibit_number) ?? [];
    list.push(item.evidence_id);
    groups.set(item.exhibit_number, list);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([exhibit_number, evidence_ids]) => ({ exhibit_number, evidence_ids }));
}

export function appendNumberHistory(
  existing: EvidenceRecord,
  nextNumber: string,
  reason: string,
  changedAt = nowIso(),
) {
  if (existing.exhibit_number === nextNumber) return existing.number_history;
  return [...existing.number_history, {
    changed_at: changedAt,
    previous_number: existing.exhibit_number,
    new_number: nextNumber,
    reason: reason.trim() || '사용자 변경',
    changed_after_submission: existing.submission_status === '제출 완료',
  }];
}

export function extensionOf(filename: string) {
  const clean = filename.trim().toLowerCase();
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index + 1) : '';
}

export function isSupportedEvidenceFilename(filename: string) {
  return SUPPORTED_EXTENSIONS.has(extensionOf(filename));
}

export function mimeExtensionWarning(filename: string, mimeType: string) {
  const ext = extensionOf(filename);
  if (!SUPPORTED_EXTENSIONS.has(ext)) return `V0.1 기본 지원 형식이 아닙니다: .${ext || '(확장자 없음)'}`;
  const mime = (mimeType || '').toLowerCase();
  if (!mime || mime === 'application/octet-stream') return '';
  const expected: Record<string, string[]> = {
    pdf: ['application/pdf'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], txt: ['text/plain'],
    hwp: ['application/x-hwp', 'application/haansofthwp'], hwpx: ['application/vnd.hancom.hwpx', 'application/zip'],
    doc: ['application/msword'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
    xls: ['application/vnd.ms-excel'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
    mp3: ['audio/mpeg', 'audio/mp3'], m4a: ['audio/mp4', 'audio/x-m4a'], mp4: ['video/mp4'],
  };
  const allowed = expected[ext] ?? [];
  if (allowed.length && !allowed.includes(mime)) return `확장자 .${ext}와 브라우저 MIME(${mime})이 일치하지 않을 수 있습니다. 원본은 실행하지 않고 바이너리로만 보관합니다.`;
  return '';
}

export function validateCase(record: CaseRecord) {
  const errors: string[] = [];
  if (!record.case_id.trim()) errors.push('case_id is required');
  if (!record.case_title.trim()) errors.push('사건명은 필수입니다');
  if (!record.case_type.trim()) errors.push('사건 유형은 필수입니다');
  if (!['원고', '피고', '기타'].includes(record.party_role)) errors.push('당사자 역할이 올바르지 않습니다');
  if (!['준비중', '진행중', '종결', '보관'].includes(record.case_status)) errors.push('사건 상태가 올바르지 않습니다');
  return errors;
}

export function validateEvidenceMeta(record: Omit<EvidenceRecord, 'file_blob'>) {
  const errors: string[] = [];
  if (!record.evidence_id.trim()) errors.push('evidence_id is required');
  if (!record.case_id.trim()) errors.push('case_id is required');
  if (!record.original_filename.trim()) errors.push('원본 파일명은 필수입니다');
  if (!record.display_title.trim()) errors.push('증거명은 필수입니다');
  if (!Number.isInteger(record.file_size) || record.file_size < 0 || record.file_size > MAX_FILE_BYTES) errors.push('파일 크기가 허용 범위를 벗어났습니다');
  if (!SHA256_HEX.test(record.sha256)) errors.push('SHA-256 형식이 올바르지 않습니다');
  if (!validateLooseEvidenceDate(record.created_or_occurred_at)) errors.push('작성/발생일 형식이 올바르지 않습니다');
  if (!validateExactDate(record.acquired_at) && !validateTimezoneTimestamp(record.acquired_at)) errors.push('취득일 형식이 올바르지 않습니다');
  if (!['UNVERIFIED', 'VERIFIED', 'DISPUTED'].includes(record.verification_status)) errors.push('검증 상태가 올바르지 않습니다');
  if (!['미제출', '제출 준비', '제출 완료', '보완 필요', '제출 여부 미확인'].includes(record.submission_status)) errors.push('제출 상태가 올바르지 않습니다');
  if (record.exhibit_number !== formatExhibitNumber(record.exhibit_prefix, record.exhibit_main_no, record.exhibit_sub_no)) errors.push('증거번호 표시값이 번호 구성과 일치하지 않습니다');
  return errors;
}

export function validateClaim(record: ClaimRecord, evidenceById: Map<string, EvidenceRecord>) {
  const errors: string[] = [];
  if (!record.claim_id.trim()) errors.push('claim_id is required');
  if (!record.case_id.trim()) errors.push('case_id is required');
  if (!record.claim_statement.trim()) errors.push('주장 내용은 필수입니다');
  const supporting = unique(record.linked_supporting_evidence);
  const contradicting = unique(record.linked_contradicting_evidence);
  for (const evidenceId of [...supporting, ...contradicting]) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) errors.push(`존재하지 않는 증거 참조: ${evidenceId}`);
    else if (evidence.case_id !== record.case_id) errors.push(`다른 사건 증거 연결 차단: ${evidenceId}`);
  }
  if (record.review_status === '관련 증거 있음' && supporting.length === 0) errors.push('관련 증거 있음 상태에는 최소 1개의 지원 증거가 필요합니다');
  return errors;
}

export function validateFact(record: FactRecord, evidenceById: Map<string, EvidenceRecord>) {
  const errors: string[] = [];
  if (!record.fact_id.trim()) errors.push('fact_id is required');
  if (!record.case_id.trim()) errors.push('case_id is required');
  if (!record.event_description.trim()) errors.push('사실관계 내용은 필수입니다');
  if (!validateTimelineDate(record.event_date, record.date_precision)) errors.push('날짜 정밀도와 날짜 값이 일치하지 않습니다');
  for (const evidenceId of unique(record.linked_evidence_ids)) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) errors.push(`존재하지 않는 증거 참조: ${evidenceId}`);
    else if (evidence.case_id !== record.case_id) errors.push(`다른 사건 증거 연결 차단: ${evidenceId}`);
  }
  if (record.review_status === '관련 증거 있음' && record.linked_evidence_ids.length === 0) errors.push('관련 증거 있음 상태에는 최소 1개의 증거가 필요합니다');
  return errors;
}

export function validateSubmission(record: SubmissionRecord, evidenceById: Map<string, EvidenceRecord>) {
  const errors: string[] = [];
  if (!record.submission_id.trim()) errors.push('submission_id is required');
  if (!validateExactDate(record.submission_date)) errors.push('제출일 형식이 올바르지 않습니다');
  const evidence = evidenceById.get(record.evidence_id);
  if (!evidence) errors.push(`존재하지 않는 증거 참조: ${record.evidence_id}`);
  else if (evidence.case_id !== record.case_id) errors.push(`다른 사건 증거 제출 기록 차단: ${record.evidence_id}`);
  if (!SHA256_HEX.test(record.submitted_copy_hash)) errors.push('제출 사본 해시가 올바르지 않습니다');
  if (record.receipt_attachment_id) {
    const receipt = evidenceById.get(record.receipt_attachment_id);
    if (!receipt) errors.push(`접수증 증거를 찾을 수 없습니다: ${record.receipt_attachment_id}`);
    else if (receipt.case_id !== record.case_id) errors.push(`다른 사건의 접수증 연결 차단: ${record.receipt_attachment_id}`);
  }
  return errors;
}

export async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Text(value: string) {
  return sha256Blob(new Blob([value], { type: 'text/plain;charset=utf-8' }));
}

export async function verifyEvidenceBlob(record: EvidenceRecord): Promise<IntegrityResult> {
  try {
    if (!(record.file_blob instanceof Blob)) return { evidence_id: record.evidence_id, expected_sha256: record.sha256, actual_sha256: null, ok: false, error: '원본 Blob이 없습니다' };
    if (record.file_blob.size !== record.file_size) return { evidence_id: record.evidence_id, expected_sha256: record.sha256, actual_sha256: null, ok: false, error: '저장된 바이트 크기가 메타데이터와 다릅니다' };
    const actual = await sha256Blob(record.file_blob);
    return { evidence_id: record.evidence_id, expected_sha256: record.sha256, actual_sha256: actual, ok: actual === record.sha256, ...(actual === record.sha256 ? {} : { error: '저장된 원본 바이트와 SHA-256이 일치하지 않습니다' }) };
  } catch (error) {
    return { evidence_id: record.evidence_id, expected_sha256: record.sha256, actual_sha256: null, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function findDuplicateHashes(evidence: EvidenceRecord[]) {
  const groups = new Map<string, string[]>();
  for (const item of evidence) {
    const list = groups.get(item.sha256) ?? [];
    list.push(item.evidence_id);
    groups.set(item.sha256, list);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([sha256, evidence_ids]) => ({ sha256, evidence_ids }));
}

export function findCrossCaseReferenceErrors(facts: FactRecord[], claims: ClaimRecord[], submissions: SubmissionRecord[], allEvidence: EvidenceRecord[]) {
  const map = new Map(allEvidence.map((item) => [item.evidence_id, item]));
  const errors: string[] = [];
  for (const fact of facts) for (const evidenceId of fact.linked_evidence_ids) {
    const e = map.get(evidenceId); if (!e || e.case_id !== fact.case_id) errors.push(`fact ${fact.fact_id} -> ${evidenceId}`);
  }
  for (const claim of claims) for (const evidenceId of [...claim.linked_supporting_evidence, ...claim.linked_contradicting_evidence]) {
    const e = map.get(evidenceId); if (!e || e.case_id !== claim.case_id) errors.push(`claim ${claim.claim_id} -> ${evidenceId}`);
  }
  for (const submission of submissions) {
    const e = map.get(submission.evidence_id); if (!e || e.case_id !== submission.case_id) errors.push(`submission ${submission.submission_id} -> ${submission.evidence_id}`);
    if (submission.receipt_attachment_id) {
      const r = map.get(submission.receipt_attachment_id); if (!r || r.case_id !== submission.case_id) errors.push(`receipt ${submission.submission_id} -> ${submission.receipt_attachment_id}`);
    }
  }
  return errors;
}

export function buildReviewSummary(evidence: EvidenceRecord[], facts: FactRecord[], claims: ClaimRecord[], submissions: SubmissionRecord[], integrity: IntegrityResult[], allEvidence = evidence): ReviewSummary {
  const hash_failures = integrity.filter((item) => !item.ok).length;
  const missing_originals = evidence.filter((item) => !(item.file_blob instanceof Blob) || item.file_blob.size !== item.file_size).length;
  const claims_without_support = claims.filter((item) => item.linked_supporting_evidence.length === 0).length;
  const claims_with_contradictions = claims.filter((item) => item.linked_contradicting_evidence.length > 0).length;
  const unknown_dates = facts.filter((item) => item.date_precision === 'UNKNOWN').length + evidence.filter((item) => item.created_or_occurred_at === 'UNKNOWN').length;
  const missing_sources = evidence.filter((item) => !item.source_description.trim()).length;
  const duplicate_hash_groups = findDuplicateHashes(evidence).length;
  const duplicate_exhibit_numbers = findDuplicateExhibitNumbers(evidence).length;
  const unnumbered_evidence = evidence.filter((item) => !item.exhibit_number.trim()).length;
  const cross_case_reference_errors = findCrossCaseReferenceErrors(facts, claims, submissions, allEvidence).length;

  let verdict: ReviewVerdict = 'READY FOR HUMAN REVIEW';
  if (hash_failures || missing_originals || cross_case_reference_errors || duplicate_exhibit_numbers) verdict = 'INTEGRITY FAILURE';
  else if (claims_without_support || unknown_dates || missing_sources || duplicate_hash_groups) verdict = 'UNVERIFIED';
  else if (claims_with_contradictions || claims.some((item) => item.review_status === '다툼 있음') || facts.some((item) => item.review_status === '다툼 있음') || unnumbered_evidence) verdict = 'REVIEW REQUIRED';

  return { total_evidence: evidence.length, unnumbered_evidence, hash_failures, missing_originals, duplicate_hash_groups, duplicate_exhibit_numbers, claims_without_support, claims_with_contradictions, unknown_dates, missing_sources, cross_case_reference_errors, verdict };
}

export function csvSafe(value: unknown) {
  const raw = value == null ? '' : String(value);
  return FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
}

export function csvCell(value: unknown) {
  return `"${csvSafe(value).replace(/"/g, '""')}"`;
}

export function evidenceCsv(caseRecord: CaseRecord, evidence: EvidenceRecord[], claims: ClaimRecord[]) {
  const headers = ['사건번호', '증거번호', '증거명', '작성일', '작성자 또는 출처', '입증취지', '제출 상태', '원본 파일명', 'SHA-256', '검증 상태'];
  const proofFor = (id: string) => unique([
    ...claims.filter((c) => c.linked_supporting_evidence.includes(id)).map((c) => c.proof_purpose).filter(Boolean),
    ...evidence.filter((e) => e.evidence_id === id).map((e) => e.proof_purpose).filter(Boolean),
  ]).join(' / ');
  const lines = [headers.map(csvCell).join(',')];
  for (const item of evidence) {
    lines.push([
      caseRecord.case_number || '미부여', item.exhibit_number || '미부여', item.display_title, item.created_or_occurred_at,
      item.source_description || '미기록', proofFor(item.evidence_id) || '미기록', item.submission_status, item.original_filename, item.sha256, item.verification_status,
    ].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function sanitizeDownloadFilename(name: string) {
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').replace(/^\.+|\.+$/g, '').trim();
  return (cleaned || 'evidence.bin').slice(0, 180);
}

export function sanitizeZipSegment(name: string) {
  return sanitizeDownloadFilename(name).replace(/\s+/g, '_');
}

export function isSafeZipPath(path: string) {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..');
}

export function metadataJson(caseRecord: CaseRecord, evidence: EvidenceRecord[], claims: ClaimRecord[], facts: FactRecord[], submissions: SubmissionRecord[]) {
  return JSON.stringify({
    exported_at: nowIso(),
    product: '증거록',
    case: caseRecord,
    evidence: evidence.map(({ file_blob: _fileBlob, ...meta }) => meta),
    claims,
    timelines: facts,
    submissions,
    notice: PRODUCT_NOTICE,
  }, null, 2);
}

export function buildCaseReportHtml(caseRecord: CaseRecord, evidence: EvidenceRecord[], claims: ClaimRecord[], facts: FactRecord[], submissions: SubmissionRecord[], review: ReviewSummary, generatedAt = nowIso()) {
  const evidenceMap = new Map(evidence.map((item) => [item.evidence_id, item]));
  const number = (id: string) => evidenceMap.get(id)?.exhibit_number || evidenceMap.get(id)?.display_title || id;
  const proofFor = (id: string) => unique([
    ...claims.filter((c) => c.linked_supporting_evidence.includes(id)).map((c) => c.proof_purpose).filter(Boolean),
    evidenceMap.get(id)?.proof_purpose || '',
  ].filter(Boolean)).join(' / ');
  const evidenceRows = evidence.map((item) => `<tr><td>${escapeHtml(caseRecord.case_number || '미부여')}</td><td>${escapeHtml(item.exhibit_number || '미부여')}</td><td>${escapeHtml(item.display_title)}</td><td>${escapeHtml(item.created_or_occurred_at === 'UNKNOWN' ? '날짜 미상' : item.created_or_occurred_at)}</td><td>${escapeHtml(item.source_description || '미기록')}</td><td>${escapeHtml(proofFor(item.evidence_id) || '미기록')}</td><td>${escapeHtml(item.submission_status)}</td></tr>`).join('');
  const explanationRows = evidence.map((item) => `<tr><td>${escapeHtml(item.exhibit_number || item.evidence_id)}</td><td>${escapeHtml(item.display_title)}</td><td>${escapeHtml(item.original_filename)}</td><td class="mono">${escapeHtml(item.sha256)}</td><td>${escapeHtml(item.verification_status)}</td><td>${escapeHtml(item.notes || '—')}</td></tr>`).join('');
  const timelineRows = sortFactsTimeline(facts).map((item) => `<tr><td>${escapeHtml(displayTimelineDate(item.event_date, item.date_precision))}</td><td>${escapeHtml(item.event_description)}</td><td>${escapeHtml(item.linked_evidence_ids.map(number).join(', ') || '없음')}</td><td>${escapeHtml(item.review_status)}</td></tr>`).join('');
  const claimRows = claims.map((item) => `<tr><td>${escapeHtml(item.claim_statement)}</td><td>${escapeHtml(item.proof_purpose || '미기록')}</td><td>${escapeHtml(item.linked_supporting_evidence.map(number).join(', ') || '없음')}</td><td>${escapeHtml(item.linked_contradicting_evidence.map(number).join(', ') || '없음')}</td><td>${escapeHtml(item.review_status)}</td></tr>`).join('');
  const missing = [
    ...claims.filter((c) => c.linked_supporting_evidence.length === 0).map((c) => `증거 없는 주장: ${c.claim_statement}`),
    ...facts.filter((f) => f.date_precision === 'UNKNOWN').map((f) => `발생일 미상: ${f.event_description}`),
    ...evidence.filter((e) => !e.source_description.trim()).map((e) => `출처 미기록: ${e.display_title}`),
    ...evidence.filter((e) => !e.exhibit_number.trim()).map((e) => `증거번호 미부여: ${e.display_title}`),
  ];
  const submissionRows = submissions.map((item) => `<tr><td>${escapeHtml(item.submission_date)}</td><td>${escapeHtml(number(item.evidence_id))}</td><td>${escapeHtml(item.submission_method || '미기록')}</td><td>${escapeHtml(item.submission_reference || '미기록')}</td><td class="mono">${escapeHtml(item.submitted_copy_hash)}</td></tr>`).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(caseRecord.case_title)} - 증거록 보고서</title><style>
  @page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#18231e;line-height:1.55;margin:0;background:#fff}h1{font-size:24px;color:#203D32;margin:0 0 6px}h2{font-size:17px;color:#203D32;border-bottom:2px solid #203D32;padding-bottom:5px;margin-top:26px}p{margin:6px 0}.notice{background:#F6F3EB;border:1px solid #cfc9b9;padding:12px;margin:16px 0}.status{padding:10px;border:1px solid #9da9a3;background:#f8faf9}.bad{border-color:#b42318;background:#fff3f2}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;word-break:break-all}table{border-collapse:collapse;width:100%;font-size:11px;margin:8px 0 18px;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #9ea9a3;padding:6px;vertical-align:top;word-break:break-word}th{background:#edf2ef}ul{padding-left:20px}.footer{margin-top:28px;font-size:10px;color:#5e6d66}
  </style></head><body><h1>증거록</h1><p>흩어진 증거를, 명확한 기록으로.</p><p><strong>생성일시:</strong> ${escapeHtml(generatedAt)}<br><strong>사건 ID:</strong> ${escapeHtml(caseRecord.case_id)}<br><strong>사건번호:</strong> ${escapeHtml(caseRecord.case_number || '미부여')}<br><strong>사건명:</strong> ${escapeHtml(caseRecord.case_title)}<br><strong>법원:</strong> ${escapeHtml(caseRecord.court_name || '미기록')}<br><strong>당사자 역할:</strong> ${escapeHtml(caseRecord.party_role)}</p><div class="notice">${escapeHtml(PRODUCT_NOTICE)}</div>
  <h2>1. 사건 개요</h2><p>사건 유형: ${escapeHtml(caseRecord.case_type)} · 상대방: ${escapeHtml(caseRecord.opponent_name || '미기록')} · 상태: ${escapeHtml(caseRecord.case_status)}</p>
  <h2>2. 증거목록</h2><table><thead><tr><th>사건번호</th><th>증거번호</th><th>증거명</th><th>작성일</th><th>작성자/출처</th><th>입증취지</th><th>제출 상태</th></tr></thead><tbody>${evidenceRows || '<tr><td colspan="7">등록된 증거가 없습니다.</td></tr>'}</tbody></table>
  <h2>3. 증거설명서 초안</h2><table><thead><tr><th>증거번호</th><th>증거명</th><th>원본 파일명</th><th>SHA-256</th><th>검증 상태</th><th>메모</th></tr></thead><tbody>${explanationRows || '<tr><td colspan="6">등록된 증거가 없습니다.</td></tr>'}</tbody></table>
  <h2>4. 사건 타임라인</h2><table><thead><tr><th>일시</th><th>사실관계</th><th>관련 증거</th><th>검토 상태</th></tr></thead><tbody>${timelineRows || '<tr><td colspan="4">등록된 사실관계가 없습니다.</td></tr>'}</tbody></table>
  <h2>5. 주장·증거 연결표</h2><table><thead><tr><th>주장</th><th>입증취지</th><th>지원 증거</th><th>반대 증거</th><th>검토 상태</th></tr></thead><tbody>${claimRows || '<tr><td colspan="5">등록된 주장이 없습니다.</td></tr>'}</tbody></table>
  <h2>6. 미확인 사항 목록</h2><ul>${missing.length ? missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>현재 규칙에서 탐지된 미확인 항목 없음</li>'}</ul>
  <h2>7. 원본 무결성 검증 결과</h2><div class="status ${review.verdict === 'INTEGRITY FAILURE' ? 'bad' : ''}"><strong>${escapeHtml(review.verdict)}</strong><br>전체 증거 ${review.total_evidence} · 해시 실패 ${review.hash_failures} · 원본 누락 ${review.missing_originals} · 증거번호 중복 ${review.duplicate_exhibit_numbers} · 사건 간 참조 오류 ${review.cross_case_reference_errors}</div>
  <h2>8. 제출 기록</h2><table><thead><tr><th>제출일</th><th>증거</th><th>방법</th><th>참조</th><th>제출 사본 SHA-256</th></tr></thead><tbody>${submissionRows || '<tr><td colspan="5">사용자가 기록한 제출 내역이 없습니다.</td></tr>'}</tbody></table>
  <div class="footer">증거록은 법원 공식 서비스가 아니며 법률 자문, 제출 성공, 증거능력 또는 소송 결과를 보증하지 않습니다. 최신 제출 형식·용량·절차는 전자소송포털에서 별도로 확인하십시오.</div></body></html>`;
}

export function validateRestoreConflicts(existing: { caseIds: string[]; evidenceIds: string[]; claimIds: string[]; factIds: string[]; submissionIds: string[] }, incoming: RestoreBundle) {
  const conflicts: string[] = [];
  if (existing.caseIds.includes(incoming.caseRecord.case_id)) conflicts.push(`case_id ${incoming.caseRecord.case_id}`);
  for (const item of incoming.evidence) if (existing.evidenceIds.includes(item.evidence_id)) conflicts.push(`evidence_id ${item.evidence_id}`);
  for (const item of incoming.claims) if (existing.claimIds.includes(item.claim_id)) conflicts.push(`claim_id ${item.claim_id}`);
  for (const item of incoming.facts) if (existing.factIds.includes(item.fact_id)) conflicts.push(`fact_id ${item.fact_id}`);
  for (const item of incoming.submissions) if (existing.submissionIds.includes(item.submission_id)) conflicts.push(`submission_id ${item.submission_id}`);
  return conflicts;
}
