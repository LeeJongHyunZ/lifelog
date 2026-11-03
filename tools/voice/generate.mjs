// 오늘의 말씀 "하나님 음성" 파일 생성기
//
// 하는 일
//   1. src/data/dailyVerses.ts 의 말씀마다 [인사말 → 말씀 → 출처 → 축복] 대본을 만들고
//   2. Microsoft Edge 의 무료 한국어 남성 음성으로 문장별 음성을 받은 뒤
//   3. ffmpeg 로 음높이와 울림통을 낮춰 굵고 중후하게, 성당 같은 울림을 입혀
//   4. public/voice/<말씀id>.mp3 와 src/data/voiceManifest.ts 를 만듭니다.
//
// 실행 (이 폴더에서)
//   npm install                         처음 한 번
//   npm run generate                    바뀐 말씀만 새로 만듦
//   node generate.mjs --force           전부 다시 만듦
//   node generate.mjs --only ecc3-11    특정 말씀만 (쉼표로 여러 개)
//
// 필요한 것
//   - Node 22.18 이상 (TypeScript 파일을 바로 import)
//   - ffmpeg (rubberband 가 들어간 빌드). Windows: winget install Gyan.FFmpeg

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import edgeTts from "msedge-tts";
import { DAILY_VERSES } from "../../src/data/dailyVerses.ts";
import { speechParts } from "../../src/data/speechScript.ts";

const { MsEdgeTTS, OUTPUT_FORMAT } = edgeTts;

// ───────────────────────── 목소리 설정 (여기만 바꿔도 됩니다) ─────────────────────────

/** 바탕이 되는 무료 음성. Edge 한국어 남성 음성 중 가장 낮은 목소리 */
const VOICE = {
  name: "ko-KR-HyunsuMultilingualNeural",
  rate: "-8%", // 말 빠르기. 뒤의 '천천히 돌리기'와 합쳐 보통보다 약 20% 느리게, 또박또박
  pitch: "-10%", // 음성 엔진 단계에서 자연스럽게 낮추는 음높이
};

/** 소리 다듬기 */
const DSP = {
  sampleRate: 24000,
  tapeSlow: 0.88, // 테이프를 천천히 돌리듯 음높이·울림통·속도를 함께 12% 낮춤 → 몸집 큰 목소리
  pitchDrop: 0.85, // 울림통은 그대로 두고 음높이만 추가로 낮춤
  warmthDb: 2.5, // 저음(가슴 울림) 보강
  presenceDb: 2, // 발음이 울림에 묻히지 않도록 중고음을 살짝 살림
  reverbWet: 0.4, // 성당 울림의 양 (0 이면 울림 없음). 너무 키우면 발음이 묻힘
  rt60: 3.1, // 울림이 사라지는 시간(초). 클수록 넓은 공간
  loudnessLufs: -16, // 최종 음량 (모바일 기준)
  peakDb: -1.5, // 최대 순간 음량
  bitrate: "64k",
};

/** 쉼 (초, 천천히 돌리기 전 기준이라 실제로는 약 1.14배 길어짐) */
const PAUSE = {
  lead: 0.3,
  sentence: 0.42, // 한 조각 안의 문장 사이
  afterGreeting: 0.85,
  afterVerse: 0.75,
  afterRef: 0.95,
  tail: 3.2, // 마지막 울림이 자연스럽게 사라질 시간
};

/** 생성 방식이 바뀌면 올려서 전체를 다시 만들게 함 */
const GENERATOR_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const OUT_DIR = join(ROOT, "public", "voice");
const MANIFEST_FILE = join(ROOT, "src", "data", "voiceManifest.ts");
const CACHE_DIR = join(HERE, ".cache");
const TTS_CACHE = join(CACHE_DIR, "tts");
const WORK_DIR = join(CACHE_DIR, "work");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const onlyArg = valueOf("--only");
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim()).filter(Boolean)) : null;
const CONCURRENCY = Math.max(1, Number(valueOf("--concurrency") ?? 3));

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

