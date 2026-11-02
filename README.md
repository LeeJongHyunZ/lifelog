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

- 사이트에 들어가면 **오늘의 말씀** 카드가 먼저 뜨고, 기기 내장 음성(Web Speech API)으로 읽어 줍니다. 서버나 API 키가 필요 없어 Android / iPhone / PC 어디서나 동작해요.
- 말씀은 기기마다 다르지만, **같은 기기에서는 하루 동안 같은 말씀**이 유지됩니다. (기기 고유 ID + 날짜를 해시해서 고르고, 결과를 localStorage 에 날짜와 함께 저장)
- iPhone / Android 는 소리 자동 재생을 막기 때문에, 첫 화면에서 "화면을 한 번 탭하면 들려드려요" 안내가 뜨고 탭하면 재생됩니다. PC Chrome/Edge 는 바로 재생되는 경우가 많아요.
- 음성 품질은 기기에 설치된 한국어 TTS 를 따릅니다. Windows 11 + Edge(InJoon 음성)가 가장 중후하고, 다른 기기는 여성 음성을 톤을 낮춰 읽습니다.

관련 파일:

| 파일 | 역할 |
| --- | --- |
| `src/data/dailyVerses.ts` | 말씀 목록과 음성 인사말. 말씀을 더 넣거나 문구를 바꾸려면 여기만 수정 (`id` 는 바꾸지 말 것) |
| `src/services/dailyWord.ts` | 사람별·날짜별 말씀 선택, 하루 고정 캐시 |
| `src/services/godVoice.ts` | 음성 선택(남성 우선), 톤/속도, 자동재생 차단 감지 |
| `src/hooks/useGodVoice.ts` | 낭독 상태를 React 로 연결 |
| `src/components/DailyWordModal.tsx` | 입장 시 뜨는 오늘의 말씀 카드 |
| `src/components/HeavenBackground.tsx` | 빛줄기·예수님 사진·구름 배경. 사진은 `public/jesus-figure.jpg` 를 같은 이름으로 바꾸면 교체됨 |

## 기술 스택

- React 18 + TypeScript + Vite 6
- vite-plugin-pwa (Workbox)
- Google Gemini 2.5 Flash (마음 해석, 실패 시 키워드 기반 fallback)
- Web Speech API (오늘의 말씀 낭독)
