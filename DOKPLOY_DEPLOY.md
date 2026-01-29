# Dokploy에 Discord 봇 배포 가이드

이 가이드는 Nyaru Discord 봇을 Dokploy에 배포하는 방법을 안내합니다.

## 전제 조건

- [ ] Dokploy 서버가 설치 및 구성되어 있음
- [ ] Discord 애플리케이션이 생성되어 있음 (DOKPLOY_ENV.md 참조)
- [ ] Supabase 프로젝트가 설정되어 있음
- [ ] GitHub 레포지토리가 존재함

## 1단계: Docker 이미지 빌드 (로컬)

로컬에서 Docker 이미지를 먼저 테스트합니다.

```bash
# 프로젝트 루트에서 실행
cd /Users/iniru/Documents/Nyaru

# Docker 이미지 빌드
docker build -f apps/bot/Dockerfile -t nyaru-bot:latest .

# 컨테이너 실행 테스트 (환경 변수 필요)
docker run --rm -e DISCORD_BOT_TOKEN=your_token -e NYARU_GUILD_ID=your_guild_id -e SUPABASE_URL=your_url -e SUPABASE_SERVICE_ROLE_KEY=your_key -e DISCORD_CLIENT_ID=your_client_id nyaru-bot:latest
```

## 2단계: Docker 이미지를 Docker Hub 또는 레지스트리에 푸시

Dokploy에서 이미지를 가져올 수 있도록 레지스트리에 푸시합니다.

### 옵션 A: Docker Hub 사용

```bash
# Docker Hub 로그인
docker login

# 이미지 태그 변경
docker tag nyaru-bot:latest yourusername/nyaru-bot:latest

# 푸시
docker push yourusername/nyaru-bot:latest
```

### 옵션 B: GitHub Container Registry (GHCR) 사용

```bash
# GitHub 로그인
echo $GITHUB_TOKEN | docker login ghcr.io -u your-username --password-stdin

# 이미지 태그 변경
docker tag nyaru-bot:latest ghcr.io/your-username/nyaru-bot:latest

# 푸시
docker push ghcr.io/your-username/nyaru-bot:latest
```

## 3단계: Dokploy에서 애플리케이션 생성

### 3.1 새 Application 생성
1. Dokploy 대시보드 접속
2. **Application** → **Create Application** 클릭
3. 이름: `nyaru-bot`
4. Repository: GitHub 레포지토리 선택

### 3.2 Dockerfile 설정
Dokploy에서 Dockerfile을 사용하여 빌드하는 방식:

**Repository 설정:**
- Git Repository URL: `https://github.com/INIRU/Tinklepaw.git`
- Branch: `main`
- Docker Context Path: `apps/bot` (Dockerfile이 있는 경로)

**Build 설정:**
- Dockerfile Path: `Dockerfile`
- Build Args: 없음

### 3.3 또는 이미지 레지스트리에서 가져오기 (추천)

이미지를 미리 빌드한 경우:

- **Image**: `yourusername/nyaru-bot:latest` 또는 `ghcr.io/your-username/nyaru-bot:latest`
- **Pull Policy**: `Always` (항상 최신 이미지 가져오기)

## 4단계: 환경 변수 설정

**DOKPLOY_ENV.md** 가이드를 참조하여 필수 환경 변수를 입력합니다.

1. **Environment** 탭 클릭
2. 다음 변수들을 추가:

```
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
NYARU_GUILD_ID=987654321098765432
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_DB_SCHEMA=nyang
GEMINI_API_KEY=your_gemini_api_key (선택)
```

3. **Save** 클릭

## 5단계: 배포 실행

1. **Deploy** 탭 클릭
2. **Deploy Now** 클릭
3. 빌드 및 배포 과정 모니터링

## 6단계: 배포 확인

### 로그 확인
```
Dokploy 대시보드 → Application → nyaru-bot → Logs
```

정상적인 로그:
```
Bot ready as 쿠로#6550
```

### Discord에서 봇 확인
1. Discord 서버에 초대
2. `/help` 명령어 테스트
3. 봇이 응답하는지 확인

## 트러블슈팅

### 문제: 봇이 시작되지 않음
**원인:** 환경 변수 누락 또는 잘못된 값
**해결:**
- Dokploy 환경 변수 확인
- Discord 토큰이 올바른지 확인
- Supabase 연결 테스트

### 문제: 빌드 실패
**원인:** Dockerfile 경로 또는 의존성 문제
**해결:**
- Docker Context Path가 `apps/bot`로 설정되어 있는지 확인
- 로그에서 오류 메시지 확인

### 문제: Supabase 연결 오류
**원인:** SUPABASE_SERVICE_ROLE_KEY 누락 또는 잘못됨
**해결:**
- `service_role` 키가 아닌 `anon` 키를 사용했는지 확인
- URL이 올바른지 확인

### 문제: 봇이 명령어에 응답하지 않음
**원인:** Discord 권한 누락
**해결:**
- Discord Developer Portal에서 봇 권한 확인
- 필요한 권한:
  - Send Messages
  - Embed Links
  - Attach Files
  - Add Reactions
  - Manage Roles
  - Connect
  - Speak

## 자동 재배포 설정

GitHub에 푸시할 때마다 자동으로 재배포되도록 설정:

1. **Application** → **nyaru-bot**
2. **Settings** → **Git**
3. **Auto Deploy** 활성화
4. 브랜치 선택: `main`

## 업데이트 배포

봇을 업데이트할 때:

1. GitHub에 변경사항 푸시
2. Dokploy에서 **Deploy Now** 클릭 (자동 배포 활성화 시 자동으로 진행됨)
3. 빌드 및 배포 완료 대기

## 리소스 제한 설정 (선택)

봇의 리소스 사용량을 제한하려면:

1. **Application** → **nyaru-bot**
2. **Settings** → **Resources**
3. 메모리 및 CPU 제한 설정:
   - Memory: `256MB` 또는 `512MB`
   - CPU: `0.5` 또는 `1`

## 모니터링

### Dokploy에서
- **Logs**: 실시간 로그 확인
- **Metrics**: CPU, 메모리 사용량 확인

### Discord에서
- 봇 상태 확인
- 명령어 응답 속도 확인

## 참고 링크

- [Dokploy 문서](https://dokploy.com/docs)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Supabase Dashboard](https://supabase.com/dashboard)