// ───────────────────────── 작은 도구들 ─────────────────────────

function runFfmpeg(ffArgs, { capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...ffArgs], {
      stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"],
    });
    const out = [];
    let err = "";
    if (capture) p.stdout.on("data", (c) => out.push(c));
    p.stderr.on("data", (c) => {
      err += c.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on("error", (e) =>
      reject(
        new Error(
          e.code === "ENOENT"
            ? "ffmpeg 를 찾을 수 없어요. 설치 후 다시 실행해 주세요 (winget install Gyan.FFmpeg)."
            : e.message,
        ),
      ),
    );
    p.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`ffmpeg 실패 (code ${code})\n${err.split("\n").slice(-12).join("\n")}`));
    });
  });
}

/** 동시에 n 개까지만 실행 */
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, res, rej } = queue.shift();
    fn()
      .then(res, rej)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((res, rej) => {
      queue.push({ fn, res, rej });
      next();
    });
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function writeWavFloat(file, channels, sampleRate) {
  const nCh = channels.length;
  const n = channels[0].length;
  const dataBytes = n * nCh * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * nCh * 4, 28);
  buf.writeUInt16LE(nCh * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      buf.writeFloatLE(channels[c][i], o);
      o += 4;
    }
  }
  writeFileSync(file, buf);
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── 성당 울림 (임펄스 응답) ─────────────────────────

/**
 * 돌로 된 큰 공간의 울림을 흉내 낸 스테레오 임펄스 응답.
 * 초기 반사음 + 점점 어두워지며 사라지는 잔향. 좌우가 달라서 공간이 넓게 느껴짐.
 */
function makeCathedralIR(sampleRate) {
  const sr = sampleRate;
  const n = Math.round(3.8 * sr);
  const pre = Math.round(0.024 * sr); // 직접음과 울림 사이 간격 → 발음이 또렷함
  const rand = mulberry32(20261103);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.7320508;
  const chans = [new Float32Array(n), new Float32Array(n)];

  for (const ch of chans) {
    let lp1 = 0;
    let lp2 = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.907755 * t) / DSP.rt60); // rt60 에서 -60dB
      const build = 1 - Math.exp(-t / 0.018); // 잔향이 부드럽게 차오름
      const fc = 1400 + 5200 * Math.exp(-t / 0.9); // 처음엔 밝고 갈수록 어두워짐
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      lp1 = (1 - a) * gauss() + a * lp1;
      lp2 = (1 - a) * lp1 + a * lp2;
      ch[i] = lp2 * env * build;
    }
  }

  // 초기 반사음 (ms, 왼쪽 세기, 오른쪽 세기)
  const taps = [
    [9, 0.9, 0.5],
    [14, 0.45, 0.8],
    [21, 0.7, 0.35],
    [29, 0.3, 0.6],
    [37, 0.5, 0.45],
    [48, 0.35, 0.5],
    [61, 0.4, 0.25],
    [76, 0.2, 0.35],
    [93, 0.25, 0.2],
  ];
  const tailEnergy = chans.map((ch) => ch.reduce((s, v) => s + v * v, 0));
  chans.forEach((ch, c) => {
    const sumSq = taps.reduce((s, tap) => s + tap[1 + c] ** 2, 0);
    const scale = Math.sqrt((0.35 * tailEnergy[c]) / sumSq);
    for (const tap of taps) ch[pre + Math.round((tap[0] / 1000) * sr)] += tap[1 + c] * scale;
  });

  // 에너지를 1로 맞춤 → 울림 크기는 reverbWet 하나로 조절
  for (const ch of chans) {
    const norm = Math.sqrt(ch.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < ch.length; i++) ch[i] /= norm;
  }
  return chans;
}

// ───────────────────────── 음성 합성 (Edge 무료 음성) ─────────────────────────

const ttsLimit = limiter(3);
const ttsJobs = new Map();

