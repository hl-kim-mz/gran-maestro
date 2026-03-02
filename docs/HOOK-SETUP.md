# Hook 설정 가이드

## PreToolUse Hook으로 config resolve 자동 실행

Claude Code의 PreToolUse hook을 사용하면 매 Skill 실행 전 자동으로 `config resolve`를 수행하여
항상 최신 merged config를 사용할 수 있습니다.

### 설정 방법

`~/.claude/settings.json` (또는 프로젝트의 `.claude/settings.json`)에 아래 항목을 추가합니다:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "command": "python3 ~/.claude/plugins/cache/gran-maestro/mst/0.44.1/scripts/mst.py config resolve"
      }
    ]
  }
}
```

> **경로 확인 방법**: 위 경로의 버전 부분(`0.44.1`)은 설치된 버전에 맞게 수정하세요.
> 정확한 경로는 아래 명령어로 확인할 수 있습니다:
> ```bash
> ls ~/.claude/plugins/cache/gran-maestro/mst/
> ```

### 동작 원리

1. Claude Code가 Skill 도구를 호출하기 전 hook이 트리거됩니다
2. `mst.py config resolve`가 실행되어 `templates/defaults/config.json`(디폴트)과 `.gran-maestro/config.json`(사용자 오버라이드)를 deep merge합니다
3. 결과가 `.gran-maestro/config.resolved.json`에 기록됩니다
4. 스킬은 항상 최신 resolved config를 참조합니다

### 참고

- 대시보드 서버 실행 중에는 서버가 자동으로 resolved.json을 관리하므로 hook이 불필요할 수 있습니다
