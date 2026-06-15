import { useState, type ChangeEvent } from "react";
import { generateBibleInsight } from "./services/bibleInterpreter";
import "./App.css";

function App() {
  const [entry, setEntry] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="app">
      <header className="app__top">
        <h1 className="app__title">오늘의 마음을 적어보세요</h1>
        <p className="app__subtitle">
          마음을 적으면 성경 말씀으로 해석해 드려요
        </p>
      </header>

      <div className="field">
        <label className="field__label" htmlFor="entry">
          오늘의 마음
        </label>
        <textarea
          id="entry"
          className="field__textarea"
          placeholder="요즘 마음에 걸리는 일, 고민, 감정을 자유롭게 적어주세요."
          value={entry}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setEntry(e.target.value)
          }
        />
      </div>

      <button
        type="button"
        className="btn btn--block"
        onClick={onSubmit}
        disabled={loading || entry.trim().length === 0}
      >
        {loading ? "해석 중…" : "성경 말씀으로 해석하기"}
      </button>

      {result && <pre className="result__text">{result}</pre>}
    </div>
  );
}

export default App;
