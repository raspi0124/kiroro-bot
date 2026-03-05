import { getLatestConversationTurns } from './api/discord';
import { chatGpt, summarizeOnepiece, type ConversationTurn } from './api/gpt';
import { subjects } from './subjects';
import { Bindings } from './bindings';
import { D1PreparedStatement } from '@cloudflare/workers-types';

const PAST_CONVERSATION_LENGTH = 2;

export const createResponseMessage = async (interaction: any, env: Bindings) => {
  const input: string = interaction.data.options.find(
    (option: any) => option.name == 'content',
  ).value;
  const bannedUsernames = env.BANNED_USERS ? env.BANNED_USERS.split(',') : [];

  // response
  const rapidFire = input.match(/(.+?)([0-9]+)連射/);
  let response: string;

  // display banned users
  if (input.includes('BAN')) {
    response =
      bannedUsernames.length > 0
        ? `キロロ寿司と${bannedUsernames.join('と')}が嫌いキロ`
        : 'キロロはみんなのこと大好きキロ〜';
  }
  // called from a banned user
  else if (bannedUsernames.includes(interaction.member.user.username)) {
    response = '心無い利用者に返す言葉はないキロ';
  }
  // rapid fire
  else if (rapidFire) {
    response = [...Array(parseInt(rapidFire[2]))].map((_) => rapidFire[1]).join('\n');
  }
  // stop taking courses
  else if (input.includes('履修')) {
    const subject = subjects[Math.floor(Math.random() * (subjects.length - 1))];
    response = `キロ〜キロ〜 履修切るキロ〜〜 ${subject}をきっちゃうキロ〜〜`;
  }
  // one piece
  else if (input.includes('ワンピース')) {
    let no = undefined;
    const numberMatches = input.match(/[0-9]+/);
    if (numberMatches) {
      no = parseInt(numberMatches[0]);
    }
    try {
      let statement: D1PreparedStatement;
      if (no) {
        statement = env.DB.prepare('SELECT * FROM onepiece WHERE id = ?;').bind(no);
      } else {
        statement = env.DB.prepare('SELECT * FROM onepiece ORDER BY id DESC;');
      }
      const row = await statement.first();
      response = row
        ? `キロロがこっそり教えちゃうキロ……\n\n> ${row['content']}`
        : `\n> 富・名声・力、この世のすべてを手に入れた、海賊王・キロロロ
> 彼女の死に際に放った一言は、人々を海へ駆り立てた。
> 「キロロの財宝ですキロ？欲しけりゃくれるですキロ。探せ〜〜！この世のすべてをそこに置いてきましたキロ！」
> 男達は、グランドラインを目指し、夢を追い続ける。
> 世はまさに、大海賊時代!`;
    } catch (e) {
      throw new Error(`Failed to load the summary of "one piece": ${e}`);
    }
  }
  // execute javascript
  else if (input.includes('実行') && input.includes(':')) {
    const code = input.slice(input.indexOf(':')).replace(/fetch/, '');
    return Function(code)();
  }
  // gpt
  else {
    let historyTurns: ConversationTurn[] = [];
    if (interaction.channel_id) {
      try {
        historyTurns = await getLatestConversationTurns(
          interaction.channel_id,
          PAST_CONVERSATION_LENGTH,
          env,
        );
      } catch (e) {
        console.error(`Failed to load conversation history: ${e}`);
      }
    }
    response = await chatGpt(
      [...historyTurns, { role: 'user', content: input }],
      env.OPENROUTER_API_KEY,
    );
  }
  return `> ${input}\n${response}`;
};
