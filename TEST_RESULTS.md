# TEST RESULTS — 증거록 V0.1 RC V1.2 FIX1

## 사용자 환경 1차 실행 결과 (2026-10-22)

- `npm install`: 완료
- Vitest: **46/47 PASS, 1 FAIL**
  - 실패 원인: DB 통합 테스트 픽스처가 `을 제1호증` 표시값과 내부 `exhibit_prefix=갑`을 불일치하게 생성
  - 제품 DB 검증 로직이 불일치를 정상적으로 차단함
- Production build: **FAIL**
  - 실패 원인: JSZip `Uint8Array<ArrayBufferLike>`를 BlobPart로 직접 전달할 때 TypeScript 5.x 타입 호환 오류
- `npm audit --omit=dev`: **0 vulnerabilities**
- Dev server: **PASS** (`http://localhost:5173/`)

## FIX1 변경

1. DB 테스트 헬퍼가 표시 증거번호(`갑/을/...`)에서 접두사를 파싱하여 내부 `exhibit_prefix`와 일치시키도록 수정.
2. ZIP 복원 바이트를 새 `ArrayBuffer`에 복사한 뒤 `Blob`을 생성하도록 수정하여 `BlobPart` 타입 호환 문제 제거.

## FIX1 재검증 필요

아래 명령을 사용자 환경에서 다시 실행한다.

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev
npm.cmd run dev
```

목표:

- **47/47 tests PASS**
- **Production build PASS**
- **Production dependency audit 0 vulnerabilities**
- 브라우저 검증 완료

FIX1 재실행 전 최종 MINOS/AIGIS 판정은 **UNVERIFIED**다.
