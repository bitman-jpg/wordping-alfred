import { WebTranslation } from './keyless-youdao';

export const DETAIL_PREFIX = '# WordPing entry: ';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', 'zh-CHS': 'Simplified Chinese', 'zh-CHT': 'Traditional Chinese',
  ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
  id: 'Indonesian', nl: 'Dutch', th: 'Thai', vi: 'Vietnamese',
};

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function line(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ')
    .replace(/([\\`*_{}\[\]<>])/g, '\\$1');
}

function examples(dict: any): { source: string; translation: string }[] {
  const groups = [dict?.examples, dict?.blng_sents?.['sentence-pair'], dict?.ec?.word?.examples,
    ...asArray(dict?.ec?.word?.trs).map((entry) => entry?.examples)];
  const found: { source: string; translation: string }[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const item of asArray(group)) {
      const source = line(item?.source || item?.sentence || item?.src || item?.eng);
      const translation = line(item?.translation || item?.trans || item?.tgt || item?.chn);
      if (!source || seen.has(source.toLocaleLowerCase())) continue;
      seen.add(source.toLocaleLowerCase());
      found.push({ source, translation });
    }
  }
  return found;
}

export function entryDetail(data: WebTranslation, query: string, translation: string): string | undefined {
  if (/\s/.test(query)) return undefined;
  const word = data.dictResult?.ec?.word;
  const english = asArray(word?.trs).filter((entry: any) => entry?.tran);
  const chinese = asArray(data.dictResult?.ce?.word?.trs).filter((entry: any) => entry?.['#text']);
  if (!english.length && !chinese.length) return undefined;

  const rows = [`${DETAIL_PREFIX}${line(query)}`, '', `**Translation:** ${line(translation)}`];
  const direction = data.type?.split('2');
  if (direction?.length === 2 && direction[0] && direction[1]) {
    rows.push(`**Direction:** ${LANGUAGE_NAMES[direction[0]] || line(direction[0])} → ${LANGUAGE_NAMES[direction[1]] || line(direction[1])}`);
  }
  const headword = word?.['return-phrase'] || data.dictResult?.ce?.word?.['return-phrase'];
  if (headword && String(headword).toLocaleLowerCase() !== query.toLocaleLowerCase()) {
    rows.push(`**Dictionary headword:** ${line(headword)}`);
  }
  const examLevels = asArray(data.dictResult?.ec?.exam_type).filter((level) => typeof level === 'string' && level.trim());
  if (examLevels.length) rows.push(`**Exam levels:** ${examLevels.map(line).join(' · ')}`);

  const phones = [word?.ukphone && `UK /${line(word.ukphone)}/`, word?.usphone && `US /${line(word.usphone)}/`]
    .filter(Boolean);
  if (phones.length) rows.push('', `**Pronunciation:** ${phones.join(' · ')}`);
  const segments = asArray(data.translateResult).flatMap(asArray);
  const sourcePinyin = data.dictResult?.ce?.word?.phone
    || segments.map((segment) => segment?.srcPronounce).filter(Boolean).join(' ');
  const targetPinyin = segments.map((segment) => segment?.tgtPronounce).filter(Boolean).join(' ');
  if (direction?.[0]?.startsWith('zh') && sourcePinyin) rows.push(`**Source pinyin:** ${line(sourcePinyin)}`);
  if (direction?.[1]?.startsWith('zh') && targetPinyin) rows.push(`**Translation pinyin:** ${line(targetPinyin)}`);

  rows.push('', '## Meanings');
  for (const entry of english) {
    rows.push('', `### ${line(entry.pos || 'Other')}`);
    for (const meaning of String(entry.tran).split(/[；;]\s*/)) {
      if (meaning.trim()) rows.push(`- ${line(meaning)}`);
    }
  }
  for (const entry of chinese) {
    const meaning = line(entry['#text']);
    const translation = line(entry['#tran']);
    rows.push(`- ${meaning}${translation ? ` — ${translation}` : ''}`);
  }

  const forms = asArray(word?.wfs).map((entry: any) => entry?.wf)
    .filter((form: any) => form?.name && form?.value);
  if (forms.length) {
    rows.push('', '## Forms');
    for (const form of forms) rows.push(`- ${line(form.name)}: ${line(form.value)}`);
  }

  const sentences = examples(data.dictResult);
  if (sentences.length) {
    rows.push('', '## Examples');
    for (const sentence of sentences) {
      rows.push(`- ${sentence.source}`);
      if (sentence.translation) rows.push(`  ${sentence.translation}`);
    }
  }
  return rows.join('\n');
}
