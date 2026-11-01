import { Result } from './workflow/workflow';
import { lookupOxford } from './oxford-dictionary';
import { lookupManagedDictionary } from './managed-dictionaries';

export async function lookupLocalDictionary(
  provider: 'oxford' | 'ecdict' | 'cedict', word: string, from: string, to: string,
): Promise<Result[]> {
  if (!word || /[\s\0]/.test(word)) return [];
  if (provider === 'oxford') return lookupOxford(word, from, to);
  return lookupManagedDictionary(provider, word, from, to);
}
