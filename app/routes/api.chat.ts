import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { getCurrentLLMType, selectLLM } from '~/lib/.server/llm/llm-selector';
import { streamText } from '~/lib/.server/llm/stream-text';
import type { Messages, StreamingOptions } from '~/lib/.server/llm/llm-interface';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

function checkForUnmatchedTags(text: string) {
  // regular expression to find <boltAction> and </boltAction>
  const openingTag = /<boltAction/g;
  const closingTag = /<\/boltAction>/g;

  // count the number of opening and closing tags
  const openingCount = (text.match(openingTag) || []).length;
  const closingCount = (text.match(closingTag) || []).length;

  // check if the counts match
  return openingCount == closingCount;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const { messages } = await request.json<{ messages: Messages }>();

  const stream = new SwitchableStream();

  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const continue_prompt = selectLLM(getCurrentLLMType()).getPrompts().getContinuePrompt();
    const options: StreamingOptions = {
      toolChoice: 'none',
      onFinish: async ({ text: content, finishReason }) => {
        console.log('finishReason:', finishReason);

        // if (finishReason !== 'length' || checkForUnmatchedTags(content)) {
        if (checkForUnmatchedTags(content)) {
          console.log('checkForUnmatchedTags: true; closing stream');
          return stream.close();
        }

        console.log('checkForUnmatchedTags: false');

        if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
          throw Error('Cannot continue message: Maximum segments reached');
        }

        const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

        console.log(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: continue_prompt });

        const result = await streamText(messages, context.cloudflare.env, options);

        return stream.switchSource(result.toDataStream({ result }));
      },
    };

    const result = await streamText(messages, context.cloudflare.env, options);

    stream.switchSource(result.toDataStream({ result }));

    return new Response(stream.readable, {
      status: 200,
      headers: {
        contentType: 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.log(error);

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
