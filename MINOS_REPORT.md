# MINOS RELEASE GATE — 증거록 V0.1 RC

현재 판정: **UNVERIFIED — 출시 승인 전 실제 테스트 필요**

자동 테스트 소스에는 사건 모델, 증거번호/가지번호, 번호 이력, 날짜 정밀도, SHA-256, cross-case 방어, 보고서 escape, CSV injection, ZIP 백업/복원 검증 및 IndexedDB 원자성 테스트가 포함되어 있습니다.

치명적 Gate:

- 원본 변조/해시 불일치
- 데이터 손실
- 사건 간 데이터 혼합
- 증거번호 silent collision
- 손상 백업 정상 복원
- 백업 복원 중 기존 데이터 훼손
- 개인정보 외부 전송

위 항목 중 하나라도 FAIL 또는 UNVERIFIED이면 최종 출시 PASS를 부여하지 않습니다.
