import { parseLookupInput } from '../src/query';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(!parseLookupInput('saved').commandMode && parseLookupInput('saved').word === 'saved', 'a bare keyword should be a normal lookup');
assert(parseLookupInput(':saved').commandMode && parseLookupInput(':saved').word === 'saved', 'colon should enter the command namespace');
assert(parseLookupInput(':review rheumatic').commandMode && parseLookupInput(':review rheumatic').word === 'review rheumatic', 'review with an argument should remain intact');
assert(parseLookupInput(':clear').commandMode && parseLookupInput(':clear').word === 'clear', 'clear should be available as a command');
assert(parseLookupInput(' :export ').commandMode && parseLookupInput(' :export ').word === 'export', 'surrounding spaces should not change command parsing');
assert(!parseLookupInput('=saved').commandMode && parseLookupInput('=saved').word === 'saved', 'the earlier equals syntax should remain a lookup');
assert(!parseLookupInput('a:b').commandMode && parseLookupInput('a:b').word === 'a:b', 'colons within words should be preserved');
assert(parseLookupInput('review this').word === 'review this', 'ordinary phrases should remain intact');

console.log('Query parsing tests passed');
