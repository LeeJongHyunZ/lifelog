import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { generateBibleInsight } from "./services/bibleInterpreter";
import {
  buildSpeechScript,
  formatDateLabel,
  getDailyWord,
  type DailyWord,
} from "./services/dailyWord";
import { useGodVoice } from "./hooks/useGodVoice";
import HeavenBackground from "./components/HeavenBackground";
import DailyWordModal from "./components/DailyWordModal";
import { SpeakerIcon, StopIcon } from "./components/Icons";
import "./App.css";

function App() {
  const [entry, setEntry] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // 오늘의 말씀: 사람마다 다르지만 하루 동안은 고정
  const [word, setWord] = useState<DailyWord>(() => getDailyWord());
  const [wordOpen, setWordOpen] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  const voice = useGodVoice();

  const dateLabel = useMemo(() => formatDateLabel(new Date()), [word.dateKey]);
  const speechScript = useMemo(() => buildSpeechScript(word), [word]);

  // 탭을 열어둔 채 날짜가 바뀌면 새 말씀으로 교체하고 다시 보여줌
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const fresh = getDailyWord();
      if (fresh.dateKey !== word.dateKey) {
        setWord(fresh);
        setAutoPlay(true);
        setWordOpen(true);
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [word.dateKey]);

  const stopVoice = voice.stop;
  const closeWord = useCallback(() => {
    stopVoice();
    setWordOpen(false);
  }, [stopVoice]);

  function reopenWord() {
    setAutoPlay(false);
    setWordOpen(true);
  }

  function toggleListen() {
    if (voice.busy) voice.stop();
    else voice.speak(speechScript);
  }

  async function onSubmit() {
    setLoading(true);
    setResult("");
    try {
      const out = await generateBibleInsight(entry);
      setResult(out);
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <HeavenBackground />

      <div className="app">
        <header className="app__brand">
          <span className="app__brand-name">라이프로그</span>
          <span className="app__brand-date">{dateLabel}</span>
        </header>

        {/* 이 여백 뒤로 하나님 형상이 보입니다 */}
        <div className="app__spacer" aria-hidden="true" />

        <main className="panel">
          <section className="today" aria-label="오늘의 말씀">
            <button type="button" className="today__open" onClick={reopenWord}>
              <span className="today__label">오늘의 말씀</span>
              <span className="today__ref">{word.ref}</span>
            </button>
            {voice.supported && (
              <button
                type="button"
                className={`today__listen${voice.busy ? " today__listen--on" : ""}`}
                onClick={toggleListen}
                aria-label={voice.busy ? "읽기 중지" : "하나님 음성으로 듣기"}
                title={voice.busy ? "읽기 중지" : "하나님 음성으로 듣기"}
              >
                {voice.busy ? <StopIcon /> : <SpeakerIcon />}
              </button>
            )}
          </section>

          <div className="app__top">
            <h1 className="app__title">오늘의 마음을 적어보세요</h1>
            <p className="app__subtitle">마음을 적으면 성경 말씀으로 해석해 드려요</p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="entry">
              오늘의 마음
            </label>
            <textarea
              id="entry"
              className="field__textarea"
              placeholder="요즘 마음에 걸리는 일, 고민, 감정을 자유롭게 적어주세요."
              value={entry}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEntry(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn--gold btn--block"
            onClick={onSubmit}
            disabled={loading || entry.trim().length === 0}
          >
            {loading ? "해석 중…" : "성경 말씀으로 해석하기"}
          </button>

          {result && <pre className="result__text">{result}</pre>}
        </main>
      </div>

      <DailyWordModal
        open={wordOpen}
        word={word}
        dateLabel={dateLabel}
        speechScript={speechScript}
        voice={voice}
        autoPlay={autoPlay}
        onClose={closeWord}
      />
    </>
  );
}

export default App;
