# 라이프로그 Web (PWA)

토스 미니앱 라이프로그를 일반 웹/PWA로 옮긴 버전이에요. 오늘의 마음을 적으면 성경 말씀으로 따뜻하게 해석해 드려요. Vercel에 배포해 어떤 브라우저에서든 쓸 수 있고, 홈 화면에 추가해 앱처럼 띄울 수도 있어요.

## 로컬 실행

```powershell
npm install
# .env.local 에 VITE_GEMINI_API_KEY=... 가 들어 있는지 확인
npm run dev
```

브라우저에서 http://127.0.0.1:5173 접속.

## 빌드

```powershell
npm run build
npm run preview   # 빌드 결과 미리보기
```

## 환경 변수

`.env.example` 파일을 `.env.local` 로 복사하고 키를 채워 주세요.

```
VITE_GEMINI_API_KEY=실제_키_값
```

`.env.local` 은 `.gitignore` 에 들어있어 git 에 올라가지 않아요. 키가 없으면 키워드 기반 fallback 해석으로 동작해요.

## Vercel 배포

1. GitHub 저장소에 푸시
2. https://vercel.com 가입 → "Add New → Project"
3. 저장소 선택 → 프레임워크는 자동으로 Vite 감지
4. **Environment Variables** 에 `VITE_GEMINI_API_KEY` 추가 (값은 Google AI Studio 에서 발급한 키)
5. Deploy 버튼

배포되면 `프로젝트이름.vercel.app` 주소가 나와요. 이후엔 `git push` 만 하면 Vercel 이 자동으로 빌드 + 갱신.

## PWA 설치

- iOS Safari: 공유 → "홈 화면에 추가"
- Android Chrome: 주소창 메뉴 → "앱 설치"
- 데스크톱 Chrome/Edge: 주소창 오른쪽 설치 아이콘

## 오늘의 말씀 + 하나님 음성

- 사이트에 들어가면 **오늘의 말씀** 카드가 먼저 뜨고, **미리 만들어 둔 하나님 음성 파일**(`public/voice/<말씀id>.mp3`)로 읽어 줍니다. 모든 기기에서 같은 목소리로 들리고, iPhone 무음 스위치를 켜도 소리가 납니다.
- **음성 파일이 있는 말씀만** 오늘의 말씀으로 나옵니다. 빌드할 때(Vercel 배포 때) `public/voice` 폴더를 직접 읽어 목록을 만들기 때문에, 새로 넣고 음성을 아직 안 만든 말씀이나 파일을 아직 안 올린 말씀은 나오지 않아요.
- 음성 파일을 불러오지 못할 때(인터넷이 끊기는 등)만 기기 내장 음성(Web Speech API)으로 톤을 낮춰 대신 읽습니다. 음성 파일이 하나도 없으면(음성 없이 개발할 때) 전체 말씀에서 고르고 내장 음성으로 읽어요.
- 말씀은 기기마다 다르지만, **같은 기기에서는 하루 동안 같은 말씀**이 유지됩니다. (기기 고유 ID + 날짜를 해시해서 고르고, 결과를 localStorage 에 날짜와 함께 저장)
- iPhone / Android / 처음 방문한 PC 는 소리 자동 재생을 막기 때문에, 첫 화면에서 "화면을 한 번 탭하면 들려드려요" 안내가 뜨고 탭하면 재생됩니다.

### 하나님 음성 파일 만들기

말씀(`src/data/dailyVerses.ts`)이나 인사말을 바꿨을 때만 다시 만들면 됩니다. 사이트 빌드(Vercel)와는 상관없이 내 PC 에서 실행해요.

```powershell
cd tools/voice
npm install          # 처음 한 번
npm run generate     # 바뀐 말씀만 새로 만듦 (전부 새로: node generate.mjs --force)
```

- 필요한 것: Node 22.18 이상, ffmpeg (`winget install Gyan.FFmpeg`)
- 결과: `public/voice/*.mp3` 와 `tools/voice/voices.json` (말씀별로 어떤 설정·대본으로 만들었는지 적어 둔 기록, 직접 고치지 말 것)
- mp3 를 GitHub 에 올리면 다음 배포부터 그 말씀이 오늘의 말씀 후보에 들어갑니다. `voices.json` 도 같이 올려 두면 다른 PC 에서도 바뀐 말씀만 다시 만들 수 있어요.
- 말씀 문구를 고쳤다면 꼭 다시 만들어 주세요. 안 그러면 카드 글과 음성이 달라집니다.
- 목소리 만드는 방법: Microsoft Edge 의 무료 한국어 남성 음성(Hyunsu)을 문장별로 받아 천천히, 낮게(기본 음높이 약 145Hz → 96Hz), 울림통을 키워 굵게 다듬고 성당 같은 울림을 입힙니다. 톤·속도·울림 양은 `tools/voice/generate.mjs` 맨 위 설정에서 바꿀 수 있어요.
- Edge 의 읽어주기 음성을 비공식 경로로 쓰는 방식이라 개인·소규모 사이트용으로 생각해 주세요. 상업적으로 키울 때는 같은 음성을 Azure Speech(월 50만 자 무료)로 정식 생성하는 것을 권합니다.

관련 파일:

| 파일 | 역할 |
| --- | --- |
| `src/data/dailyVerses.ts` | 말씀 목록과 음성 인사말. 말씀을 더 넣거나 문구를 바꾸려면 여기만 수정 (`id` 는 바꾸지 말 것) |
| `src/data/speechScript.ts` | 읽어줄 대본 만들기 (출처 "3:11" → "3장 11절") |
| `src/data/voiceManifest.ts` | 말씀별 음성 파일 목록. 빌드할 때 `public/voice` 폴더를 읽어 자동으로 채워짐 (`vite.config.ts` 의 voiceFiles) |
| `src/services/dailyWord.ts` | 음성 있는 말씀 중에서 사람별·날짜별 말씀 선택, 하루 고정 캐시 |
| `src/services/godVoice.ts` | 음성 파일 재생, 없을 때 내장 음성으로 대신 읽기, 자동재생 차단 감지 |
| `src/hooks/useGodVoice.ts` | 낭독 상태를 React 로 연결 |
| `src/components/DailyWordModal.tsx` | 입장 시 뜨는 오늘의 말씀 카드 |
| `src/components/HeavenBackground.tsx` | 빛줄기·예수님 사진·구름 배경. 사진은 `public/jesus-figure.jpg` 를 같은 이름으로 바꾸면 교체됨 (넓은 화면 양옆은 `public/jesus-glow.jpg`) |
| `tools/voice/generate.mjs` | 하나님 음성 파일 생성기 |
| `tools/voice/voices.json` | 생성기 기록 (바뀐 말씀만 다시 만들 때 씀) |

## 기술 스택

- React 18 + TypeScript + Vite 6
- vite-plugin-pwa (Workbox)
- Google Gemini 2.5 Flash (마음 해석, 실패 시 키워드 기반 fallback)
- 오늘의 말씀 낭독: 미리 만든 MP3 (Edge 무료 음성 + ffmpeg 후처리), 파일을 못 불러오면 Web Speech API
