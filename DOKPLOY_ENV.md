# Dokploy 환경 변수 설정 가이드

Dokploy에서 Discord 봇을 실행하기 위해 필요한 환경 변수들입니다.

## 필수 환경 변수

### Discord 설정
| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DISCORD_CLIENT_ID` | Discord 애플리케이션 ID | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | Discord 클라이언트 시크릿 | `abcdefghijklmnopqrstuvwxyz1234567890` |
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 | `MTIzNDU2Nzg5MDEyMzQ1Njcw.Ot1X5g.Yz1X2V6YXl0eHVz...` |
| `NYARU_GUILD_ID` | 디스코드 서버 ID | `987654321098765432` |

### Supabase 설정
| 변수명 | 설명 | 예시 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://yourproject.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 (서버 전용) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_DB_SCHEMA` | Supabase DB 스키마 이름 | `nyang` |

### AI 설정 (Groq 권장)
| 변수명 | 설명 | 예시 |
|--------|------|------|
| `GROQ_API_KEY` | Groq API 키 (무료/빠름) | `gsk_...` |
| `GEMINI_API_KEY` | Google Gemini API 키 (선택) | `AIzaSyB...` |

## 환경 변수 값 얻는 방법

### 1. Discord 설정
...

### 3. Groq API 설정 (추천)
1. [Groq Cloud Console](https://console.groq.com/keys) 접속
2. **Create API Key** 클릭
3. 생성된 키 복사 → `GROQ_API_KEY`


## Dokploy에서 환경 변수 설정 방법

1. Dokploy 프로젝트 대시보드 접속
2. **Application** → **nyaru-bot** 선택 (또는 새로 생성)
3. **Environment** 탭 클릭
4. 위 표에 있는 모든 필수 변수들을 입력
5. **Save** 클릭

## 보안 주의사사항

⚠️ **중요:**
- `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`는 절대로 GitHub에 커밋하지 마세요
- 이 값들은 Dokploy의 환경 변수로만 저장해야 합니다
- `.env.local` 파일은 `.gitignore`에 추가되어 있어야 합니다
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 키이며, 클라이언트 키와 다릅니다
