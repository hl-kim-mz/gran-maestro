---
name: start
description: "⚠️ Deprecated: /mst:start는 /mst:request로 이동되었습니다. 사용자가 /mst:start를 호출하면 자동으로 /mst:request를 실행합니다."
user-invocable: true
argument-hint: "[--auto|-a] {요청 내용}"
---

# maestro:start — Deprecated

> ⚠️ **이 스킬은 deprecated되었습니다.**
> `/mst:start`는 `/mst:request`로 이름이 변경되었습니다.

## 자동 리다이렉트

이 스킬이 호출되면 동일한 인자로 즉시 `mst:request`를 실행합니다:

```
Skill(skill: "mst:request", args: "{전달받은 모든 인자 그대로}")
```

사용자에게 아래 메시지를 표시한 뒤 즉시 실행합니다:

```
[안내] /mst:start는 /mst:request로 이름이 변경되었습니다. 앞으로는 /mst:request를 사용하세요.
```