function collect(stream) {
  return new Promise((res, rej) => {
    const chunks = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      res(Buffer.concat(chunks));
    };
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", (e) => {
      done = true;
      rej(e);
    });
  });
}

async function fetchTts(sentence, file) {
  for (let attempt = 1; ; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(VOICE.name, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(sentence), {
        rate: VOICE.rate,
        pitch: VOICE.pitch,
      });
      const buf = await collect(audioStream);
      if (buf.length < 2000) throw new Error(`음성 데이터가 비어 있음 (${buf.length} bytes)`);
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, file);
      return file;
    } catch (err) {
      if (attempt >= 5) {
        throw new Error(`음성 받기 실패: "${sentence.slice(0, 24)}…" (${err?.message ?? err})`);
      }
      await sleep(1000 * 2 ** (attempt - 1));
    } finally {
      try {
        tts.close();
      } catch {
        /* 이미 닫힘 */
      }
    }
  }
}

/** 문장 하나를 음성 파일로 (같은 문장은 한 번만 받아서 재사용) */
function synthesize(sentence) {
  const key = sha1(JSON.stringify([VOICE, sentence])).slice(0, 20);
  const file = join(TTS_CACHE, `${key}.mp3`);
  if (existsSync(file)) return Promise.resolve(file);
  if (!ttsJobs.has(key)) ttsJobs.set(key, ttsLimit(() => fetchTts(sentence, file)));
  return ttsJobs.get(key);
}

async function decodeMono(file) {
  const { stdout } = await runFfmpeg(
    ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(DSP.sampleRate), "pipe:1"],
    { capture: true },
  );
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4)).slice();
}

/** 앞뒤 무음을 잘라 쉼 길이를 정확히 맞춤 */
function trimSilence(x) {
  const sr = DSP.sampleRate;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return new Float32Array(0);
  const th = peak * 10 ** (-42 / 20);
  let first = 0;
  while (first < x.length && Math.abs(x[first]) < th) first++;
  let last = x.length - 1;
  while (last > first && Math.abs(x[last]) < th) last--;
  const start = Math.max(0, first - Math.round(0.04 * sr));
  const end = Math.min(x.length, last + Math.round(0.12 * sr));
  const out = x.slice(start, end);
  const fade = Math.min(Math.round(0.005 * sr), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  return out;
}

function assembleDry(partsPcm) {
  const sr = DSP.sampleRate;
  const gaps = [PAUSE.afterGreeting, PAUSE.afterVerse, PAUSE.afterRef];
  const pieces = [new Float32Array(Math.round(PAUSE.lead * sr))];
  partsPcm.forEach((sentences, pi) => {
    sentences.forEach((seg, si) => {
      if (si > 0) pieces.push(new Float32Array(Math.round(PAUSE.sentence * sr)));
      pieces.push(seg);
    });
    if (pi < partsPcm.length - 1) {
      pieces.push(new Float32Array(Math.round((gaps[pi] ?? PAUSE.afterRef) * sr)));
    }
  });
  pieces.push(new Float32Array(Math.round(PAUSE.tail * sr)));
  const total = pieces.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of pieces) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ───────────────────────── 소리 다듬기 (ffmpeg) ─────────────────────────

function effectGraph() {
  const sr = DSP.sampleRate;
  return [
    `[0:a]aformat=sample_fmts=flt:channel_layouts=mono,`,
    `asetrate=${Math.round(sr * DSP.tapeSlow)},aresample=${sr}:resampler=soxr,`,
    `rubberband=pitch=${DSP.pitchDrop}:formant=preserved:pitchq=quality,`,
    `highpass=f=65,`,
    `bass=g=${DSP.warmthDb}:f=140:t=q:w=0.7,`,
    `equalizer=f=2500:t=q:w=1.1:g=${DSP.presenceDb},`,
    `acompressor=threshold=0.1:ratio=2.5:attack=10:release=220:knee=3,`,
    `pan=stereo|c0=c0|c1=c0,asplit=2[dry][send];`,
    `[send]highpass=f=220,lowpass=f=5500[sendf];`,
    `[sendf][1:a]afir=gtype=-1:irnorm=-1[wet];`,
    `[dry][wet]amix=inputs=2:weights='1 ${DSP.reverbWet}':normalize=0[out]`,
  ].join("");
}

async function measureLoudness(file) {
  const { stderr } = await runFfmpeg([
    "-i",
    file,
    "-af",
    `loudnorm=I=${DSP.loudnessLufs}:TP=${DSP.peakDb}:LRA=11:print_format=json`,
    "-f",
    "null",
    "-",
  ]);
  const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1);
  const stats = JSON.parse(json);
  return Number(stats.input_i);
}

