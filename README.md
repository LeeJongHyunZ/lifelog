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

## 기술 스택

- React 18 + TypeScript + Vite 6
- vite-plugin-pwa (Workbox)
- Google Gemini 2.5 Flash (마음 해석, 실패 시 키워드 기반 fallback)
