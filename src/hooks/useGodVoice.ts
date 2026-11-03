import { useCallback, useEffect, useRef, useState } from "react";
import {
  isTtsSpeaking,
  isVoiceSupported,
  playTrack,
  prepareTrack,
  stopVoice,
  type SpeakStatus,
  type VoiceTrack,
} from "../services/godVoice";

export type GodVoice = {
  status: SpeakStatus;
  supported: boolean;
  /** 읽는 중이거나 시작 대기 중 */
  busy: boolean;
  /** 오늘의 말씀 읽기 시작 (탭 핸들러 안에서 바로 부르기) */
  play: () => void;
  stop: () => void;
};

/** 오늘의 말씀 음성 재생 상태를 React 상태로 묶어주는 훅 (앱에서 한 번만 사용) */
export function useGodVoice(track: VoiceTrack): GodVoice {
  const [status, setStatus] = useState<SpeakStatus>(isVoiceSupported ? "idle" : "unsupported");
  const trackRef = useRef(track);
  trackRef.current = track;

  // 말씀이 정해지면 음성 파일을 미리 불러 둠
  useEffect(() => {
    prepareTrack(track);
  }, [track]);

  const play = useCallback(() => {
    playTrack(trackRef.current, setStatus);
  }, []);

  const stop = useCallback(() => {
    stopVoice();
    setStatus((s) => (s === "unsupported" ? s : "idle"));
  }, []);

  useEffect(() => {
    // 내장 음성은 탭을 벗어나면 멈춤 (Chrome 이 엉뚱하게 이어 읽는 문제).
    // 음성 파일은 화면을 끄거나 다른 앱으로 가도 계속 들을 수 있게 둠
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && isTtsSpeaking()) stop();
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
    supported: isVoiceSupported,
    busy: status === "starting" || status === "speaking",
    play,
    stop,
  };
}