async function renderVerse(verse, irFile) {
  const parts = speechParts(verse);
  const sentencesPerPart = parts.map(splitSentences);
  const files = await Promise.all(sentencesPerPart.map((ss) => Promise.all(ss.map(synthesize))));
  const pcm = [];
  for (const partFiles of files) {
    const segs = [];
    for (const f of partFiles) segs.push(trimSilence(await decodeMono(f)));
    pcm.push(segs);
  }
  const dry = assembleDry(pcm);

  const dryFile = join(WORK_DIR, `${verse.id}.dry.wav`);
  const fxFile = join(WORK_DIR, `${verse.id}.fx.wav`);
  const tmpMp3 = join(WORK_DIR, `${verse.id}.mp3`);
  writeWavFloat(dryFile, [dry], DSP.sampleRate);

  try {
    await runFfmpeg([
      "-i",
      dryFile,
      "-i",
      irFile,
      "-filter_complex",
      effectGraph(),
      "-map",
      "[out]",
      "-ar",
      String(DSP.sampleRate),
      "-c:a",
      "pcm_f32le",
      fxFile,
    ]);

    const seconds = dry.length / (DSP.sampleRate * DSP.tapeSlow);
    const inputI = await measureLoudness(fxFile);
    const gainDb = Number.isFinite(inputI) ? DSP.loudnessLufs - inputI : 0;
    const limit = (10 ** (DSP.peakDb / 20)).toFixed(4);
    const fadeStart = Math.max(0, seconds - 0.9).toFixed(2);

    await runFfmpeg([
      "-i",
      fxFile,
      "-af",
      [
        `volume=${gainDb.toFixed(2)}dB`,
        `alimiter=limit=${limit}:attack=4:release=60:level=false`,
        `afade=t=in:d=0.04`,
        `afade=t=out:st=${fadeStart}:d=0.9`,
      ].join(","),
      "-ar",
      String(DSP.sampleRate),
      "-ac",
      "2",
      "-c:a",
      "libmp3lame",
      "-b:a",
      DSP.bitrate,
      "-map_metadata",
      "-1",
      "-id3v2_version",
      "0",
      tmpMp3,
    ]);
    const outFile = join(OUT_DIR, `${verse.id}.mp3`);
    rmSync(outFile, { force: true });
    renameSync(tmpMp3, outFile);
    return { seconds, bytes: statSync(outFile).size };
  } finally {
    rmSync(dryFile, { force: true });
    rmSync(fxFile, { force: true });
    rmSync(tmpMp3, { force: true });
  }
}

// ───────────────────────── 목록 파일 ─────────────────────────

function readManifest() {
  const map = new Map();
  if (!existsSync(MANIFEST_FILE)) return map;
  const re = /"([^"]+)":\s*"\/voice\/[^"?]+\.mp3\?v=([0-9a-f]+)"/g;
  for (const m of readFileSync(MANIFEST_FILE, "utf8").matchAll(re)) map.set(m[1], m[2]);
  return map;
}

