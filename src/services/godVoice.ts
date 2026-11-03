// 오늘의 말씀 "하나님 음성" 재생
//
// 1순위: 미리 만들어 둔 음성 파일 (public/voice/<말씀id>.mp3)
//   - tools/voice/generate.mjs 가 무료 남성 음성을 낮고 굵게 다듬고 성당 울림을 입혀 만든 파일
//   - <audio> 로 재생하므로 Android, iPhone(무음 스위치를 켜도), PC 에서 똑같은 목소리로 들림
// 2순위: 파일이 없거나 재생에 실패하면 브라우저 내장 음성으로, 남성 음성을 골라 톤을 낮춰 읽음
//
// 자동 재생이 막힌 환경(iOS, Android, 처음 방문한 PC)은 "blocked" 상태를 알려주고,
// 화면 탭(사용자 동작) 안에서 다시 playTrack() 을 부르면 재생됨

export type SpeakStatus =
  | "idle" // 대기
  | "starting" // 재생 요청 후 소리가 나기 전
  | "speaking" // 읽는 중
  | "blocked" // 자동 재생이 차단됨 → 사용자 탭 필요
  | "error" // 음성 엔진 오류
  | "unsupported"; // 소리를 낼 방법이 없음

export type StatusListener = (status: SpeakStatus) => void;

export type VoiceTrack = {
  /** 미리 만든 음성 파일 주소. 없으면 브라우저 내장 음성으로 읽음 */
  audioUrl?: string;
  /** 브라우저 내장 음성으로 읽을 대본 */
  text: string;
  /** 잠금 화면·알림에 보일 제목과 부제 */
  title: string;
  artist: string;
};

const hasWindow = typeof window !== "undefined";
const synth: SpeechSynthesis | undefined =
  hasWindow && "speechSynthesis" in window ? window.speechSynthesis : undefined;
const isSpeechSupported = !!synth && hasWindow && "SpeechSynthesisUtterance" in window;
const isAudioSupported = hasWindow && typeof window.Audio === "function";

/** 음성 파일이나 내장 음성 중 하나라도 되면 "듣기" 가능 */
export const isVoiceSupported = isAudioSupported || isSpeechSupported;

/** 재생 요청마다 올라가는 번호. 이전 요청의 늦게 도착한 이벤트를 무시하는 데 씀 */
let token = 0;

// ───────────────────────── 1순위: 음성 파일 ─────────────────────────

type Session = { token: number; track: VoiceTrack; onStatus: StatusListener };

let audioEl: HTMLAudioElement | null = null;
let session: Session | null = null;
/** 우리가 직접 pause() 해서 생기는 pause 이벤트 수 (사용자/OS 가 멈춘 것과 구분) */
let ownPauses = 0;

/** 파일이 실제로 있는지: true(있음) / false(없음). 확인 전이면 값이 없음 */
const availability = new Map<string, boolean>();
const checking = new Map<string, Promise<boolean>>();

function getAudio(): HTMLAudioElement | null {
  if (!isAudioSupported) return null;
  if (audioEl) return audioEl;

  const a = new Audio();
  a.preload = "auto";
  a.addEventListener("playing", () => session?.onStatus("speaking"));
  a.addEventListener("waiting", () => {
    if (session && !a.paused) session.onStatus("starting");
  });
  a.addEventListener("pause", () => {
    if (ownPauses > 0) {
      ownPauses -= 1;
      return;
    }
    // 잠금 화면·이어폰 버튼 등으로 멈춤 (끝까지 들은 경우는 ended 에서 처리)
    if (session && !a.ended) session.onStatus("idle");
  });
  a.addEventListener("ended", () => {
    const s = session;
    session = null;
    s?.onStatus("idle");
  });
  a.addEventListener("error", () => {
    const src = a.getAttribute("src");
    if (src) availability.set(src, false);
    const s = session;
    if (!s) return;
    session = null;
    // 파일에 문제가 있으면 내장 음성으로 대신 읽음
    speakWithTts(s.track.text, s.onStatus);
  });

  audioEl = a;
  return a;
}

function checkAvailability(url: string): Promise<boolean> {
  const known = availability.get(url);
  if (known !== undefined) return Promise.resolve(known);
  let p = checking.get(url);
  if (!p) {
    p = fetch(url, { method: "HEAD" })
      .then((r) => r.ok && !(r.headers.get("content-type") ?? "").includes("text/html"))
      .catch(() => false)
      .then((ok) => {
        if (!availability.has(url)) availability.set(url, ok);
        checking.delete(url);
        return availability.get(url) ?? ok;
      });
    checking.set(url, p);
  }
  return p;
}

/** 말씀이 정해지면 미리 불러 둠 → 탭했을 때 바로 시작 */
export function prepareTrack(track: VoiceTrack): void {
  const url = track.audioUrl;
  if (!url) return;
  void checkAvailability(url);
  const a = getAudio();
  if (a && !session && a.getAttribute("src") !== url) a.src = url;
}

function setMediaSession(track: VoiceTrack): void {
  try {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "라이프로그",
      artwork: [{ src: "/jesus-figure.jpg", sizes: "1184x1664", type: "image/jpeg" }],
    });
  } catch {
    /* 지원하지 않는 브라우저 */
  }
}

