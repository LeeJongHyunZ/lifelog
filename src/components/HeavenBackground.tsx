import "./HeavenBackground.css";

// 화면 전체에 깔리는 배경: 하늘빛 → 빛줄기 → 인자한 하나님 형상 → 구름
// 모든 요소는 position: fixed 로 고정되고 pointer-events 가 없어 UI 조작을 방해하지 않음
// 벡터(SVG)라서 Android / iPhone / PC 어떤 해상도에서도 선명함

const SPARKLES: { left: string; top: string; size: number; delay: string; duration: string }[] = [
  { left: "12%", top: "18%", size: 5, delay: "0s", duration: "7s" },
  { left: "22%", top: "42%", size: 4, delay: "1.4s", duration: "8s" },
  { left: "31%", top: "27%", size: 6, delay: "2.6s", duration: "6.5s" },
  { left: "66%", top: "22%", size: 5, delay: "0.8s", duration: "7.5s" },
  { left: "78%", top: "38%", size: 4, delay: "3.2s", duration: "8.5s" },
  { left: "86%", top: "16%", size: 6, delay: "1.9s", duration: "7s" },
  { left: "8%", top: "60%", size: 4, delay: "2.2s", duration: "9s" },
  { left: "90%", top: "58%", size: 5, delay: "0.4s", duration: "8s" },
];

export default function HeavenBackground() {
  return (
    <div className="heaven" aria-hidden="true">
      <img className="heaven__rays" src="/heaven-rays.svg" alt="" draggable={false} />
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="heaven__sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
      <img className="heaven__figure" src="/heaven-figure.svg" alt="" draggable={false} />
      <img className="heaven__clouds" src="/heaven-clouds.svg" alt="" draggable={false} />
    </div>
  );
}
