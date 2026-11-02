import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSpeechSupported,
  speakAsGod,
  stopSpeaking,
  type SpeakStatus,
} from "../services/godVoice";

export type GodVoice = {
  status: SpeakStatus;
  supported: boolean;
  /** 읽는 중이거나 시작 대기 중 */
  busy: boolean;
  speak: (text: string) => void;
  stop: () => void;
};

/** 하나님 음성 낭독 상태를 React 상태로 묶어주는 훅 (앱에서 한 번만 사용) */
export function useGodVoice(): GodVoice {
  const [status, setStatus] = useState<SpeakStatus>(
    isSpeechSupported ? "idle" : "unsupported",
  );
  const statusRef = useRef(status);
  statusRef.current = status;

  const stop = useCallback(() => {
    stopSpeaking();
    if (statusRef.current !== "unsupported") setStatus("idle");
  }, []);

  const speak = useCallback((text: string) => {
    speakAsGod(text, setStatus);
  }, []);

  useEffect(() => {
    // 탭을 벗어나면 조용히, 페이지를 닫을 때도 정리
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  return {
    status,
    supported: isSpeechSupported,
    busy: status === "starting" || status === "speaking",
    speak,
    stop,
  };
}
