// 말씀 id → 하나님 음성 파일 주소.
// 직접 적는 목록이 아닙니다. 빌드할 때 public/voice 폴더를 읽어서 자동으로 채워집니다 (vite.config.ts 의 voiceFiles).
// 그래서 GitHub 에 mp3 파일이 실제로 올라가 있는 말씀만 여기에 들어오고, 오늘의 말씀도 그 안에서만 고릅니다.
export { VOICE_FILES } from "virtual:voice-files";
