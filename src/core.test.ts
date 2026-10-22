import { describe, expect, it } from 'vitest';
import {
  PRODUCT_NOTICE,
  appendNumberHistory,
  buildCaseReportHtml,
  buildReviewSummary,
  csvSafe,
  defaultExhibitPrefix,
  evidenceCsv,
  escapeHtml,
  findDuplicateExhibitNumbers,
  formatExhibitNumber,
  isSafeZipPath,
  mimeExtensionWarning,
  sanitizeDownloadFilename,
  sha256Blob,
  sortFactsTimeline,
  validateCase,
  validateClaim,
  validateExactDate,
  validateFact,
  validateMonth,
  validateTimelineDate,
  validateTimezoneTimestamp,
  verifyEvidenceBlob,
  type CaseRecord,
  type ClaimRecord,
  type EvidenceRecord,
  type FactRecord,
} from './core';

const baseCase: CaseRecord = { case_id: 'CASE-1', case_title: '임대차보증금 반환', case_number: '', court_name: '', case_type: '임대차보증금 반환', party_role: '원고', opponent_name: '', case_status: '준비중', created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z' };

async function ev(overrides: Partial<EvidenceRecord> = {}): Promise<EvidenceRecord> {
  const blob = overrides.file_blob ?? new Blob(['sample evidence'], { type: 'text/plain' });
  const sha = overrides.sha256 ?? await sha256Blob(blob);
  return { evidence_id: 'EVD-1', case_id: 'CASE-1', original_filename: '계약서.txt', display_title: '임대차계약서', file_type: 'TXT', mime_type: 'text/plain', mime_warning: '', file_size: blob.size, sha256: sha, source_description: '사용자 보관 사본', created_or_occurred_at: '2026-02-16', acquired_at: '2026-10-21', verification_status: 'UNVERIFIED', notes: '', proof_purpose: '계약관계 확인', exhibit_prefix: '갑', exhibit_main_no: 1, exhibit_sub_no: null, exhibit_number: '갑 제1호증', number_history: [], submission_status: '미제출', created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', file_blob: blob, ...overrides };
}
const claim = (overrides: Partial<ClaimRecord> = {}): ClaimRecord => ({ claim_id: 'CLM-1', case_id: 'CASE-1', claim_statement: '보증금 반환이 필요하다는 사용자 주장', proof_purpose: '계약 및 지급 사실 확인', linked_supporting_evidence: [], linked_contradicting_evidence: [], review_status: '사용자 주장', notes: '', created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', ...overrides });
const fact = (overrides: Partial<FactRecord> = {}): FactRecord => ({ fact_id: 'FACT-1', case_id: 'CASE-1', event_date: 'UNKNOWN', date_precision: 'UNKNOWN', event_description: '계약 종료 통지가 있었다고 사용자가 기록함', linked_evidence_ids: [], review_status: '사용자 기록', created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', ...overrides });

describe('대한민국 사건 모델', () => {
  it('사건번호 공란을 허용한다', () => expect(validateCase(baseCase)).toEqual([]));
  it('사건명 누락은 거부한다', () => expect(validateCase({ ...baseCase, case_title: '' }).join(' ')).toContain('사건명'));
  it('원고 기본 접두사는 갑이다', () => expect(defaultExhibitPrefix('원고')).toBe('갑'));
  it('피고 기본 접두사는 을이다', () => expect(defaultExhibitPrefix('피고')).toBe('을'));
});

describe('증거번호', () => {
  it('갑호증 형식을 만든다', () => expect(formatExhibitNumber('갑', 1, null)).toBe('갑 제1호증'));
  it('을호증 형식을 만든다', () => expect(formatExhibitNumber('을', 2, null)).toBe('을 제2호증'));
  it('가지번호를 만든다', () => expect(formatExhibitNumber('갑', 3, 2)).toBe('갑 제3호증의 2'));
  it('사용자 접두사를 지원한다', () => expect(formatExhibitNumber('참고', 4, null)).toBe('참고 제4호증'));
  it('번호 미부여 상태를 허용한다', () => expect(formatExhibitNumber('갑', null, null)).toBe(''));
  it('중복 증거번호를 탐지한다', async () => { const a = await ev({ evidence_id: 'A' }); const b = await ev({ evidence_id: 'B' }); expect(findDuplicateExhibitNumbers([a, b])).toHaveLength(1); });
  it('제출 후 번호 변경 이력을 표시한다', async () => { const a = await ev({ submission_status: '제출 완료' }); const history = appendNumberHistory(a, '갑 제2호증', '정정', '2026-10-21T01:00:00Z'); expect(history[0].changed_after_submission).toBe(true); expect(history[0].previous_number).toBe('갑 제1호증'); });
});

describe('날짜 정밀도', () => {
  it('실제 날짜만 허용한다', () => { expect(validateExactDate('2026-02-28')).toBe(true); expect(validateExactDate('2026-02-30')).toBe(false); });
  it('월까지만 입력을 검증한다', () => { expect(validateMonth('2026-10')).toBe(true); expect(validateMonth('2026-13')).toBe(false); });
  it('정확한 일시는 timezone을 요구한다', () => { expect(validateTimezoneTimestamp('2026-10-21T13:00:00+09:00')).toBe(true); expect(validateTimezoneTimestamp('2026-10-21T13:00:00')).toBe(false); });
  it('날짜 미상을 임의 시간으로 만들지 않는다', () => expect(validateTimelineDate('UNKNOWN', 'UNKNOWN')).toBe(true));
  it('월/날짜/일시/미상을 순서대로 정렬한다', () => { const rows = sortFactsTimeline([fact({ fact_id: 'U' }), fact({ fact_id: 'T', date_precision: 'TIMESTAMP', event_date: '2026-10-21T13:00:00+09:00' }), fact({ fact_id: 'D', date_precision: 'DATE', event_date: '2026-10-21' }), fact({ fact_id: 'M', date_precision: 'MONTH', event_date: '2026-09' })]); expect(rows.map((x) => x.fact_id)).toEqual(['M', 'D', 'T', 'U']); });
});

describe('원본 무결성', () => {
  it('SHA-256은 동일 바이트에 안정적이다', async () => expect(await sha256Blob(new Blob(['abc']))).toBe(await sha256Blob(new Blob(['abc']))));
  it('저장 원본을 재검증한다', async () => expect((await verifyEvidenceBlob(await ev())).ok).toBe(true));
  it('바이트 변경을 INTEGRITY FAILURE로 탐지한다', async () => { const a = await ev(); const changed = { ...a, file_blob: new Blob(['tampered'], { type: 'text/plain' }) }; expect((await verifyEvidenceBlob(changed)).ok).toBe(false); });
});

describe('주장/사실 연결 방어', () => {
  it('다른 사건 증거의 주장 연결을 차단한다', async () => { const e = await ev({ case_id: 'CASE-2' }); const errors = validateClaim(claim({ review_status: '관련 증거 있음', linked_supporting_evidence: ['EVD-1'] }), new Map([['EVD-1', e]])); expect(errors.join(' ')).toContain('다른 사건'); });
  it('관련 증거 있음 상태는 실제 지원 증거가 필요하다', () => expect(validateClaim(claim({ review_status: '관련 증거 있음' }), new Map()).join(' ')).toContain('최소 1개'));
  it('타임라인도 다른 사건 증거 연결을 차단한다', async () => { const e = await ev({ case_id: 'CASE-2' }); const errors = validateFact(fact({ linked_evidence_ids: ['EVD-1'] }), new Map([['EVD-1', e]])); expect(errors.join(' ')).toContain('다른 사건'); });
});

describe('검토 판정', () => {
  it('해시 실패가 최우선 INTEGRITY FAILURE다', async () => { const e = await ev(); const summary = buildReviewSummary([e], [], [], [], [{ evidence_id: e.evidence_id, expected_sha256: e.sha256, actual_sha256: null, ok: false }]); expect(summary.verdict).toBe('INTEGRITY FAILURE'); });
  it('증거 없는 주장은 UNVERIFIED다', async () => { const e = await ev(); const summary = buildReviewSummary([e], [], [claim()], [], [{ evidence_id: e.evidence_id, expected_sha256: e.sha256, actual_sha256: e.sha256, ok: true }]); expect(summary.claims_without_support).toBe(1); expect(summary.verdict).toBe('UNVERIFIED'); });
  it('반대 증거가 있으면 REVIEW REQUIRED가 가능하다', async () => { const e = await ev(); const c = claim({ linked_supporting_evidence: ['EVD-1'], linked_contradicting_evidence: ['EVD-1'], review_status: '다툼 있음' }); const summary = buildReviewSummary([e], [], [c], [], [{ evidence_id: e.evidence_id, expected_sha256: e.sha256, actual_sha256: e.sha256, ok: true }]); expect(summary.verdict).toBe('REVIEW REQUIRED'); });
  it('정리 규칙이 깨끗하면 READY FOR HUMAN REVIEW다', async () => { const e = await ev(); const c = claim({ linked_supporting_evidence: ['EVD-1'], review_status: '관련 증거 있음' }); const f = fact({ date_precision: 'DATE', event_date: '2026-02-16', linked_evidence_ids: ['EVD-1'], review_status: '관련 증거 있음' }); const summary = buildReviewSummary([e], [f], [c], [], [{ evidence_id: e.evidence_id, expected_sha256: e.sha256, actual_sha256: e.sha256, ok: true }]); expect(summary.verdict).toBe('READY FOR HUMAN REVIEW'); });
});

describe('출력 보안', () => {
  it('CSV Formula Injection을 방어한다', () => { for (const v of ['=SUM(A1:A2)', '+cmd', '-1+2', '@evil', '  =HYPERLINK("x")']) expect(csvSafe(v).startsWith("'")).toBe(true); });
  it('증거목록 CSV의 위험 셀도 방어한다', async () => { const e = await ev({ display_title: '=CMD()', source_description: '+evil' }); const csv = evidenceCsv(baseCase, [e], []); expect(csv).toContain("'=CMD()"); expect(csv).toContain("'+evil"); });
  it('HTML을 escape한다', () => expect(escapeHtml('<img src=x onerror=alert(1)>')).not.toContain('<img'));
  it('다운로드 파일명에서 경로 문자를 제거한다', () => expect(sanitizeDownloadFilename('../evil<script>.pdf')).not.toMatch(/[\\/:*?"<>|]/));
  it('ZIP path traversal을 차단한다', () => { expect(isSafeZipPath('files/original/E1/a.pdf')).toBe(true); expect(isSafeZipPath('../evil')).toBe(false); expect(isSafeZipPath('/abs/evil')).toBe(false); expect(isSafeZipPath('C:/evil')).toBe(false); });
  it('MIME/확장자 불일치를 경고한다', () => expect(mimeExtensionWarning('contract.pdf', 'text/html')).toContain('일치하지 않을 수'));
});

describe('보고서 정확성', () => {
  it('한국어 고지와 A4 보고서 구조를 포함한다', async () => { const e = await ev({ display_title: '<script>alert(1)</script>' }); const c = claim({ linked_supporting_evidence: ['EVD-1'], review_status: '관련 증거 있음' }); const summary = buildReviewSummary([e], [], [c], [], [{ evidence_id: e.evidence_id, expected_sha256: e.sha256, actual_sha256: e.sha256, ok: true }]); const html = buildCaseReportHtml(baseCase, [e], [c], [], [], summary); expect(html).toContain(PRODUCT_NOTICE); expect(html).toContain('증거목록'); expect(html).toContain('@page'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>alert(1)</script>'); });
});
