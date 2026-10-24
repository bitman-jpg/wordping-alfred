import { lookupFallback } from '../src/apple-translate';
import { Result } from '../src/workflow/workflow';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const appleResult: Result = {
  title: '风湿的', subtitle: 'Apple Translation', arg: '风湿的', pronounce: 'rheumatic',
};
const memoryResult: Result = {
  title: '风湿性', subtitle: 'MyMemory', arg: '风湿性', pronounce: 'rheumatic',
};
let calls: string[] = [];
const apple = async (word: string, from: string, to: string) => {
  calls.push(`apple:${word}:${from}:${to}`);
  return [appleResult];
};
const memory = async (word: string, from: string, to: string) => {
  calls.push(`memory:${word}:${from}:${to}`);
  return [memoryResult];
};

let results = await lookupFallback('rheumatic', 'en', 'zh-CN', apple, memory);
assert(results[0] === appleResult && calls.join(',') === 'apple:rheumatic:en:zh-CN',
  'Apple should be the first fallback and skip MyMemory on success');

calls = [];
results = await lookupFallback('rheumatic', 'en', 'zh-CN', async () => [], memory);
assert(results[0] === memoryResult && calls.length === 1 && calls[0].startsWith('memory:'),
  'MyMemory should run when Apple has no translation');

calls = [];
results = await lookupFallback('rheumatic', 'en', 'zh-CN', async () => { throw new Error('missing model'); }, memory);
assert(results[0] === memoryResult && calls[0].startsWith('memory:'),
  'a local translation error should still reach MyMemory');

console.log('Apple fallback order tests passed');
