import {
  APIInteraction,
  APIInteractionResponse,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
} from 'discord-api-types/v10';
import { verifyKey } from 'discord-interactions';
import { Hono } from 'hono';
import { Bindings } from './bindings';
import { KIRO_COMMAND } from './commands';
import { createResponseMessage } from './message';
import { editOriginalResponse } from './api/discord';
import { getApplicationId } from './util';

const app = new Hono<{ Bindings: Bindings }>();

const respondLater = async (interaction: APIInteraction, env: Bindings) => {
  let content: string;
  try {
    content = String(await createResponseMessage(interaction, env));
  } catch (e) {
    console.error(`Failed to create a response: ${e}`);
    content = `キロロはお休み中キロＺｚｚ...\n${e}`;
  }
  try {
    await editOriginalResponse(interaction.application_id, interaction.token, content);
  } catch (e) {
    console.error(`${e}`);
  }
};

app.get('/', async (c) => {
  console.log(c);
  return c.text(`Hello ${getApplicationId(c.env.DISCORD_BOT_TOKEN)}`);
});

app.post('/', async (c) => {
  // verify
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();
  const isValidRequest =
    signature && timestamp && verifyKey(body, signature, timestamp, c.env.DISCORD_PUBLIC_KEY);
  if (!isValidRequest) {
    return c.text('Bad request signature.', 401);
  }

  const interaction: APIInteraction = JSON.parse(body);
  if (!interaction) {
    return c.text('Bad request signature.', 401);
  }

  // interact
  if (interaction.type === InteractionType.Ping) {
    return c.json<APIInteractionResponse>({
      type: InteractionResponseType.Pong,
    });
  }

  if (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.ChatInput
  ) {
    switch (interaction.data.name.toLowerCase()) {
      case KIRO_COMMAND.name.toLowerCase(): {
        // Discord は 3 秒以内の応答を要求するため、先に「考え中」を返して後から本文を書き込む
        c.executionCtx.waitUntil(respondLater(interaction, c.env));
        return c.json<APIInteractionResponse>({
          type: InteractionResponseType.DeferredChannelMessageWithSource,
        });
      }
      default:
        return c.json({ error: 'Unknown Type' }, 400);
    }
  }

  console.error('Unknown Type');
  return c.json({ error: 'Unknown Type' }, 400);
});

app.fire();

export default app;
