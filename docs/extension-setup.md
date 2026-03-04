[← README](../README.md)

# Chrome Extension 설치 가이드

## 개요

Gran Maestro Chrome Extension(UI Picker)은 브라우저에서 직접 UI 요소를 선택하고 메모를 남길 수 있는 도구입니다. 웹 페이지 위에 오버레이를 띄워 원하는 요소를 클릭하고, 캡처·태깅·즉시 메모를 Gran Maestro 워크플로우와 연동합니다.

플러그인 설치 환경에서는 Extension 파일이 안정 경로(`~/.gran-maestro/chrome-extension/`)에 복사되어, 플러그인 업데이트 시에도 Chrome에 등록된 Extension 경로를 재등록할 필요가 없습니다. 이 복사는 `/mst:setup-extension` 및 `/mst:on` 실행 시 자동으로 수행됩니다.

> **참고**: `/mst:setup-extension`을 실행하면 Extension이 안정 경로(`~/.gran-maestro/chrome-extension/`)에 자동으로 설정됩니다. 수동 설치가 필요한 경우 아래 [수동 설치](#수동-설치) 섹션을 참고하세요.

## 사전 요구사항

- Chrome 브라우저 (v120 이상)
- Gran Maestro 플러그인 설치 완료

## 빠른 설치 (CLI)

`/mst:setup-extension` 명령어로 설치 안내를 자동으로 받을 수 있습니다.

```
/mst:setup-extension
```

이 명령어는 자동으로 안정 경로에 Extension을 복사(`extension ensure-copy`)한 뒤, `chrome://extensions` 페이지를 열고 Extension 경로를 클립보드에 복사하여 연결 상태를 확인합니다.

| 옵션 | 설명 |
|------|------|
| (없음) | chrome://extensions 페이지 자동 오픈 + 경로 클립보드 복사 |
| `--skip-open` | chrome:// 자동 오픈 생략 (수동으로 이미 열어 둔 경우) |

## 수동 설치

CLI를 사용하지 않는 경우 아래 3단계로 직접 설치할 수 있습니다.

### Step 1: 확장 프로그램 페이지 열기

Chrome 브라우저 주소창에 다음을 입력하고 Enter:

```
chrome://extensions
```

또는 Chrome 메뉴 → "도구 더보기" → "확장 프로그램"을 선택합니다.

{스크린샷: chrome://extensions 페이지}

### Step 2: 개발자 모드 활성화

페이지 우측 상단의 **개발자 모드** 토글을 켜세요.

토글을 활성화하면 "압축 해제된 확장 프로그램 로드" 버튼이 나타납니다.

{스크린샷: 개발자 모드 토글 활성화}

### Step 3: Extension 로드

"압축 해제된 확장 프로그램 로드" 버튼을 클릭한 뒤, 파일 선택 창에서 설치 형태에 맞는 Extension 경로를 입력합니다.

**Extension 경로 (설치 형태별):**

| 설치 형태 | Extension 경로 | 설명 |
|-----------|---------------|------|
| 플러그인 설치 | `~/.gran-maestro/chrome-extension/` | 안정 경로 — 플러그인 업데이트와 독립적 |
| 프로젝트 설치 | `{PLUGIN_ROOT}/extension/` | 소스 디렉토리 직접 사용 |

정확한 경로는 `/mst:setup-extension` 실행 시 클립보드에 자동 복사됩니다.

#### OS별 파일 선택 창 팁

파일 선택 창에서 경로를 직접 붙여넣는 방법은 OS마다 다릅니다.

| OS | 방법 |
|----|------|
| **macOS** | `Cmd+Shift+G`를 눌러 경로 입력창을 열고 경로를 붙여넣은 뒤 Enter |
| **Linux** | 파일 관리자 주소 입력창에 직접 붙여넣기 (주소창이 없으면 `Ctrl+L` 시도) |
| **Windows** | 탐색기 주소창에 직접 붙여넣고 Enter |

경로를 입력한 뒤 "열기"(또는 "선택")를 클릭하면 Extension이 Chrome에 추가됩니다.

## 연결 확인

Extension을 로드한 후 Dashboard 서버와의 연결을 확인합니다.

1. **Dashboard 서버 실행**: 터미널에서 `/mst:dashboard`를 실행하세요. 서버가 실행 중이 아니면 Extension이 연결되지 않습니다.
2. **Extension 아이콘 클릭**: Chrome 툴바의 Gran Maestro Extension 아이콘을 클릭합니다. 아이콘이 보이지 않으면 퍼즐 조각 아이콘(확장 프로그램 메뉴)에서 고정(핀)하세요.
3. **연결 상태 확인**: 팝업 상단에 "연결됨" 상태가 표시되면 정상입니다.

> Dashboard 서버가 실행되지 않은 경우 `/mst:dashboard`로 먼저 시작하세요.

## 업데이트

안정 경로(`~/.gran-maestro/chrome-extension/`)를 사용하는 경우, `/mst:on` 실행 시 자동으로 최신 버전이 복사됩니다. `/mst:setup-extension`을 실행해도 동일한 업데이트가 수행됩니다. Extension이 업데이트되면 `chrome://extensions` 페이지에서 새로고침 아이콘을 클릭하라는 안내가 표시됩니다.

수동으로 업데이트하려면:

1. `chrome://extensions` 페이지를 엽니다.
2. Gran Maestro Extension 카드에서 새로고침 아이콘(순환 화살표)을 클릭합니다.
3. 페이지를 새로고침하여 변경사항이 반영되었는지 확인합니다.

## 개발자 모드 경고 대처

Chrome을 시작할 때 "개발자 모드의 확장 프로그램을 비활성화하세요" 팝업이 나타날 수 있습니다. 이는 Chrome Web Store를 통하지 않고 직접 설치된 Extension에 대한 일반적인 경고입니다.

- **"무시"** 또는 **"취소"** 를 클릭하면 Extension이 계속 활성화된 상태로 유지됩니다.
- **"비활성화"** 를 클릭하면 Extension이 꺼집니다. 이 경우 `chrome://extensions`에서 다시 활성화하세요.

Chrome 시작 시마다 이 경고가 반복되는 것은 정상 동작입니다.

## 문제 해결

| 증상 | 해결 방법 |
|------|-----------|
| Extension 로드 실패 | `{PLUGIN_ROOT}/extension/` 경로가 올바른지 확인. `manifest.json` 파일이 해당 디렉토리에 존재하는지 확인 |
| Dashboard 연결 안 됨 | `/mst:dashboard`로 서버를 먼저 실행. 서버 포트 설정(`server.port`)과 Extension 연결 포트가 일치하는지 확인 |
| "개발자 모드" 토글이 보이지 않음 | Chrome 정책으로 개발자 모드가 차단된 경우. 관리자 계정 또는 일반 Chrome 프로필에서 시도 |
| Extension 아이콘이 툴바에 없음 | Chrome 툴바의 퍼즐 조각 아이콘 클릭 → Gran Maestro 옆 핀 아이콘 클릭하여 고정 |
| 플러그인 업데이트 후 Extension 오동작 | `chrome://extensions`에서 새로고침 버튼 클릭 후 재확인 |
| `{PLUGIN_ROOT}/extension/` 경로가 없음 | 플러그인을 최신 버전으로 업데이트하세요. 해당 경로는 업데이트 후 생성됩니다 |
| `extension ensure-copy` 실패 경고 | `mst.py` 스크립트 오류 또는 구버전. 경고만 출력되며 기존 경로(`{PLUGIN_ROOT}/extension/`)로 계속 진행됩니다. 플러그인을 최신 버전으로 업데이트하면 해결됩니다 |
| 안정 경로(`~/.gran-maestro/chrome-extension/`)가 생성되지 않음 | `/mst:setup-extension`을 실행하여 `extension ensure-copy`를 재시도하세요. 프로젝트 설치 환경에서는 안정 경로가 생성되지 않으며, `{PLUGIN_ROOT}/extension/`을 직접 사용합니다 |
