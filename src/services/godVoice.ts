// "하나님 음성" 낭독 서비스 (Web Speech API)
//
// - 브라우저 내장 TTS 를 사용하므로 서버/키 없이 Android, iOS, PC 모두 동작
// - 한국어 음성 중 남성 음성을 우선 고르고, 낮은 톤과 느린 속도로 읽어 묵직하고 따뜻한 느낌을 냄
// - 자동 재생이 막힌 환경(iOS, Android Chrome 등)은 "blocked" 상태로 알려주어
//   화면 탭(사용자 제스처) 안에서 다시 speak() 를 부르면 재생됨
// - 긴 문장은 문장 단위로 쪼개어 큐에 넣음 (Chrome 의 15초 끊김 버그 회피)

export type SpeakStatus =
  | "idle" // 대기
  | "starting" // speak() 호출 후 실제 소리가 나기 전
  | "speaking" // 읽는 중
  | "blocked" // 자동 재생이 차단됨 → 사용자 탭 필요
  | "error" // 음성 엔진 오류
  | "unsupported"; // 브라우저가 TTS 미지원

export type StatusListener = (status: SpeakStatus) => void;

const GOD_VOICE = {
  rate: 0.84, // 1 이 보통 속도. 천천히, 또박또박
  pitchMale: 0.86, // 남성 음성은 약간만 낮춤
  pitchFemale: 0.68, // 여성 음성밖에 없으면 톤을 많이 낮춰 중후하게
  volume: 1,
  startTimeoutMs: 3000, // 이 시간 안에 소리가 시작되지 않으면 차단으로 판단
};

// 플랫폼별 한국어 남성 음성 이름 힌트 (Windows/Edge: InJoon, Hyunsu / 기타 엔진)
const MALE_HINT = /injoon|hyunsu|minsu|bongjin|gookmin|yunjun|jinho|male|남성|남자/i;
const QUALITY_HINT = /natural|neural|online|premium|enhanced|google/i;

const synth: SpeechSynthesis | undefined =
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : undefined;

export const isSpeechSupported =
  !!synth && typeof window !== "undefined" && "SpeechSynthesisUtterance" in window;

let voicesCache: SpeechSynthesisVoice[] = [];
let currentToken = 0;
// Chrome 은 utterance 객체가 GC 되면 이벤트가 안 오므로 참조를 붙잡아 둠
let activeUtterances: SpeechSynthesisUtterance[] = [];

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!synth) return [];
  const list = synth.getVoices();
  if (list.length > 0) voicesCache = list;
  return voicesCache;
}

if (synth) {
  refreshVoices();
  // Chrome/Edge 는 음성 목록을 비동기로 불러옴
  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", refreshVoices);
  } else {
    synth.onvoiceschanged = refreshVoices;
  }
}

function isKorean(v: SpeechSynthesisVoice): boolean {
  return /^ko([-_]|$)/i.test(v.lang);
}

/** 가장 "하나님 음성"에 가까운 한국어 음성 고르기 */
export function pickGodVoice(): SpeechSynthesisVoice | undefined {
  const korean = refreshVoices().filter(isKorean);
  if (korean.length === 0) return undefined;

  return (
    korean.find((v) => MALE_HINT.test(v.name) && QUALITY_HINT.test(v.name)) ??
    korean.find((v) => MALE_HINT.test(v.name)) ??
    korean.find((v) => QUALITY_HINT.test(v.name)) ??
    korean.find((v) => v.default) ??
    korean[0]
  );
}

/** 문장 단위로 나누되 너무 길면 쉼표에서도 나눔 */
function splitIntoChunks(text: string, maxLen = 110): string[] {
  const sentences = text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxLen) {
      chunks.push(s);
      continue;
    }
    let buf = "";
    for (const piece of s.split(/(?<=,)\s*/)) {
      if ((buf + piece).length > maxLen && buf) {
        chunks.push(buf.trim());
        buf = "";
      }
      buf += piece + " ";
    }
    if (buf.trim()) chunks.push(buf.trim());
  }
  return chunks;
}

/** 현재 큐에 올라간 문장 수 (디버그용) */
export function queuedChunkCount(): number {
  return activeUtterances.length;
}

/** 읽기 중지 */
export function stopSpeaking(): void {
  currentToken += 1;
  activeUtterances = [];
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
}

/**
 * 하나님 음성으로 읽기.
 * 반드시 동기적으로 speechSynthesis.speak() 까지 도달해야 하므로 (iOS 제스처 요건)
 * 이 함수 안에서는 await 를 쓰지 않습니다.
 */
export function speakAsGod(text: string, onStatus: StatusListener): void {
  if (!synth || !isSpeechSupported) {
    onStatus("unsupported");
    return;
  }

  stopSpeaking();
  const token = currentToken;
  const voice = pickGodVoice();
  const pitch =
    voice && MALE_HINT.test(voice.name) ? GOD_VOICE.pitchMale : GOD_VOICE.pitchFemale;

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    onStatus("idle");
    return;
  }

  let started = false;
  onStatus("starting");

  const guard = window.setTimeout(() => {
    if (token !== currentToken || started) return;
    // 소리가 시작되지 않음 → 자동재생 차단으로 판단
    synth.cancel();
    activeUtterances = [];
    onStatus("blocked");
  }, GOD_VOICE.startTimeoutMs);

  const utterances = chunks.map((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = "ko-KR";
    if (voice) u.voice = voice;
    u.rate = GOD_VOICE.rate;
    u.pitch = pitch;
    u.volume = GOD_VOICE.volume;

    u.onstart = () => {
      if (token !== currentToken) return;
      if (!started) {
        started = true;
        window.clearTimeout(guard);
        onStatus("speaking");
      }
    };
    u.onend = () => {
      if (token !== currentToken) return;
      if (i === chunks.length - 1) {
        activeUtterances = [];
        onStatus("idle");
      }
    };
    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (token !== currentToken) return;
      // 우리가 stop() 으로 끊은 경우는 오류가 아님
      if (e.error === "interrupted" || e.error === "canceled") return;
      window.clearTimeout(guard);
      activeUtterances = [];
      // not-allowed: 사용자 제스처 없이 재생 시도 → 탭하면 됨
      // 그 외(엔진 없음, 한국어 음성 없음, 오디오 장치 문제 등)는 진짜 오류
      onStatus(e.error === "not-allowed" && !started ? "blocked" : "error");
    };
    return u;
  });

  activeUtterances = utterances;
  for (const u of utterances) synth.speak(u);

  // 일부 브라우저(iOS/Chrome)가 일시정지 상태로 남아 있으면 재개
  if (synth.paused) synth.resume();
}

/** 사용자가 이미 페이지와 상호작용했는지 (자동재생 성공 가능성 힌트) */
export function hasUserActivated(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return !!ua?.hasBeenActive;
}
