# AIGIS SECURITY NOTES — 증거록 V0.1 RC

현재 단계: **RC / 독립 AIGIS 최종 승인 전**

설계 방어:

- 앱 소스에 외부 fetch/XHR/WebSocket/beacon/분석 SDK 없음
- React 텍스트 렌더링 + HTML 보고서 escape
- CSV Formula Injection 중화
- 원본을 iframe/object/embed로 렌더링하지 않음
- Object URL은 다운로드 후 해제
- Cloudflare `_headers` CSP: object/frame 금지, connect-src self
- 20MiB 단일 원본 제한, 브라우저 storage estimate 검사
- ZIP 입력 40MiB, 파일 수/압축 해제 총량 제한
- ZIP path traversal, 스키마, 메타데이터 해시, 원본 SHA-256, cross-case 참조 검증
- 복원은 기존 ID 충돌 시 silent overwrite 금지
- 복원 쓰기는 cases/evidence/claims/facts/submissions 단일 IndexedDB readwrite transaction
- 증거 삭제 시 관련 참조를 같은 transaction에서 정리하며 다른 증거번호를 자동 재배정하지 않음
- 제출 기록 생성 전 원본 SHA-256 재검증
- 보고서/CSV/JSON/백업/원본 다운로드 전 원본 무결성 재검증

독립 검증 필요:

- Production DevTools Network에서 사건 자료 외부 전송 0 확인
- Stored XSS 실제 브라우저 확인
- 악성 파일명 다운로드 확인
- ZIP bomb/malformed ZIP 브라우저 확인
- 저장소 한도 초과 실제 브라우저 확인
- Cloudflare 보안 헤더 실배포 확인
