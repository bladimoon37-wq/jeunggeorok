# 증거록 V0.1 — Browser Release Checklist

## Reference acceptance scenario

가상 사건: 임대차보증금 반환 / 2026가단12345 / 원고 / 가상 테스트 법원

- 갑 제1호증 — 임대차계약서
- 갑 제2호증 — 보증금 이체내역
- 갑 제3호증 — 계약 종료 통지

## MINOS

- [ ] Case CRUD / 사건번호 공란
- [ ] 한글 제목 및 파일명
- [ ] 3개 원본 등록 / SHA-256 생성
- [ ] 원본 다운로드 후 바이트/해시 동일
- [ ] 동일 원본 중복 SHA 차단
- [ ] 갑/을/가지번호 및 번호 중복 차단
- [ ] 제출 완료 번호 변경 확인 + history 기록
- [ ] 지원/반대 증거 연결
- [ ] 다른 사건 증거 연결 차단
- [ ] 증거 삭제 후 주장/타임라인 참조 정리
- [ ] 월/날짜/정확 일시/날짜 미상 정렬
- [ ] A4 HTML / Print-to-PDF 한글·긴 증거명·특수문자
- [ ] CSV Formula Injection
- [ ] F5 후 IndexedDB 유지
- [ ] 전체 ZIP 백업 생성
- [ ] 동일 ID 복원 silent overwrite 차단
- [ ] 기존 사건 백업 후 삭제 → 복원 → 3개 원본 SHA 동일
- [ ] 제출 상태·주장 연결·타임라인 일치

## AIGIS

- [ ] Stored XSS payload가 HTML로 실행되지 않음
- [ ] 악성 파일명 안전 처리
- [ ] MIME/확장자 불일치 경고
- [ ] Malformed ZIP 거부
- [ ] ZIP path traversal 거부
- [ ] ZIP oversized/uncompressed limit 거부
- [ ] Corrupted evidence ZIP 거부
- [ ] Restore 실패 시 기존 데이터 보존
- [ ] 원본 무결성 실패 시 다운로드/출력/백업 차단
- [ ] Local Network: 사용자 동작 중 외부 Fetch/XHR 0
- [ ] Production Network: 사용자 동작 중 사건 자료 외부 전송 0
- [ ] `npm audit --omit=dev` 결과 기록

필수 항목을 실행하지 않았으면 PASS가 아니라 UNVERIFIED입니다.
