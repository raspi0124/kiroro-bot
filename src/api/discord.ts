import fetch from 'node-fetch';
import { APIMessage, MessageType } from 'discord-api-types/v10';
import { Bindings } from '../bindings';
import type { ConversationTurn } from './gpt';

const discordEndpoint = 'https://discord.com/api/v10';

const parseKiroroMessage = (content: string): ConversationTurn[] | null => {
  if (!content.startsWith('> ')) {
    return null;
  }

  const firstNewLineIndex = content.indexOf('\n');
  if (firstNewLineIndex <= 2) {
    return null;
  }

  const userInput = content.slice(2, firstNewLineIndex).trim();
  const assistantResponse = content.slice(firstNewLineIndex + 1).trim();
  if (userInput.length === 0 || assistantResponse.length === 0) {
    return null;
  }

  return [
    { role: 'user', content: userInput },
    { role: 'assistant', content: assistantResponse },
  ];
};

export const getLatestConversationTurns = async (
  channelId: string,
  conversationPairLimit: number,
  env: Bindings,
): Promise<ConversationTurn[]> => {
  const fetchLimit = Math.max(conversationPairLimit * 3, 10);
  const params = new URLSearchParams({ limit: fetchLimit.toString() }).toString();
  const endpoint = `${discordEndpoint}/channels/${channelId}/messages?${params}`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      },
    });
    if (response.ok) {
      const messages: APIMessage[] = await response.json();
      const conversationPairs: ConversationTurn[][] = [];
      for (const message of messages) {
        if (message.author.id !== env.KIRORO_ID || message.type !== MessageType.Default) {
          continue;
        }

        const parsedTurns = parseKiroroMessage(message.content);
        if (parsedTurns) {
          conversationPairs.push(parsedTurns);
        }
      }
      const limitedPairs = conversationPairs
        .slice(0, conversationPairLimit)
        .reverse();
      return limitedPairs.flat();
    }
    const text = await response.text();
    throw Error(
      `Failed to get latest conversation turns from Discord: ${text} (${response.status})`,
    );
  } catch (e) {
    throw Error(`Failed to get latest conversation turns from Discord: ${e}`);
  }
};
