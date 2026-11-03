// 음성으로 읽어줄 대본 만들기
// 브라우저(내장 TTS)와 음성 파일 생성기(tools/voice/generate.mjs)가 함께 사용합니다.
// Node 에서도 바로 import 되므로 이 파일에서는 브라우저 전용 API(window 등)를 쓰지 마세요.

import { VOICE_BLESSING, VOICE_GREETING, type Verse } from "./dailyVerses.ts";

/**
 * 출처를 읽기 좋은 말로 바꿈. TTS 가 "3:11" 을 "3시 11분" 으로 읽는 것을 막기 위함.
 *   "전도서 3:11"   → "전도서 3장 11절"
 *   "잠언 3:5-6"    → "잠언 3장 5절에서 6절"
 *   "시편 23:1"     → "시편 23편 1절"
 */
export function refToSpeech(ref: string): string {
  const m = /^(.+?)\s*(\d+)\s*:\s*(\d+)(?:\s*[-~–]\s*(\d+))?\s*$/.exec(ref.trim());
  if (!m) return ref.replace(/(\d+)\s*:\s*(\d+)/g, "$1장 $2절");
  const [, book, chapter, firstVerse, lastVerse] = m;
  const bookName = book!.trim();
  const chapterUnit = bookName.startsWith("시편") ? "편" : "장";
  const verses = lastVerse ? `${firstVerse}절에서 ${lastVerse}절` : `${firstVerse}절`;
  return `${bookName} ${chapter}${chapterUnit} ${verses}`;
}

/** [인사말, 말씀, 출처, 축복] 순서의 대본 조각 */
export function speechParts(verse: Pick<Verse, "text" | "ref">): string[] {
  return [VOICE_GREETING, verse.text, `${refToSpeech(verse.ref)} 말씀이다.`, VOICE_BLESSING];
}

/** 음성으로 읽어줄 전체 대본 (한 덩어리) */
export function buildSpeechScript(verse: Pick<Verse, "text" | "ref">): string {
  return speechParts(verse).join("\n");
}