function writeManifest(entries) {
  const lines = DAILY_VERSES.filter((v) => entries.has(v.id)).map(
    (v) => `  ${JSON.stringify(v.id)}: ${JSON.stringify(`/voice/${v.id}.mp3?v=${entries.get(v.id)}`)},`,
  );
  const body = lines.length ? `{\n${lines.join("\n")}\n}` : "{}";
  writeFileSync(
    MANIFEST_FILE,
    [
      "// 자동 생성 파일입니다. tools/voice 에서 `npm run generate` 를 실행하면 다시 만들어집니다. 직접 고치지 마세요.",
      "// 말씀 id → 하나님 음성 파일 주소. ?v= 값은 음성이 바뀔 때마다 달라져서 브라우저가 새 파일을 받게 합니다.",
      "// 여기에 없는 말씀은 브라우저 내장 음성으로 읽습니다.",
      `export const VOICE_FILES: Record<string, string> = ${body};`,
      "",
    ].join("\n"),
  );
}

// ───────────────────────── 실행 ─────────────────────────

async function main() {
  for (const d of [OUT_DIR, TTS_CACHE, WORK_DIR]) mkdirSync(d, { recursive: true });

  const irFile = join(CACHE_DIR, "cathedral-ir.wav");
  writeWavFloat(irFile, makeCathedralIR(DSP.sampleRate), DSP.sampleRate);

  const manifest = readManifest();
  const unknown = ONLY ? [...ONLY].filter((id) => !DAILY_VERSES.some((v) => v.id === id)) : [];
  if (unknown.length) throw new Error(`없는 말씀 id: ${unknown.join(", ")}`);

  const targets = DAILY_VERSES.filter((v) => !ONLY || ONLY.has(v.id));
  const jobs = targets.map((verse) => {
    const hash = sha1(
      JSON.stringify({ GENERATOR_VERSION, VOICE, DSP, PAUSE, parts: speechParts(verse) }),
    ).slice(0, 10);
    const upToDate =
      !FORCE && manifest.get(verse.id) === hash && existsSync(join(OUT_DIR, `${verse.id}.mp3`));
    return { verse, hash, upToDate };
  });

  const todo = jobs.filter((j) => !j.upToDate);
  console.log(
    `말씀 ${targets.length}개 중 ${todo.length}개를 만듭니다 (최신 ${targets.length - todo.length}개는 건너뜀).`,
  );

  const runLimit = limiter(CONCURRENCY);
  let done = 0;
  const failures = [];
  const started = Date.now();
  await Promise.all(
    todo.map((job) =>
      runLimit(async () => {
        try {
          const { seconds, bytes } = await renderVerse(job.verse, irFile);
          manifest.set(job.verse.id, job.hash);
          done++;
          console.log(
            `  [${done}/${todo.length}] ${job.verse.id.padEnd(12)} ${seconds.toFixed(1)}초  ${Math.round(bytes / 1024)}KB`,
          );
        } catch (err) {
          failures.push(job.verse.id);
          console.error(`  ✗ ${job.verse.id}: ${err.message}`);
        }
      }),
    ),
  );

  // 전체 실행일 때만: 목록에서 사라진 말씀의 파일 정리
  if (!ONLY) {
    const valid = new Set(DAILY_VERSES.map((v) => v.id));
    for (const id of [...manifest.keys()]) if (!valid.has(id)) manifest.delete(id);
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith(".mp3") && !valid.has(f.slice(0, -4))) {
        rmSync(join(OUT_DIR, f), { force: true });
        console.log(`  - 목록에 없는 파일 삭제: ${f}`);
      }
    }
  }
  // 실패한 말씀은 목록을 건드리지 않음 → 예전에 만든 파일이 있으면 그대로 쓰임
  writeManifest(manifest);
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`완료: ${done}개 생성, 실패 ${failures.length}개, ${secs}초 걸림.`);
  if (failures.length) {
    console.log(`실패한 말씀은 브라우저 내장 음성으로 읽힙니다. 다시 실행하면 이어서 만듭니다.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
