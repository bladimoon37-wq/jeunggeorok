import {
  MAX_EVIDENCE_PER_CASE,
  findDuplicateExhibitNumbers,
  validateCase,
  validateClaim,
  validateEvidenceMeta,
  validateFact,
  validateSubmission,
  type CaseRecord,
  type ClaimRecord,
  type EvidenceRecord,
  type FactRecord,
  type RestoreBundle,
  type SubmissionRecord,
} from './core';

export const DB_NAME = 'jeunggeorok-v01';
const DB_VERSION = 1;
type StoreName = 'cases' | 'evidence' | 'claims' | 'facts' | 'submissions';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 요청 실패'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 트랜잭션 실패'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 트랜잭션 중단'));
  });
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const cases = db.createObjectStore('cases', { keyPath: 'case_id' });
      cases.createIndex('updated_at', 'updated_at');
      const evidence = db.createObjectStore('evidence', { keyPath: 'evidence_id' });
      evidence.createIndex('case_id', 'case_id');
      evidence.createIndex('case_hash', ['case_id', 'sha256']);
      evidence.createIndex('case_exhibit', ['case_id', 'exhibit_number']);
      const claims = db.createObjectStore('claims', { keyPath: 'claim_id' });
      claims.createIndex('case_id', 'case_id');
      const facts = db.createObjectStore('facts', { keyPath: 'fact_id' });
      facts.createIndex('case_id', 'case_id');
      const submissions = db.createObjectStore('submissions', { keyPath: 'submission_id' });
      submissions.createIndex('case_id', 'case_id');
      submissions.createIndex('evidence_id', 'evidence_id');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 열기 실패'));
  });
}

async function listByCase<T>(storeName: StoreName, caseId: string) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const rows = await request(tx.objectStore(storeName).index('case_id').getAll(caseId)) as T[];
  await transactionDone(tx); db.close(); return rows;
}

