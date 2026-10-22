import JSZip from 'jszip';
import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TYPE,
  MAX_BACKUP_ENTRIES,
  MAX_BACKUP_INPUT_BYTES,
  MAX_BACKUP_UNCOMPRESSED_BYTES,
  MAX_FILE_BYTES,
  PRODUCT_NOTICE,
  isSafeZipPath,
  sanitizeZipSegment,
  sha256Blob,
  sha256Text,
  validateCase,
  validateClaim,
  validateEvidenceMeta,
  validateFact,
  validateSubmission,
  verifyEvidenceBlob,
  type BackupManifest,
  type CaseRecord,
  type ClaimRecord,
  type EvidenceRecord,
  type FactRecord,
  type RestoreBundle,
  type SubmissionRecord,
} from './core';

const REQUIRED_JSON = ['manifest.json', 'cases.json', 'evidence.json', 'claims.json', 'timelines.json', 'submissions.json'];

function stableStringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function evidenceMeta(item: EvidenceRecord) {
  const { file_blob: _blob, ...meta } = item;
  return meta;
}

export async function buildCaseBackupZip(
  caseRecord: CaseRecord,
  evidence: EvidenceRecord[],
  claims: ClaimRecord[],
  facts: FactRecord[],
  submissions: SubmissionRecord[],
) {
  const integrity = await Promise.all(evidence.map(verifyEvidenceBlob));
  const failed = integrity.filter((item) => !item.ok);
  if (failed.length) throw new Error(`INTEGRITY FAILURE: ${failed.map((item) => item.evidence_id).join(', ')}`);
  const totalRaw = evidence.reduce((sum, item) => sum + item.file_size, 0);
  if (totalRaw > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error('백업 원본 총량이 V0.1 한도를 초과했습니다');

  const zip = new JSZip();
  const casesJson = stableStringify([caseRecord]);
  const evidenceJson = stableStringify(evidence.map(evidenceMeta));
  const claimsJson = stableStringify(claims);
  const timelinesJson = stableStringify(facts);
  const submissionsJson = stableStringify(submissions);
  const metadata_sha256 = {
    'cases.json': await sha256Text(casesJson),
    'evidence.json': await sha256Text(evidenceJson),
    'claims.json': await sha256Text(claimsJson),
    'timelines.json': await sha256Text(timelinesJson),
    'submissions.json': await sha256Text(submissionsJson),
  };

  const entries = evidence.map((item) => ({
    evidence_id: item.evidence_id,
    path: `files/original/${sanitizeZipSegment(item.evidence_id)}/${sanitizeZipSegment(item.original_filename)}`,
    original_filename: item.original_filename,
    file_size: item.file_size,
    sha256: item.sha256,
  }));

  const manifest: BackupManifest = {
    package_type: BACKUP_TYPE,
    schema_version: BACKUP_SCHEMA_VERSION,
    product: '증거록',
    exported_at: new Date().toISOString(),
    case_id: caseRecord.case_id,
    encrypted: false,
    file_count: evidence.length,
    total_raw_bytes: totalRaw,
    entries,
    metadata_sha256,
    warning: `UNENCRYPTED BACKUP. 민감한 사건 자료가 포함될 수 있습니다. 안전한 위치에 보관하십시오. ${PRODUCT_NOTICE}`,
  };

  zip.file('manifest.json', stableStringify(manifest));
  zip.file('cases.json', casesJson);
  zip.file('evidence.json', evidenceJson);
  zip.file('claims.json', claimsJson);
  zip.file('timelines.json', timelinesJson);
  zip.file('submissions.json', submissionsJson);
  zip.file('files/derived/README.txt', 'V0.1은 파생 파일을 생성하지 않습니다. 이 디렉터리는 백업 구조 호환성을 위해 포함됩니다.');
  for (const entry of entries) {
    const item = evidence.find((e) => e.evidence_id === entry.evidence_id)!;
    zip.file(entry.path, item.file_blob, { binary: true });
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function parseJson<T>(text: string, name: string): T {
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`${name} JSON을 해석할 수 없습니다`); }
}

function entryDeclaredSize(entry: JSZip.JSZipObject) {
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  return typeof data?.uncompressedSize === 'number' ? data.uncompressedSize : null;
}

export async function validateCaseBackupZip(blob: Blob): Promise<RestoreBundle> {
  if (!(blob instanceof Blob)) throw new Error('백업 파일 Blob이 필요합니다');
  if (blob.size > MAX_BACKUP_INPUT_BYTES) throw new Error('백업 ZIP 입력 크기가 V0.1 한도를 초과했습니다');
  const zip = await JSZip.loadAsync(blob, { checkCRC32: true });
  const entries = Object.values(zip.files);
  if (entries.length > MAX_BACKUP_ENTRIES) throw new Error('백업 ZIP 항목 수가 허용 한도를 초과했습니다');
  for (const entry of entries) {
    const unsafeOriginalName = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName;
    const pathToCheck = unsafeOriginalName || entry.name;
    if (!entry.dir && !isSafeZipPath(pathToCheck)) throw new Error(`위험한 ZIP 경로를 거부했습니다: ${pathToCheck}`);
    const declared = entryDeclaredSize(entry);
    if (declared != null && declared > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error(`압축 해제 크기가 비정상적으로 큽니다: ${entry.name}`);
  }
  for (const required of REQUIRED_JSON) if (!zip.file(required)) throw new Error(`필수 백업 항목 누락: ${required}`);

  const manifestText = await zip.file('manifest.json')!.async('text');
  const manifest = parseJson<BackupManifest>(manifestText, 'manifest.json');
  if (manifest.package_type !== BACKUP_TYPE) throw new Error('지원하지 않는 백업 패키지 형식입니다');
  if (manifest.schema_version !== BACKUP_SCHEMA_VERSION) throw new Error(`지원하지 않는 백업 스키마 버전입니다: ${manifest.schema_version}`);
  if (manifest.encrypted !== false) throw new Error('V0.1은 암호화 백업으로 표시된 패키지를 지원하지 않습니다');
  if (!Number.isInteger(manifest.file_count) || manifest.file_count < 0 || manifest.file_count > 100) throw new Error('manifest file_count가 올바르지 않습니다');
  if (!Number.isFinite(manifest.total_raw_bytes) || manifest.total_raw_bytes < 0 || manifest.total_raw_bytes > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error('manifest total_raw_bytes가 허용 범위를 벗어났습니다');
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== manifest.file_count) throw new Error('manifest 파일 목록과 file_count가 일치하지 않습니다');

  const casesText = await zip.file('cases.json')!.async('text');
  const evidenceText = await zip.file('evidence.json')!.async('text');
  const claimsText = await zip.file('claims.json')!.async('text');
  const timelinesText = await zip.file('timelines.json')!.async('text');
  const submissionsText = await zip.file('submissions.json')!.async('text');
  const metadataTexts: Record<string, string> = {
    'cases.json': casesText,
    'evidence.json': evidenceText,
    'claims.json': claimsText,
    'timelines.json': timelinesText,
    'submissions.json': submissionsText,
  };
  for (const [name, text] of Object.entries(metadataTexts)) {
    const expected = manifest.metadata_sha256?.[name];
    if (!expected || expected !== await sha256Text(text)) throw new Error(`메타데이터 해시 불일치: ${name}`);
  }

  const cases = parseJson<CaseRecord[]>(casesText, 'cases.json');
  const evidenceMeta = parseJson<Array<Omit<EvidenceRecord, 'file_blob'>>>(evidenceText, 'evidence.json');
  const claims = parseJson<ClaimRecord[]>(claimsText, 'claims.json');
  const facts = parseJson<FactRecord[]>(timelinesText, 'timelines.json');
  const submissions = parseJson<SubmissionRecord[]>(submissionsText, 'submissions.json');
  if (!Array.isArray(cases) || cases.length !== 1) throw new Error('사건 백업에는 정확히 1개의 사건이 있어야 합니다');
  if (!Array.isArray(evidenceMeta) || !Array.isArray(claims) || !Array.isArray(facts) || !Array.isArray(submissions)) throw new Error('백업 데이터 구조가 올바르지 않습니다');
  const caseRecord = cases[0];
  if (caseRecord.case_id !== manifest.case_id) throw new Error('manifest와 사건 ID가 일치하지 않습니다');
  const caseErrors = validateCase(caseRecord);
  if (caseErrors.length) throw new Error(`사건 데이터 오류: ${caseErrors.join('; ')}`);

  const evidence: EvidenceRecord[] = [];
  let extractedBytes = 0;
  const seenEvidenceIds = new Set<string>();
  const seenHashes = new Set<string>();
  for (const meta of evidenceMeta) {
    if (meta.case_id !== caseRecord.case_id) throw new Error(`사건 간 증거 혼합 차단: ${meta.evidence_id}`);
    if (seenEvidenceIds.has(meta.evidence_id)) throw new Error(`중복 evidence_id: ${meta.evidence_id}`);
    seenEvidenceIds.add(meta.evidence_id);
    if (seenHashes.has(meta.sha256)) throw new Error(`동일 사건 내 중복 SHA-256 백업 거부: ${meta.evidence_id}`);
    seenHashes.add(meta.sha256);
    const metaErrors = validateEvidenceMeta(meta);
    if (metaErrors.length) throw new Error(`증거 메타데이터 오류(${meta.evidence_id}): ${metaErrors.join('; ')}`);
    if (meta.file_size > MAX_FILE_BYTES) throw new Error(`증거 파일 크기 한도 초과: ${meta.evidence_id}`);
    const manifestEntry = manifest.entries.find((entry) => entry.evidence_id === meta.evidence_id);
    if (!manifestEntry) throw new Error(`manifest에 증거 원본 경로가 없습니다: ${meta.evidence_id}`);
    if (!isSafeZipPath(manifestEntry.path)) throw new Error(`위험한 원본 경로: ${manifestEntry.path}`);
    if (manifestEntry.file_size !== meta.file_size || manifestEntry.sha256 !== meta.sha256) throw new Error(`manifest와 증거 메타데이터가 불일치합니다: ${meta.evidence_id}`);
    const zipEntry = zip.file(manifestEntry.path);
    if (!zipEntry) throw new Error(`원본 파일 누락: ${manifestEntry.path}`);
    const declared = entryDeclaredSize(zipEntry);
    if (declared != null && declared > MAX_FILE_BYTES) throw new Error(`원본 압축 해제 크기 한도 초과: ${meta.evidence_id}`);
    const bytes = await zipEntry.async('uint8array');
    extractedBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_FILE_BYTES || extractedBytes > MAX_BACKUP_UNCOMPRESSED_BYTES) throw new Error('압축 해제 크기 제한을 초과했습니다');
    if (bytes.byteLength !== meta.file_size) throw new Error(`원본 파일 크기 불일치: ${meta.evidence_id}`);
    const ownedBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ownedBuffer).set(bytes);
    const file_blob = new Blob([ownedBuffer], { type: meta.mime_type || 'application/octet-stream' });
    const actualHash = await sha256Blob(file_blob);
    if (actualHash !== meta.sha256) throw new Error(`원본 SHA-256 불일치: ${meta.evidence_id}`);
    evidence.push({ ...meta, file_blob });
  }
  if (extractedBytes !== manifest.total_raw_bytes) throw new Error('manifest 총 원본 크기와 실제 압축 해제 크기가 일치하지 않습니다');

  const evidenceMap = new Map(evidence.map((item) => [item.evidence_id, item]));
  const allIds = [
    ...evidence.map((x) => x.evidence_id), ...claims.map((x) => x.claim_id), ...facts.map((x) => x.fact_id), ...submissions.map((x) => x.submission_id),
  ];
  if (new Set(allIds).size !== allIds.length) throw new Error('백업 내 객체 ID가 충돌합니다');
  for (const claim of claims) {
    if (claim.case_id !== caseRecord.case_id) throw new Error(`사건 간 주장 혼합 차단: ${claim.claim_id}`);
    const errors = validateClaim(claim, evidenceMap); if (errors.length) throw new Error(`주장 오류(${claim.claim_id}): ${errors.join('; ')}`);
  }
  for (const fact of facts) {
    if (fact.case_id !== caseRecord.case_id) throw new Error(`사건 간 타임라인 혼합 차단: ${fact.fact_id}`);
    const errors = validateFact(fact, evidenceMap); if (errors.length) throw new Error(`타임라인 오류(${fact.fact_id}): ${errors.join('; ')}`);
  }
  for (const submission of submissions) {
    if (submission.case_id !== caseRecord.case_id) throw new Error(`사건 간 제출기록 혼합 차단: ${submission.submission_id}`);
    const errors = validateSubmission(submission, evidenceMap); if (errors.length) throw new Error(`제출기록 오류(${submission.submission_id}): ${errors.join('; ')}`);
  }

  return { caseRecord, evidence, claims, facts, submissions, manifest };
}
