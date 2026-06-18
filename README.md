<div align="center">

# 🐾 방울냥 (Tinklepaw / Nyaru)

**한국 마인크래프트 커뮤니티를 위한 올인원 플랫폼**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white)](https://kotlinlang.org/)
[![Rust](https://img.shields.io/badge/Rust-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri_v2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://tauri.app/)
[![Discord.js](https://img.shields.io/badge/Discord.js-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.js.org/)

[웹사이트](https://tinklepaw.vercel.app) · [런처 다운로드](https://github.com/INIRU/Tinklepaw/releases)

</div>

---

## 개요

방울냥은 마인크래프트 커뮤니티 서버를 위한 통합 플랫폼이에요.
Discord 봇, 웹 대시보드, 전용 런처, 마인크래프트 플러그인이 하나의 모노레포에서 함께 작동하며, Supabase를 통해 데이터를 공유해요.

```
방울냥 서버 참여
   │
   ├── 🎮 런처로 원클릭 접속         (apps/launcher)
   ├── 🤖 Discord 봇으로 경제 활동    (apps/bot)
   ├── 🌐 웹 대시보드로 현황 확인     (apps/web)
   └── ⛏️  마인크래프트 인게임 활동   (apps/minecraft/plugin)
```

---

## 아키텍처

상세한 모듈 경계와 배포 흐름은 [시스템 아키텍처 문서](docs/architecture.md)에서 확인할 수 있어요.

```
┌──────────────────────────────────────────────────────────────────┐
│                         방울냥 모노레포                            │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  apps/bot   │  │  apps/web   │  │     apps/launcher        │  │
│  │ Discord.js  │  │  Next.js 16 │  │   Tauri v2 + React       │  │
│  │ 경제·가챠    │  │  웹 대시보드 │  │   Minecraft 런처          │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬─────────────┘  │
│         │                │                       │                │
│         └────────────────┴───────────────────────┘                │
│                          │                                        │
│               ┌──────────▼──────────┐                             │
│               │    packages/core    │                             │
│               │  공유 타입 · Supabase│                             │
│               └──────────┬──────────┘                             │
│                          │                                        │
│               ┌──────────▼──────────┐                             │
│               │      Supabase       │                             │
│               │   PostgreSQL DB     │                             │
│               └─────────────────────┘                             │
│                                                                  │
│  ┌───────────────────────────────────────────┐                   │
│  │         apps/minecraft/plugin             │                   │
│  │         Kotlin · Paper 1.21.11            │                   │
│  │     마켓 · 직업 · 퀘스트 · P2P · 스킬     │                   │
│  └───────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘

배포
 ├── apps/bot          → Docker → Dokploy (VPS)
 ├── apps/web          → Vercel
 ├── apps/launcher     → GitHub Actions → GitHub Releases
 └── minecraft/plugin  → Gradle ShadowJar → Dokploy (Minecraft 서버)
```

---

## 주요 기능

<details>
<summary><strong>🤖 Discord 봇 — 경제 시스템</strong></summary>
<br>

| 명령어 | 설명 |
|--------|------|
| `/뽑기` | 가챠로 역할 획득, 웹 연출 지원 |
| `/일일상자` | 하루 1회 포인트 보상 |
| `/복권` | 500p 즉석 복권 |
| `/주식` | 캔들차트 · 매수 · 매도 패널 |
| `/가방` | 보유 아이템 조회 |
| `/착용` / `/해제` | 역할 장착 · 해제 |
| `/도움말` | 명령어 목록 |

**추가 기능:**
- 자동 시장 조성자 기반 주식 시장 (보유세 포함)
- Gemini / Groq AI 연동
- 음악 플레이어 (음성 채널)
- 음성 채널 자동 생성 및 관리
- Discord ↔ 마인크래프트 계정 연동 (`/마인크래프트연동`)
- 관리자 알림 발송

</details>

<details>
<summary><strong>🌐 웹 대시보드</strong></summary>
<br>

- **가챠 연출** — 애니메이션 카드 뽑기 (모바일 최적화)
- **인벤토리** — 보유 역할 · 아이템 시각화
- **주식 차트** — 실시간 캔들스틱 차트
- **라이트 / 다크 모드** — 글래스모피즘 디자인
- **반응형** — 모바일 · 데스크탑 완전 대응
- Supabase 인증 (Discord OAuth)

**디자인 시스템:**

| 이름 | 색상 | 헥스 |
|------|------|------|
| 핑크 | 🩷 | `#ff5fa2` |
| 라벤더 | 💜 | `#bca7ff` |
| 스카이 | 💙 | `#78b7ff` |
| 민트 | 🩵 | `#39d3b3` |
| 레몬 | 💛 | `#ffd36a` |

</details>

<details>
<summary><strong>🎮 전용 런처</strong></summary>
<br>

커뮤니티 서버 전용 Minecraft 런처예요. 복잡한 설치 없이 바로 접속할 수 있어요.

- **Microsoft OAuth 로그인** — 팝업 WebviewWindow로 안전하게 인증
- **Java 21 자동 설치** — Java가 없으면 자동으로 내려받아 설치
- **서버 자동 등록** — `servers.dat` 자동 수정으로 서버 목록에 즉시 추가
- **자동 업데이트** — GitHub Releases 기반 업데이트 감지 및 원클릭 적용
- **플레이어 아바타** — Microsoft 계정 Minecraft 프로필 스킨 표시
- **서버 상태** — 실시간 서버 온라인 여부 표시

**지원 플랫폼:**

| 플랫폼 | 지원 |
|--------|------|
| macOS Apple Silicon | ✅ |
| macOS Intel | ✅ |
| Windows x64 | ✅ |

</details>

<details>
<summary><strong>⛏️ 마인크래프트 플러그인 (Paper 1.21.11)</strong></summary>
<br>

인게임에서 포인트를 벌고 다양한 경제 활동을 할 수 있어요.

**명령어:**

| 명령어 | 설명 |
|--------|------|
| `/market` | 작물 · 광물을 포인트로 판매 |
| `/job` | 농부 · 광부 직업 선택 |
| `/quest` | 퀘스트 목록 및 진행 |
| `/skill` | 스킬 확인 및 업그레이드 |
| `/trade` | P2P 아이템 거래 |
| `/balance` | 포인트 잔액 확인 |
| `/link` / `/unlink` | Discord 계정 연동 · 해제 |
| `/protect` | 영역 보호 설정 |
| `/team` | 팀 생성 및 관리 |

**플러그인 기능:**
- 블록 채굴 · 파밍 시 포인트 자동 지급
- 직업별 스킬 트리 및 레벨업 이펙트
- NPC 상점 (FancyNpcs 연동)
- 블록 로그 기록
- 영역 보호 시스템

</details>

---

## 기술 스택

| 앱 | 언어 / 프레임워크 | 주요 의존성 |
|----|-------------------|-------------|
| `apps/bot` | TypeScript, Discord.js | Supabase, Sharp, Gemini AI, Groq |
| `apps/web` | TypeScript, Next.js 16, React 19 | Tailwind v4, Supabase |
| `apps/launcher` | Rust (Tauri v2) + TypeScript (React) | tauri-plugin-updater, reqwest, Zustand |
| `apps/minecraft/plugin` | Kotlin 2.0 (Paper API 1.21.11) | OkHttp3, FancyNpcs, Kotlinx Coroutines |
| `packages/core` | TypeScript | Supabase JS |

**인프라:**

| 역할 | 서비스 |
|------|--------|
| 데이터베이스 | Supabase (PostgreSQL) |
| 웹 호스팅 | Vercel |
| 봇 · 서버 배포 | Dokploy (Docker) |
| CI/CD | GitHub Actions |
| 런처 배포 | GitHub Releases (`launcher-v*` 태그) |

---

## 문서 바로가기

기여와 데이터 변경 전에 확인하면 좋은 공개 문서예요.

- [기여 가이드](CONTRIBUTING.md)
- [이슈 템플릿](.github/ISSUE_TEMPLATE)
- [PR 템플릿](.github/pull_request_template.md)
- [시스템 아키텍처](docs/architecture.md)
- [공유 데이터 문서](docs/data/README.md)
- [스키마 문서](docs/data/schema.md)
- [데이터 보안 문서](docs/data/security.md)

---

## 런처 다운로드

[GitHub Releases](https://github.com/INIRU/Tinklepaw/releases) 페이지에서 최신 버전을 내려받으세요.

| 플랫폼 | 파일 |
|--------|------|
| macOS Apple Silicon | `Nyaru.Launcher_x.x.x_aarch64.dmg` |
| macOS Intel | `Nyaru.Launcher_x.x.x_x64.dmg` |
| Windows | `Nyaru.Launcher_x.x.x_x64-setup.exe` |

### 사용 방법

1. 위 표에서 플랫폼에 맞는 파일을 내려받아 설치하세요.
2. 런처를 실행하고 **Microsoft 로그인** 버튼을 누르세요.
3. Java 설치 여부를 자동으로 확인하고, 없으면 Java 21을 자동 설치해요.
4. **플레이** 버튼을 누르면 Minecraft가 실행되고 방울냥 서버가 자동으로 서버 목록에 추가돼요.
5. 새 버전이 있으면 런처 상단에 알림이 표시돼요. 클릭하면 자동으로 업데이트돼요.

---

## 개발 환경 설정

### 요구 사항

- Node.js 20+
- npm 10+
- Java 21 (플러그인 빌드 시)
- Rust 1.80+ (런처 빌드 시)
- Supabase 프로젝트

### 설치

```bash
git clone https://github.com/INIRU/Tinklepaw.git
cd Tinklepaw
npm install
```

### 환경 변수

<details>
<summary><code>apps/bot/.env</code></summary>

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NYARU_WEB_URL=https://tinklepaw.vercel.app
```

</details>

<details>
<summary><code>apps/web/.env.local</code></summary>

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
AUTH_SECRET=
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
```

Discord Developer Portal > OAuth2 > Redirects에 아래 URL을 추가하세요:
```
http://localhost:3000/api/auth/callback/discord
```

</details>

### 데이터베이스 마이그레이션

처음 설정하는 경우 아래 부트스트랩 스크립트를 Supabase SQL Editor에서 실행하세요:

```sql
-- supabase/bootstrap_nyang.sql
-- (단일 파일로 전체 스키마를 한 번에 생성)
```

이후 PostgREST 스키마 캐시를 갱신하세요:

```sql
NOTIFY pgrst, 'reload schema';
```

<details>
<summary>마이그레이션 파일 목록 (순서대로 적용)</summary>

```
supabase/migrations/001_init.sql
supabase/migrations/002_rpc.sql
supabase/migrations/003_equip.sql
supabase/migrations/004_rewards.sql
supabase/migrations/006_join_message.sql
supabase/migrations/007_server_intro.sql
supabase/migrations/008_site_images.sql
supabase/migrations/009_nyang_schema.sql
supabase/migrations/005_seed_dev.sql  ← 개발 환경 선택사항
```

</details>

### 개발 서버 실행

```bash
# 웹 + 봇 동시 실행
npm run dev

# 개별 실행
npm run dev:web   # Next.js → http://localhost:3000
npm run dev:bot   # Discord 봇
```

### 런처 개발

```bash
cd apps/launcher
npm install
npm run tauri dev
```

### 플러그인 빌드

```bash
cd apps/minecraft/plugin
./gradlew shadowJar
# 출력: build/libs/plugin-1.0.0.jar
```

### 전체 빌드

```bash
npm run build
```

---

## 검증과 CI

로컬 검증은 Node.js 20+와 npm 10+ 기준이에요. 웹 E2E는 Playwright가 Next.js 개발 서버를 `http://127.0.0.1:3100`에서 자동으로 띄우며, 로컬에서는 Chromium 브라우저가 설치되어 있어야 해요.

| 명령 | 증명하는 영역 | 사전조건 / 주의사항 |
|------|---------------|---------------------|
| `npm install` | 루트 npm workspace 의존성을 설치해 이후 lint, typecheck, build, E2E 명령을 실행할 수 있는 상태로 만들어요. | Node.js 20+와 npm 10+가 필요해요. CI의 웹 E2E는 재현 가능한 설치를 위해 `npm ci`를 사용해요. |
| `npm run lint` | 루트의 `npm run lint --workspaces` 래퍼로 npm workspace의 ESLint 규칙을 검증하려는 gate예요. | 현재는 통과하지 않아요. `@nyaru/bot`은 ESLint 9 flat config가 없고, `@nyaru/web`은 기존 lint 위반이 있으며, `@nyaru/launcher`와 `@nyaru/core`는 lint 스크립트가 없어요. |
| `npm run typecheck` | 루트의 `npm run typecheck --workspaces` 래퍼로 TypeScript workspace의 타입 안정성을 검증하려는 gate예요. | 현재 `@nyaru/web`, `@nyaru/bot`, `@nyaru/core` typecheck는 실행되지만, `@nyaru/launcher`에 typecheck 스크립트가 없어 루트 명령은 실패해요. 런처 TypeScript는 `npm run build`에서 `tsc && vite build`로 확인돼요. |
| `npm run build` | npm workspaces의 프로덕션 빌드를 실행해 웹, 봇, 런처, 공유 패키지 빌드를 검증해요. | Minecraft Paper 플러그인은 npm workspace가 아니므로 포함되지 않아요. 플러그인은 `cd apps/minecraft/plugin && ./gradlew shadowJar` 또는 `Release Minecraft Plugin` workflow로 검증해요. 웹 env가 없으면 빌드 로그에 개발 fallback 경고가 표시될 수 있어요. |
| `npm run e2e -w @nyaru/web` | Playwright Chromium으로 웹 공개 라우트와 기본 내비게이션이 렌더링되고 서버 오류를 내지 않는지 검증해요. | 먼저 `npm install`을 실행하고, 브라우저가 없으면 `npx playwright install chromium`을 실행하세요. 웹 환경 변수는 `apps/web/.env.local` 예시를 기준으로 준비해요. |

현재 알려진 실패와 후속 작업: `npm run lint`와 `npm run typecheck`는 위 사유로 루트 green gate가 아니에요. 후속 이슈 [#11](https://github.com/INIRU/Tinklepaw/issues/11)에서 봇 ESLint config, 웹 lint 위반, 런처/core lint 스크립트, 런처 typecheck 스크립트를 정리해 루트 검증 coverage를 복구하는 작업을 추적해요.

### GitHub Actions

| 파일 | Workflow name | Trigger | 증명하는 내용 |
|------|---------------|---------|---------------|
| `.github/workflows/deploy.yml` | `Deploy Bot` | `main` 브랜치에 `apps/bot/**`, `packages/core/**`, `package.json`, `Dockerfile` 변경이 push되거나 수동 실행될 때 | 봇 Docker 이미지가 저장소 루트 context에서 빌드되고 GHCR에 `latest`와 SHA 태그로 push될 수 있음을 검증해요. |
| `.github/workflows/web-e2e.yml` | `Web E2E` | PR 또는 `main` push에서 `apps/web/**`, `package-lock.json`, workflow 파일이 바뀔 때 | Node 20에서 `npm ci` 후 Chromium을 설치하고 `npm run e2e -w @nyaru/web`을 실행해 웹 공개 라우트 E2E를 검증해요. 실패 시 Playwright report와 test-results를 artifact로 업로드해요. |
| `.github/workflows/release-launcher.yml` | `Release Launcher` | `launcher-v*` 태그가 push될 때 | Tauri 런처가 macOS Apple Silicon, macOS Intel, Windows 대상으로 빌드되고 GitHub Release 산출물을 만들 수 있음을 검증해요. |
| `.github/workflows/release-minecraft.yml` | `Release Minecraft Plugin` | `minecraft-v*` 태그가 push될 때 | Java 21과 Gradle로 `./gradlew shadowJar`를 실행해 Minecraft Paper 플러그인 릴리스 JAR를 만들 수 있음을 검증해요. |

---

## 프로젝트 구조

```
Nyaru/
├── apps/
│   ├── bot/                      # Discord.js 봇
│   │   └── src/
│   │       ├── commands/         # 슬래시 명령어
│   │       ├── services/         # 주식·음악·AI 서비스
│   │       ├── lib/              # 임베드·차트 유틸
│   │       └── events/           # Discord 이벤트 핸들러
│   ├── web/                      # Next.js 웹 대시보드
│   │   └── src/app/
│   ├── launcher/                 # Tauri v2 런처
│   │   ├── src/                  # React 프론트엔드
│   │   │   ├── pages/            # Login · Home · Settings
│   │   │   └── hooks/            # useAuth 등
│   │   └── src-tauri/            # Rust 백엔드
│   │       └── src/
│   │           ├── commands/     # auth · minecraft · server
│   │           └── minecraft/    # 설치 · 실행 로직
│   └── minecraft/
│       └── plugin/               # Kotlin Paper 플러그인
│           └── src/main/kotlin/dev/nyaru/minecraft/
│               ├── commands/     # 인게임 명령어
│               ├── gui/          # 인벤토리 GUI
│               ├── listeners/    # 이벤트 리스너
│               ├── skills/       # 스킬 시스템
│               ├── protection/   # 영역 보호
│               └── npc/          # NPC 타입 정의
├── packages/
│   └── core/                     # 공유 타입 · Supabase 클라이언트
├── supabase/                     # DB 마이그레이션 · 스키마
├── images/                       # README 스크린샷
└── .github/workflows/
    ├── deploy.yml                # 봇 Docker 빌드 · GHCR push
    ├── web-e2e.yml               # 웹 Playwright E2E
    ├── release-launcher.yml      # 런처 멀티플랫폼 빌드 · 릴리즈
    └── release-minecraft.yml     # Minecraft 플러그인 빌드 · 릴리즈
```

---

## 스크린샷

> `images/` 폴더에 스크린샷을 추가하면 여기에 표시돼요.
> 파일명 예시: `images/web-light.png`, `images/launcher-home.png`

---

<div align="center">
방울냥 커뮤니티와 함께해 주셔서 감사해요 🐾
</div>
