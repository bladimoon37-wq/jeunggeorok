
## V0.1 RC V1.2 FIX1
- Fixed DB integration test fixture so `을 제N호증` derives the matching internal exhibit prefix instead of hard-coding `갑`.
- Fixed TypeScript `BlobPart` compatibility during ZIP restore by copying JSZip `Uint8Array` bytes into an owned `ArrayBuffer` before Blob construction.
# CHANGELOG

## V0.1 RC — Development Order V1.2

- 브랜드를 `증거록`으로 재설계, 한국어 UI 우선
- 한국 민사소송 사건 유형 / 사건번호 공란 / 원고·피고 역할
- 갑호증·을호증·가지번호·사용자 접두사 및 변경 이력
- 제출 상태/제출 기록/제출 사본 SHA-256
- 날짜 정밀도(일시/날짜/월/미상)
- 20MiB 파일 정책 및 한국 실무 파일 형식 보관
- 실제 ZIP 기반 전체 백업/복원 및 원자성 강화
- A4 한국어 증거목록/증거설명서/타임라인/연결표 보고서
- SEO/Cloudflare 보안 헤더/개인정보 안내
