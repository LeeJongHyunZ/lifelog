// vite.config.ts 의 voiceFiles 플러그인이 빌드할 때 만들어 주는 모듈
declare module "virtual:voice-files" {
  /** 말씀 id → 하나님 음성 파일 주소. public/voice 폴더에 실제로 있는 파일만 들어 있음 */
  export const VOICE_FILES: Readonly<Partial<Record<string, string>>>;
}