export async function listCases() {
  const db = await openDb(); const tx = db.transaction('cases', 'readonly');
  const rows = await request(tx.objectStore('cases').getAll()) as CaseRecord[];
  await transactionDone(tx); db.close(); return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getCase(caseId: string) {
  const db = await openDb(); const tx = db.transaction('cases', 'readonly');
  const row = await request(tx.objectStore('cases').get(caseId)) as CaseRecord | undefined;
  await transactionDone(tx); db.close(); return row;
}

export async function createCase(record: CaseRecord) {
  const errors = validateCase(record); if (errors.length) throw new Error(errors.join('; '));
  const db = await openDb(); const tx = db.transaction('cases', 'readwrite'); const store = tx.objectStore('cases');
  if (await request(store.get(record.case_id))) { tx.abort(); db.close(); throw new Error(`case_id가 이미 존재합니다: ${record.case_id}`); }
  store.add(record); await transactionDone(tx); db.close();
}

export async function updateCase(record: CaseRecord) {
  const errors = validateCase(record); if (errors.length) throw new Error(errors.join('; '));
  const db = await openDb(); const tx = db.transaction('cases', 'readwrite'); const store = tx.objectStore('cases');
  if (!await request(store.get(record.case_id))) { tx.abort(); db.close(); throw new Error('사건을 찾을 수 없습니다'); }
  store.put(record); await transactionDone(tx); db.close();
}

export function listEvidence(caseId: string) { return listByCase<EvidenceRecord>('evidence', caseId); }
export function listClaims(caseId: string) { return listByCase<ClaimRecord>('claims', caseId); }
export function listFacts(caseId: string) { return listByCase<FactRecord>('facts', caseId); }
export function listSubmissions(caseId: string) { return listByCase<SubmissionRecord>('submissions', caseId); }

export async function listAllEvidence() {
  const db = await openDb(); const tx = db.transaction('evidence', 'readonly');
  const rows = await request(tx.objectStore('evidence').getAll()) as EvidenceRecord[];
  await transactionDone(tx); db.close(); return rows;
}

export async function addEvidence(record: EvidenceRecord) {
  const { file_blob, ...meta } = record;
  const errors = validateEvidenceMeta(meta); if (errors.length) throw new Error(errors.join('; '));
  if (!(file_blob instanceof Blob) || file_blob.size !== record.file_size) throw new Error('원본 파일 바이트/크기가 메타데이터와 일치하지 않습니다');
  const db = await openDb(); const tx = db.transaction(['cases', 'evidence'], 'readwrite');
  if (!await request(tx.objectStore('cases').get(record.case_id))) { tx.abort(); db.close(); throw new Error('사건을 찾을 수 없습니다'); }
  const store = tx.objectStore('evidence');
  if (await request(store.get(record.evidence_id))) { tx.abort(); db.close(); throw new Error(`evidence_id가 이미 존재합니다: ${record.evidence_id}`); }
  if (await request(store.index('case_id').count(record.case_id)) >= MAX_EVIDENCE_PER_CASE) { tx.abort(); db.close(); throw new Error(`사건당 증거 한도 ${MAX_EVIDENCE_PER_CASE}개를 초과했습니다`); }
  const duplicateHash = await request(store.index('case_hash').get([record.case_id, record.sha256])) as EvidenceRecord | undefined;
  if (duplicateHash) { tx.abort(); db.close(); throw new Error(`동일 사건 내 중복 원본(SHA-256): ${duplicateHash.evidence_id}`); }
  if (record.exhibit_number) {
    const duplicateNumber = await request(store.index('case_exhibit').get([record.case_id, record.exhibit_number])) as EvidenceRecord | undefined;
    if (duplicateNumber) { tx.abort(); db.close(); throw new Error(`증거번호 중복: ${record.exhibit_number} (${duplicateNumber.evidence_id})`); }
  }
  store.add(record); await transactionDone(tx); db.close();
}

export async function updateEvidenceMetadata(record: EvidenceRecord) {
  const { file_blob: _ignored, ...meta } = record;
  const errors = validateEvidenceMeta(meta); if (errors.length) throw new Error(errors.join('; '));
  const db = await openDb(); const tx = db.transaction('evidence', 'readwrite'); const store = tx.objectStore('evidence');
  const existing = await request(store.get(record.evidence_id)) as EvidenceRecord | undefined;
  if (!existing) { tx.abort(); db.close(); throw new Error('증거를 찾을 수 없습니다'); }
  if (existing.case_id !== record.case_id || existing.sha256 !== record.sha256 || existing.file_size !== record.file_size || existing.original_filename !== record.original_filename) {
    tx.abort(); db.close(); throw new Error('원본 식별 필드(case/hash/size/original filename)는 수정할 수 없습니다');
  }
  if (record.exhibit_number) {
    const duplicateNumber = await request(store.index('case_exhibit').get([record.case_id, record.exhibit_number])) as EvidenceRecord | undefined;
    if (duplicateNumber && duplicateNumber.evidence_id !== record.evidence_id) { tx.abort(); db.close(); throw new Error(`증거번호 중복: ${record.exhibit_number}`); }
  }
  store.put({ ...record, file_blob: existing.file_blob });
  await transactionDone(tx); db.close();
}

export async function putClaim(record: ClaimRecord) {
  const evidence = await listEvidence(record.case_id); const map = new Map(evidence.map((x) => [x.evidence_id, x]));
  const errors = validateClaim(record, map); if (errors.length) throw new Error(errors.join('; '));
  const db = await openDb(); const tx = db.transaction(['cases', 'claims'], 'readwrite');
  if (!await request(tx.objectStore('cases').get(record.case_id))) { tx.abort(); db.close(); throw new Error('사건을 찾을 수 없습니다'); }
  tx.objectStore('claims').put(record); await transactionDone(tx); db.close();
}

export async function putFact(record: FactRecord) {
  const evidence = await listEvidence(record.case_id); const map = new Map(evidence.map((x) => [x.evidence_id, x]));
  const errors = validateFact(record, map); if (errors.length) throw new Error(errors.join('; '));
  const db = await openDb(); const tx = db.transaction(['cases', 'facts'], 'readwrite');
  if (!await request(tx.objectStore('cases').get(record.case_id))) { tx.abort(); db.close(); throw new Error('사건을 찾을 수 없습니다'); }
  tx.objectStore('facts').put(record); await transactionDone(tx); db.close();
}

export async function addSubmission(record: SubmissionRecord) {
  const evidence = await listEvidence(record.case_id); const map = new Map(evidence.map((x) => [x.evidence_id, x]));
  const errors = validateSubmission(record, map); if (errors.length) throw new Error(errors.join('; '));
  const db = await openDb(); const tx = db.transaction(['cases', 'evidence', 'submissions'], 'readwrite');
  if (!await request(tx.objectStore('cases').get(record.case_id))) { tx.abort(); db.close(); throw new Error('사건을 찾을 수 없습니다'); }
  const submissions = tx.objectStore('submissions');
  if (await request(submissions.get(record.submission_id))) { tx.abort(); db.close(); throw new Error('submission_id가 이미 존재합니다'); }
  const evStore = tx.objectStore('evidence'); const ev = await request(evStore.get(record.evidence_id)) as EvidenceRecord | undefined;
  if (!ev || ev.case_id !== record.case_id) { tx.abort(); db.close(); throw new Error('제출 증거가 사건과 일치하지 않습니다'); }
  submissions.add(record); evStore.put({ ...ev, submission_status: '제출 완료', updated_at: new Date().toISOString() });
  await transactionDone(tx); db.close();
}

export async function deleteClaim(claimId: string) {
  const db = await openDb(); const tx = db.transaction('claims', 'readwrite'); tx.objectStore('claims').delete(claimId); await transactionDone(tx); db.close();
}
export async function deleteFact(factId: string) {
  const db = await openDb(); const tx = db.transaction('facts', 'readwrite'); tx.objectStore('facts').delete(factId); await transactionDone(tx); db.close();
}
export async function deleteSubmission(submissionId: string) {
  const db = await openDb(); const tx = db.transaction('submissions', 'readwrite'); tx.objectStore('submissions').delete(submissionId); await transactionDone(tx); db.close();
}

export async function deleteEvidenceAndCleanReferences(evidenceId: string) {
  const db = await openDb(); const tx = db.transaction(['evidence', 'claims', 'facts', 'submissions'], 'readwrite');
  const evStore = tx.objectStore('evidence'); const record = await request(evStore.get(evidenceId)) as EvidenceRecord | undefined;
  if (!record) { tx.abort(); db.close(); throw new Error('증거를 찾을 수 없습니다'); }
  const claimStore = tx.objectStore('claims'); const factStore = tx.objectStore('facts'); const subStore = tx.objectStore('submissions');
  const claims = await request(claimStore.index('case_id').getAll(record.case_id)) as ClaimRecord[];
  const facts = await request(factStore.index('case_id').getAll(record.case_id)) as FactRecord[];
  const submissions = await request(subStore.index('case_id').getAll(record.case_id)) as SubmissionRecord[];
  let cleanedClaims = 0, cleanedFacts = 0, deletedSubmissions = 0;
  for (const claim of claims) {
    const support = claim.linked_supporting_evidence.filter((id) => id !== evidenceId);
    const contra = claim.linked_contradicting_evidence.filter((id) => id !== evidenceId);
    if (support.length !== claim.linked_supporting_evidence.length || contra.length !== claim.linked_contradicting_evidence.length) {
      claimStore.put({ ...claim, linked_supporting_evidence: support, linked_contradicting_evidence: contra, review_status: support.length ? claim.review_status : '추가 확인 필요', updated_at: new Date().toISOString() }); cleanedClaims++;
    }
  }
  for (const fact of facts) {
    const links = fact.linked_evidence_ids.filter((id) => id !== evidenceId);
    if (links.length !== fact.linked_evidence_ids.length) {
      factStore.put({ ...fact, linked_evidence_ids: links, review_status: links.length ? fact.review_status : '추가 확인 필요', updated_at: new Date().toISOString() }); cleanedFacts++;
    }
  }
  for (const sub of submissions) {
    if (sub.evidence_id === evidenceId || sub.receipt_attachment_id === evidenceId) { subStore.delete(sub.submission_id); deletedSubmissions++; }
  }
  evStore.delete(evidenceId); await transactionDone(tx); db.close(); return { cleanedClaims, cleanedFacts, deletedSubmissions };
}

async function deleteKeysByCase(tx: IDBTransaction, storeName: StoreName, caseId: string) {
  const store = tx.objectStore(storeName); const keys = await request(store.index('case_id').getAllKeys(caseId)); for (const key of keys) store.delete(key);
}

export async function deleteCaseCascade(caseId: string) {
  const db = await openDb(); const tx = db.transaction(['cases', 'evidence', 'claims', 'facts', 'submissions'], 'readwrite');
  await deleteKeysByCase(tx, 'evidence', caseId); await deleteKeysByCase(tx, 'claims', caseId); await deleteKeysByCase(tx, 'facts', caseId); await deleteKeysByCase(tx, 'submissions', caseId);
  tx.objectStore('cases').delete(caseId); await transactionDone(tx); db.close();
}

export async function ensureStorageCapacity(bytesToAdd: number) {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (typeof estimate.quota === 'number' && typeof estimate.usage === 'number' && estimate.usage + bytesToAdd > estimate.quota * 0.9) {
    throw new Error('브라우저 저장 공간 여유가 부족합니다. 백업 후 저장 공간을 확보하십시오.');
  }
}

export async function getExistingIds() {
  const db = await openDb(); const tx = db.transaction(['cases', 'evidence', 'claims', 'facts', 'submissions'], 'readonly');
  const [caseIds, evidenceIds, claimIds, factIds, submissionIds] = await Promise.all([
    request(tx.objectStore('cases').getAllKeys()), request(tx.objectStore('evidence').getAllKeys()), request(tx.objectStore('claims').getAllKeys()), request(tx.objectStore('facts').getAllKeys()), request(tx.objectStore('submissions').getAllKeys()),
  ]);
  await transactionDone(tx); db.close();
  return { caseIds: caseIds.map(String), evidenceIds: evidenceIds.map(String), claimIds: claimIds.map(String), factIds: factIds.map(String), submissionIds: submissionIds.map(String) };
}

export async function restoreAtomic(bundle: RestoreBundle) {
  const db = await openDb(); const tx = db.transaction(['cases', 'evidence', 'claims', 'facts', 'submissions'], 'readwrite');
  const cases = tx.objectStore('cases'), evidence = tx.objectStore('evidence'), claims = tx.objectStore('claims'), facts = tx.objectStore('facts'), submissions = tx.objectStore('submissions');
  const conflicts: string[] = [];
  if (await request(cases.get(bundle.caseRecord.case_id))) conflicts.push(`case_id ${bundle.caseRecord.case_id}`);
  for (const item of bundle.evidence) if (await request(evidence.get(item.evidence_id))) conflicts.push(`evidence_id ${item.evidence_id}`);
  for (const item of bundle.claims) if (await request(claims.get(item.claim_id))) conflicts.push(`claim_id ${item.claim_id}`);
  for (const item of bundle.facts) if (await request(facts.get(item.fact_id))) conflicts.push(`fact_id ${item.fact_id}`);
  for (const item of bundle.submissions) if (await request(submissions.get(item.submission_id))) conflicts.push(`submission_id ${item.submission_id}`);
  if (conflicts.length) { tx.abort(); db.close(); throw new Error(`복원 차단 — 기존 데이터 덮어쓰기 금지: ${conflicts.join(', ')}`); }
  cases.add(bundle.caseRecord); for (const item of bundle.evidence) evidence.add(item); for (const item of bundle.claims) claims.add(item); for (const item of bundle.facts) facts.add(item); for (const item of bundle.submissions) submissions.add(item);
  await transactionDone(tx); db.close();
}

export async function clearAllData() {
  const db = await openDb(); const tx = db.transaction(['cases', 'evidence', 'claims', 'facts', 'submissions'], 'readwrite');
  for (const name of ['cases', 'evidence', 'claims', 'facts', 'submissions'] as StoreName[]) tx.objectStore(name).clear();
  await transactionDone(tx); db.close();
}

export async function deleteDatabaseForTests() {
  const db = await openDb(); db.close();
  await new Promise<void>((resolve, reject) => { const req = indexedDB.deleteDatabase(DB_NAME); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); req.onblocked = () => reject(new Error('database deletion blocked')); });
}

export async function assertNoDuplicateExhibitNumbers(caseId: string) {
  const evidence = await listEvidence(caseId); const duplicates = findDuplicateExhibitNumbers(evidence); if (duplicates.length) throw new Error(`증거번호 중복 감지: ${duplicates.map((x) => x.exhibit_number).join(', ')}`);
}
