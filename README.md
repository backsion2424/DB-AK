# DB Archive

로컬 영상 보관함 데스크톱 앱 (Electron + React + SQLite).

## 사전 조건
- **Node.js 20 또는 22 LTS** (`.nvmrc` = 22). Node 23/24+ 는 `better-sqlite3` prebuilt 바이너리가 없어 native 컴파일로 빠지고 빌드가 실패한다 — 반드시 LTS를 쓸 것.
- Node 20/22 에서는 prebuilt 바이너리를 받으므로 Visual Studio C++ 빌드 도구·Python 불필요.

## 개발

```powershell
npm install
npm run electron:dev
```

`electron:dev`는 Vite dev 서버를 띄우고 Electron 메인 프로세스를 실행합니다.

## 빌드 (.exe)

```powershell
npm run electron:build
```

또는 비개발자용: `exe_빌드.bat` 더블클릭. (Node 버전이 20/22가 아니면 빌드 전에 막고 안내한다.)

`release/` 디렉토리에 단일 포터블 `.exe`(`DB-Archive-<version>.exe`)가 생성됩니다. 설치 없이 더블클릭으로 바로 실행되며, USB/다른 PC로 복사해서 그대로 사용할 수 있습니다.

## 데이터 위치
- DB: `%APPDATA%\db-archive\db-archive.sqlite`
- 설정 (Gemini 키 등): `%APPDATA%\db-archive\settings.json`

## 사용

1. 앱 첫 실행 시 성인 인증 코드 입력
2. 메뉴 [파일] → [폴더 가져오기]로 영상 폴더 선택
3. 품번 자동 메타데이터 수집을 쓰려면 [설정] → [AI 키] 탭에서 Gemini API 키 등록
