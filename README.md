# 증거록 V0.1

**흩어진 증거를, 명확한 기록으로.**

대한민국의 나홀로 민사소송 당사자가 사건별로 원본 증거를 로컬 브라우저에 보관하고, 갑호증·을호증 번호, 입증취지, 주장, 타임라인, 제출 기록을 연결해 검토 가능한 증거목록과 보고서를 만드는 정적 웹앱입니다.

> 증거록은 법원 공식 서비스가 아니며 법률 자문, 증거능력, 제출 성공 또는 소송 결과를 보증하지 않습니다.

## 기술

React + TypeScript + Vite + IndexedDB + Web Crypto SHA-256 + JSZip + Vitest. 백엔드, 로그인, 외부 AI API, 분석/광고 SDK는 사용하지 않습니다.

## 주요 기능

- 사건 CRUD, 접수 전 사건번호 공란 허용
- PDF/JPG/PNG/TXT/HWP/HWPX/DOC/DOCX/XLS/XLSX/MP3/M4A/MP4 원본 바이너리 저장
- 단일 원본 최대 20MiB
- 원본 SHA-256 생성 및 다운로드/출력/백업 전 재검증
- 동일 사건 중복 SHA-256 차단
- 갑 제1호증 / 을 제1호증 / 가지번호 / 사용자 접두사
- 제출 완료 후 증거번호 변경 확인 + 변경 이력
- 사용자 주장, 입증취지, 지원/반대 증거 연결
- 날짜 정밀도: 정확한 일시 / 날짜 / 월 / 미상
- 사용자 제출 기록 및 제출 사본 해시 스냅샷
- A4 HTML 보고서, 브라우저 PDF 저장, CSV, JSON
- ZIP 전체 백업: 원본 + 메타데이터 + 해시 + manifest
- ZIP 복원: 스키마/경로/크기/해시/참조/ID 충돌 검증 후 원자적 IndexedDB 복원
- 가상의 임대차보증금 반환 샘플 사건

## 로컬 실행

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev
npm.cmd run dev
```

`http://localhost:5173/` 접속 후 `가상 임대차 사건 불러오기`로 민감정보 없는 테스트 데이터를 만들 수 있습니다.

## 배포

`npm.cmd run build` 후 생성되는 `dist` 폴더를 Cloudflare Static Assets에 배포합니다. `public/_headers`는 CSP, nosniff, referrer/permissions 정책을 포함합니다.

## 중요한 데이터 보존 안내

IndexedDB는 영구 보관을 보장하지 않습니다. 브라우저 데이터 삭제, 프로필 초기화, 저장소 정책 등에 의해 데이터가 사라질 수 있습니다. 사건마다 정기적으로 **전체 ZIP 백업**을 생성해 별도 안전 위치에 보관하십시오. 백업은 암호화되지 않습니다.

## 범위 밖

자동 소장 작성, 법률 자문, 승소 예측, OCR, AI 증거 해석, 판례 검색, 전자소송 자동 로그인/제출, 클라우드 동기화, HWP/HWPX 보고서 생성은 V0.1 범위 밖입니다.
