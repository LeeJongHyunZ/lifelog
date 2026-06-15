// Google Gemini 무료 API 키: https://aistudio.google.com 에서 발급
// .env.local 의 VITE_GEMINI_API_KEY 로 주입됩니다.
// 키가 없으면 규칙 기반 fallback으로 동작함
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

const PROMPT_TEMPLATE = (entry: string) => `
당신은 성경 구절을 통해 사람들의 인생 고민을 해석해 주는 따뜻한 상담가입니다.

사용자의 고민:
"${entry}"

다음 형식으로 한국어로 답변해 주세요:

[중요 규칙]
- 사용자가 직접 언급하지 않은 대상(예: 어머니, 아버지, 친구, 직장 상사, 배우자 등)을 임의로 추측하거나 호명하지 마세요.
- 사용자가 입력한 단어와 표현만을 근거로 해석하고, 누가 관련됐는지 특정하지 마세요.
- 대상을 가리켜야 할 때는 "주변 사람", "마음에 떠오르는 누군가", "당신의 상황 속 그 사람"처럼 모호하고 중립적인 표현을 사용하세요.
- "당신"을 가급적 활용해 사용자 본인의 감정과 행동에 초점을 맞춰주세요.
- 넌 성령 충만한 하나님의 자녀야. 하나님, 예수님, 성령님, 주님을 인용해서 사용자에게 더욱 감동이 오게 해줘.

📖 [성경 구절 (책 장:절)]
"[구절 전문]"

💬 해석
[이 구절이 사용자의 상황에 어떻게 적용되는지 따뜻하고 진솔하게 2-3문장으로]

✅ 오늘의 실천
[구체적이고 실천 가능한 한 가지 행동 제안]



답변은 200자 내외로 간결하게 작성해주세요.
`.trim();

async function callGemini(entry: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT_TEMPLATE(entry) }] }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("빈 응답");
  return text.trim();
}

// API 키가 없거나 요청 실패 시 규칙 기반 fallback
type Ref = { verse: string; text: string; theme: string; interpretation: string; action: string };
const FALLBACK: (Ref & { keywords: string })[] = [
  {
    verse: "마태복음 11:28", theme: "지침/번아웃",
    keywords: "지쳐|번아웃|힘들|피곤|쉬고|버겁|한계|소진",
    text: "수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라.",
    interpretation: "지금 많이 지쳐 있군요. 짐을 혼자 지지 않아도 됩니다.",
    action: "오늘 10분만 아무것도 하지 않는 시간을 허락해 보세요.",
  },
  {
    verse: "빌립보서 4:6-7", theme: "불안/걱정",
    keywords: "불안|걱정|초조|두근|긴장|염려|스트레스|막막",
    text: "아무것도 염려하지 말고... 하나님의 평강이 너희 마음과 생각을 지키시리라.",
    interpretation: "걱정하지 말라는 명령이 아니라, 그 감정을 기도 안에 쏟아내도 괜찮다는 허락입니다.",
    action: "가장 걱정되는 것 하나를 써보고 내려놓는 연습을 해보세요.",
  },
  {
    verse: "이사야 41:10", theme: "두려움/위기",
    keywords: "무섭|두렵|두려움|위기|실패|망했|공포|겁나",
    text: "두려워하지 말라 내가 너와 함께함이라 내가 너를 굳세게 하리라.",
    interpretation: "두려움이 없어지는 게 아니라, 그 속에서도 혼자가 아니라는 선언입니다.",
    action: "믿을 수 있는 한 사람에게 솔직하게 상황을 나눠보세요.",
  },
  {
    verse: "예레미야 29:11", theme: "진로/미래",
    keywords: "진로|취업|미래|방향|결정|선택|갈림길|직업|꿈|목표",
    text: "너희를 향한 나의 생각은 평안이요 너희에게 미래와 희망을 주는 것이니라.",
    interpretation: "지금 당장 답이 없어도 괜찮습니다. 방향이 흐릿할수록 한 걸음이 중요합니다.",
    action: "내가 진짜 원하는 것이 무엇인지 10분 동안 자유롭게 적어보세요.",
  },
  {
    verse: "고린도전서 13:4-5", theme: "관계/갈등",
    keywords: "연애|가족|친구|갈등|관계|싸움|상처|배신|오해|이별",
    text: "사랑은 오래 참고 사랑은 온유하며 자기의 유익을 구하지 아니하며.",
    interpretation: "관계에서 마음이 상한 것 같군요. 사랑은 감정이 아니라 선택과 태도입니다.",
    action: "전하지 못한 말을 편지처럼 써보세요. 보내지 않아도 좋아요.",
  },
  {
    verse: "시편 34:18", theme: "슬픔/우울",
    keywords: "슬프|울었|눈물|우울|힘없|무기력|공허|허전|쓸쓸|아프",
    text: "여호와는 마음이 상한 자에게 가까이하시고 충심으로 통회하는 자를 구원하시는도다.",
    interpretation: "하나님은 강한 자가 아닌, 마음이 상한 자 곁에 가장 가까이 있습니다.",
    action: "충분히 울어도 됩니다. 오늘은 해결하려 하지 말고 감정을 느껴보세요.",
  },
  {
    verse: "시편 139:14", theme: "자존감/자책",
    keywords: "자책|못난|부족|열등|창피|자신감|나는 왜|잘못|실망",
    text: "나를 지으심이 심히 기묘하심이라 주께서 하시는 일이 기이함을 내 영혼이 잘 아나이다.",
    interpretation: "실수해도, 부족해도 당신은 기묘하게 창조된 존재라는 사실은 변하지 않습니다.",
    action: "오늘 스스로에게 아주 사소한 칭찬 하나를 해보세요.",
  },
  {
    verse: "히브리서 13:5", theme: "외로움",
    keywords: "외로|혼자|고독|아무도|버림|소외|낯선|곁에",
    text: "내가 결코 너희를 버리지 아니하고 너희를 떠나지 아니하리라.",
    interpretation: "어떤 상황에서도 떠나지 않겠다는 가장 강한 약속입니다. 지금도 혼자가 아닙니다.",
    action: "오랫동안 연락 못한 한 사람에게 짧은 메시지를 먼저 보내보세요.",
  },
];

function ruleBased(entry: string): string {
  const lower = entry.toLowerCase();
  const ref = FALLBACK.find((r) => new RegExp(r.keywords).test(lower)) ?? FALLBACK[0]!;
  const preview = entry.length > 60 ? `${entry.slice(0, 60)}...` : entry;
  return [
    `📝 "${preview}"`,
    ``,
    `📖 ${ref.verse}`,
    `"${ref.text}"`,
    ``,
    `💬 해석 [${ref.theme}]`,
    ref.interpretation,
    ``,
    `✅ 오늘의 실천`,
    ref.action,
  ].join("\n");
}

export async function generateBibleInsight(entry: string): Promise<string> {
  const text = entry.trim();
  if (!text) return "먼저 오늘의 마음이나 고민을 입력해 주세요.";

  if (GEMINI_API_KEY) {
    try {
      return await callGemini(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Gemini API 실패, fallback 사용:", err);
      const isQuota = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
      const banner = isQuota
        ? "✨ 오늘 AI 해석 한도를 모두 사용했어요. 내일 오후 5시 이후 다시 시도해 주세요. 아래는 키워드 기반 해석이에요."
        : `⚠️ 일시적인 문제가 발생했어요. 아래는 키워드 기반 해석이에요.`;
      return `${banner}\n\n${ruleBased(text)}`;
    }
  }

  return ruleBased(text);
}
