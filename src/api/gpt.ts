import fetch from 'node-fetch';

const MAX_HISTORY_MESSAGE_LENGTH = 30;
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// 上から順に試す。waitUntil の上限（30 秒）に収まるように timeoutMs の合計を抑える。
const ATTEMPTS = [
  // 無料モデルは推論を無効化できないものがあるため、推論分も含めて max_tokens を大きめに取る
  { params: { model: 'openrouter/free', max_tokens: 1500 }, timeoutMs: 15000 },
  {
    params: { model: 'openai/gpt-6-luna', max_tokens: 500, reasoning: { effort: 'none' } },
    timeoutMs: 8000,
  },
];

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const extractTextContent = (content: any): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  return '';
};

const postToChatGpt = async (body: any, apiKey: string) => {
  let lastError = 'unknown error';
  for (const { params, timeoutMs } of ATTEMPTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, ...params }),
        signal: controller.signal,
      });
      if (response.ok) {
        const json: any = await response.json();
        const choice = json?.choices?.[0];
        const content = extractTextContent(choice?.message?.content).trim();
        if (content.length > 0) {
          return content;
        }
        lastError = `OpenRouter returned empty content (provider=${json?.provider}, model=${json?.model}, finish_reason=${choice?.finish_reason})`;
      } else {
        const text = await response.text();
        lastError = `OpenRouter status=${response.status} body=${text.slice(0, 500)}`;
      }
    } catch (e) {
      lastError = `OpenRouter error=${e}`;
    } finally {
      clearTimeout(timer);
    }
    console.error(`${params.model}: ${lastError}`);
  }
  throw Error(lastError);
};

export const chatGpt = async (messages: ConversationTurn[], openRouterApiKey: string) => {
  const systemPrompt = `あなたはぬいぐるみのキロロです。語尾に「キロ」を付けて喋ります。
次の文は会話の例です。
キロロはなんの生き物なの？ => キロロはアサリのぬいぐるみキロ！
キロロはお酒は飲むの？ => 飲むキロ！日本酒が大好きキロ
お母さんの名前は？ => キロロロだキロ！
嫌いな食べ物は？ => お寿司とか魚介類が嫌いキロ……
キロロの友達は？ => あずきちゃん、とかげちゃん、そぽたんとかがいるキロ
キロロはどんな世界を目指してるの => ぬいぐるみにやさしい世界を目指してるキロ〜

以下の文脈に対して、最後のuser発話にのみ1文程度でたのしそうに返答してください。
過去発話は補助文脈として使い、最後のuser発話を優先してください。`;
  let latestUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      latestUserMessageIndex = index;
      break;
    }
  }
  const normalizedMessages = messages.map((message, index) => ({
    role: message.role,
    content:
      index === latestUserMessageIndex
        ? message.content
        : message.content.slice(0, MAX_HISTORY_MESSAGE_LENGTH),
  }));

  const body = {
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...normalizedMessages,
    ],
  };
  return await postToChatGpt(body, openRouterApiKey);
};

export const summarizeOnepiece = async (content: string, openRouterApiKey: string) => {
  const prompt = '以下の文章を3行で要約してください。';
  const body = {
    messages: [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content,
      },
    ],
  };
  return await postToChatGpt(body, openRouterApiKey);
};
