# Review Report - {TASK_ID}

- Review Round: {N}
- Result: PASS | FAIL | PARTIAL
- Date: {DATE}
- Reviewer: PM Conductor + {Review Squad 구성}

## 사전 분석 (Automated Pre-checks)

### Quality Precheck (Codex)
- 린트/컨벤션 위반: {N건}
- 데드 코드: {N건}
- 네이밍 이슈: {N건}
- 상세: {trace 파일 경로}

### Security Scan (Gemini)
- 취약점 후보: {N건}
- 심각도별: Critical {N} / High {N} / Medium {N} / Low {N}
- 상세: {trace 파일 경로}
- Claude Security Reviewer 최종 판정: {각 후보별 확인/기각}

## AI 의견

- **Claude Code (PM)**: ...
- **Security Reviewer**: ... (Review Squad 활용 시)
- **Quality Reviewer**: ... (Review Squad 활용 시)
- **Verifier**: ... (Review Squad 활용 시)
- **Codex**: ...
- **Gemini**: ...

## 종합 판단

{PM의 최종 판단 및 근거}

## 수락 조건 결과

- [ ] AC-1: {통과 | 미충족 — 사유}
- [ ] AC-2: {통과 | 미충족 — 사유}
- [ ] AC-3: {통과 | 미충족 — 사유}
- [ ] AC-4: {통과 | 미충족 — 사유}
- [ ] AC-5: {통과 | 미충족 — 사유}

## 진단 결과

- Type Check: {PASS | FAIL — 오류 수}
- Lint: {PASS | FAIL — 경고/오류 수}
- Tests: {PASS | FAIL — 통과/실패/전체}
- Code Diff: {+N / -M lines, K files}

## 다음 단계

- PASS → Phase 5 (수락)
- FAIL → Phase 4 (피드백 루프)
- PARTIAL → Phase 4 (부분 피드백)
