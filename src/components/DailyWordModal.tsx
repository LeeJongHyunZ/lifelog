import { useEffect, useRef, type MouseEvent } from "react";
import type { DailyWord } from "../services/dailyWord";
import type { GodVoice } from "../hooks/useGodVoice";
import { SpeakerIcon, StopIcon } from "./Icons";
import "./DailyWordModal.css";

type Props = {
  open: boolean;
  word: DailyWord;
  dateLabel: string;
  voice: GodVoice;
  /** true 면 열리자마자 자동으로 읽기 시도 (사이트 첫 진입) */
  autoPlay: boolean;
  onClose: () => void;
};

export default function DailyWordModal({
  open,
  word,
  dateLabel,
  voice,
  autoPlay,
  onClose,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  // play/stop 은 useCallback 으로 고정된 함수라 effect 의존성으로 안전함
  // (voice 객체 자체는 상태가 바뀔 때마다 새로 만들어지므로 의존성에 넣으면 안 됨)
  const { status, supported, busy, play, stop } = voice;

  // 열리면 포커스 이동 + (첫 진입 시) 자동 낭독 시도
  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus({ preventScroll: true });
    if (!autoPlay || !supported) return;
    const t = window.setTimeout(() => play(), 650);
    return () => window.clearTimeout(t);
    // 날짜가 바뀌어 새 말씀이 오면 다시 읽도록 dateKey 도 의존성에 포함
  }, [open, autoPlay, supported, play, word.dateKey]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // 자동재생이 막힌 경우: 화면 어디를 탭해도 그 제스처 안에서 읽기 시작
  function onSurfaceClick() {
    if (status === "blocked" || status === "error") play();
  }

  function onToggleVoice(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (busy) stop();
    else play();
  }

  function onCloseClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onClose();
  }

  return (
    <div className="word-overlay" onClick={onSurfaceClick}>
      <div
        className="word-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-title"
        aria-describedby="word-text"
      >
        <div className="word-card__halo" aria-hidden="true" />

        <p className="word-card__eyebrow" id="word-title">
          오늘의 말씀
        </p>
        <p className="word-card__date">{dateLabel}</p>

        <blockquote className="word-card__verse" id="word-text">
          <span className="word-card__quote" aria-hidden="true">
            “
          </span>
          {word.text}
          <span className="word-card__quote" aria-hidden="true">
            ”
          </span>
        </blockquote>
        <p className="word-card__ref">{word.ref}</p>

        <div className="word-card__voice" aria-live="polite">
          {status === "speaking" && (
            <>
              <span className="voice-bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>하나님 음성으로 읽어드리는 중</span>
            </>
          )}
          {status === "starting" && <span>음성을 준비하고 있어요…</span>}
          {status === "blocked" && (
            <span className="word-card__hint">
              <SpeakerIcon size={15} /> 화면을 한 번 탭하면 말씀을 들려드려요
            </span>
          )}
          {status === "error" && (
            <span className="word-card__hint">
              음성을 재생하지 못했어요. 기기의 한국어 음성(TTS) 설정을 확인한 뒤 다시 탭해 주세요.
            </span>
          )}
          {status === "unsupported" && (
            <span className="word-card__hint">이 브라우저는 음성 읽기를 지원하지 않아요.</span>
          )}
        </div>

        <div className="word-card__actions">
          {supported && (
            <button
              ref={primaryRef}
              type="button"
              className="btn btn--gold btn--block"
              onClick={onToggleVoice}
            >
              {busy ? (
                <>
                  <StopIcon /> 그만 듣기
                </>
              ) : (
                <>
                  <SpeakerIcon /> 하나님 음성으로 듣기
                </>
              )}
            </button>
          )}
          <button
            ref={supported ? undefined : primaryRef}
            type="button"
            className="btn btn--ghost btn--block"
            onClick={onCloseClick}
          >
            마음 적으러 가기
          </button>
        </div>

        <p className="word-card__note">오늘 하루 동안 이 말씀이 당신과 함께합니다</p>
      </div>
    </div>
  );
}
