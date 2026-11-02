// 오늘의 말씀 선택 로직
//
// - 기기마다 고유 ID(clientId)를 만들어 localStorage 에 보관
// - (clientId + 오늘 날짜) 를 해시해서 말씀을 고르므로
//   사람마다 다르지만, 같은 사람은 하루 동안 항상 같은 말씀을 받음 (오늘의 운세 방식)
// - 고른 결과를 날짜와 함께 캐시해 두어, 말씀 목록이 바뀌어도 그날 안에는 유지됨

import {
  DAILY_VERSES,
  VOICE_BLESSING,
  VOICE_GREETING,
  type Verse,
} from "../data/dailyVerses";

const CLIENT_ID_KEY = "lifelog:clientId";
const DAILY_WORD_KEY = "lifelog:dailyWord";

export type DailyWord = Verse & { dateKey: string };

// localStorage 를 못 쓰는 환경(일부 시크릿 모드)에서는 세션 동안만 기억
let memoryClientId: string | null = null;
let memoryCache: { dateKey: string; id: string } | null = null;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 기기(브라우저)별 고유 ID. 처음 방문 시 한 번 만들어 계속 사용 */
export function getClientId(): string {
  const stored = storageGet(CLIENT_ID_KEY);
  if (stored) return stored;
  if (memoryClientId) return memoryClientId;
  const id = randomId();
  if (!storageSet(CLIENT_ID_KEY, id)) memoryClientId = id;
  return id;
}

/** 로컬 시간 기준 YYYY-MM-DD */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** FNV-1a 32bit 해시 (결정적, 가벼움) */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function readCache(): { dateKey: string; id: string } | null {
  const raw = storageGet(DAILY_WORD_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { dateKey?: unknown; id?: unknown };
      if (typeof parsed.dateKey === "string" && typeof parsed.id === "string") {
        return { dateKey: parsed.dateKey, id: parsed.id };
      }
    } catch {
      /* 손상된 캐시는 무시 */
    }
  }
  return memoryCache;
}

function writeCache(entry: { dateKey: string; id: string }) {
  memoryCache = entry;
  storageSet(DAILY_WORD_KEY, JSON.stringify(entry));
}

/** 오늘 이 사람에게 주어진 말씀 (하루 동안 변하지 않음) */
export function getDailyWord(now: Date = new Date()): DailyWord {
  const dateKey = todayKey(now);

  const cached = readCache();
  if (cached && cached.dateKey === dateKey) {
    const found = DAILY_VERSES.find((v) => v.id === cached.id);
    if (found) return { ...found, dateKey };
  }

  const seed = `${getClientId()}|${dateKey}`;
  const index = fnv1a(seed) % DAILY_VERSES.length;
  const verse = DAILY_VERSES[index]!;
  writeCache({ dateKey, id: verse.id });
  return { ...verse, dateKey };
}

/** 음성으로 읽어줄 전체 대본 */
export function buildSpeechScript(word: DailyWord): string {
  return [VOICE_GREETING, word.text, `${word.ref} 말씀이다.`, VOICE_BLESSING].join("\n");
}

/** "11월 2일 월요일" 형태 */
export function formatDateLabel(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(now);
  } catch {
    return `${now.getMonth() + 1}월 ${now.getDate()}일`;
  }
}
