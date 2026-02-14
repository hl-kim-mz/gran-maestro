# Review Report - {TASK_ID}

- Review Round: {N}
- Result: PASS | FAIL | PARTIAL
- Date: {DATE}
- Reviewer: PM Conductor + {Review Squad 구성}

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