function playAudioFile(
  a: HTMLAudioElement,
  url: string,
  track: VoiceTrack,
  onStatus: StatusListener,
): void {
  const my = ++token;
  session = { token: my, track, onStatus };
  if (a.getAttribute("src") !== url) a.src = url;
  try {
    a.currentTime = 0;
  } catch {
    /* 아직 불러오기 전 */
  }
  setMediaSession(track);
  onStatus("starting");

  let p: Promise<void> | undefined;
  try {
    p = a.play();
  } catch (err) {
    p = Promise.reject(err);
  }
  p?.catch((err: unknown) => {
    if (!session || session.token !== my) return; // 이미 멈췄거나 다른 재생으로 바뀜
    session = null;
    const name = (err as { name?: string } | null)?.name;
    if (name === "NotAllowedError") {
      onStatus("blocked"); // 자동 재생 차단 → 탭하면 다시 시도
    } else if (name === "AbortError") {
      onStatus("idle");
    } else {
      availability.set(url, false);
      speakWithTts(track.text, onStatus);
    }
  });
}

// ───────────────────────── 2순위: 브라우저 내장 음성 ─────────────────────────

const TTS_VOICE = {
  rate: 0.84, // 1 이 보통 속도. 천천히, 또박또박
  pitchMale: 0.86, // 남성 음성은 약간만 낮춤
  pitchFemale: 0.68, // 여성 음성밖에 없으면 톤을 많이 낮춰 중후하게
  volume: 1,
  startTimeoutMs: 3000, // 이 시간 안에 소리가 시작되지 않으면 차단으로 판단
};

// 플랫폼별 한국어 남성 음성 이름 힌트 (Windows/Edge: InJoon, Hyunsu / 기타 엔진)
const MALE_HINT = /injoon|hyunsu|minsu|bongjin|gookmin|yunjun|jinho|male|남성|남자/i;
const QUALITY_HINT = /natural|neural|online|premium|enhanced|google/i;

let voicesCache: SpeechSynthesisVoice[] = [];
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

function pickTtsVoice(): SpeechSynthesisVoice | undefined {
  const korean = refreshVoices().filter((v) => /^ko([-_]|$)/i.test(v.lang));
  if (korean.length === 0) return undefined;
  return (
    korean.find((v) => MALE_HINT.test(v.name) && QUALITY_HINT.test(v.name)) ??
    korean.find((v) => MALE_HINT.test(v.name)) ??
    korean.find((v) => QUALITY_HINT.test(v.name)) ??
    korean.find((v) => v.default) ??
    korean[0]
  );
}

/** 문장 단위로 나누되 너무 길면 쉼표에서도 나눔 (Chrome 의 15초 끊김 버그 회피) */
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

function cancelTts(): void {
  if (activeUtterances.length > 0) activeUtterances = [];
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
}

/** 내장 음성이 읽는 중인지 */
export function isTtsSpeaking(): boolean {
  return !!synth && (synth.speaking || synth.pending);
}

/**
 * 내장 음성으로 읽기.
 * iOS 는 사용자 동작 안에서 speechSynthesis.speak() 까지 바로 도달해야 하므로 await 를 쓰지 않음
 */
function speakWithTts(text: string, onStatus: StatusListener): void {
  if (!synth || !isSpeechSupported) {
    onStatus("unsupported");
    return;
  }

  cancelTts();
  const my = ++token;
  const voice = pickTtsVoice();
  const pitch = voice && MALE_HINT.test(voice.name) ? TTS_VOICE.pitchMale : TTS_VOICE.pitchFemale;

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    onStatus("idle");
    return;
  }

  let started = false;
  onStatus("starting");

  const guard = window.setTimeout(() => {
    if (my !== token || started) return;
    // 소리가 시작되지 않음 → 자동재생 차단으로 판단
    synth.cancel();
    activeUtterances = [];
    onStatus("blocked");
  }, TTS_VOICE.startTimeoutMs);

  const utterances = chunks.map((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = "ko-KR";
    if (voice) u.voice = voice;
    u.rate = TTS_VOICE.rate;
    u.pitch = pitch;
    u.volume = TTS_VOICE.volume;

    u.onstart = () => {
      if (my !== token) return;
      if (!started) {
        started = true;
        window.clearTimeout(guard);
        onStatus("speaking");
      }
    };
    u.onend = () => {
      if (my !== token) return;
      if (i === chunks.length - 1) {
        activeUtterances = [];
        onStatus("idle");
      }
    };
    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (my !== token) return;
      // 우리가 멈춘 경우는 오류가 아님
      if (e.error === "interrupted" || e.error === "canceled") return;
      window.clearTimeout(guard);
      activeUtterances = [];
      // not-allowed: 사용자 동작 없이 재생 시도 → 탭하면 됨. 그 외는 진짜 오류
      onStatus(e.error === "not-allowed" && !started ? "blocked" : "error");
    };
    return u;
  });

  activeUtterances = utterances;
  for (const u of utterances) synth.speak(u);

  // 일부 브라우저(iOS/Chrome)가 일시정지 상태로 남아 있으면 재개
  if (synth.paused) synth.resume();
}

// ───────────────────────── 공용 ─────────────────────────

/** 모든 재생 멈춤 */
export function stopVoice(): void {
  token += 1;
  session = null;
  if (audioEl && !audioEl.paused) {
    ownPauses += 1;
    audioEl.pause();
  }
  cancelTts();
}

/**
 * 하나님 음성으로 읽기 시작.
 * iOS 에서 소리가 나려면 탭 같은 사용자 동작 안에서 바로 불러야 함 (await 없이)
 */
export function playTrack(track: VoiceTrack, onStatus: StatusListener): void {
  stopVoice();
  const url = track.audioUrl;
  const a = url ? getAudio() : null;
  if (a && url && availability.get(url) !== false) {
    playAudioFile(a, url, track, onStatus);
  } else {
    speakWithTts(track.text, onStatus);
  }
}
