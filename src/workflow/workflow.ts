import Item from "./item";

export interface Result {
  title: string;
  subtitle: string;
  arg: string;
  pronounce: string;
  quicklookurl?: string;
  detail?: boolean;
  source?: string;
  partOfSpeech?: string;
  phonetics?: string;
  audioUK?: string;
  audioUS?: string;
}

class Workflow {

  private results: any[] = [];

  compose(results: Result[], query?: string): this {
    this.results = results.map(r => {
      if (r.detail) {
        const item = new Item().setTitle(r.title)
          .setSubtitle(r.subtitle)
          .setArg(r.arg)
          .setIcon('assets/translate.png')
          .result();
        if (r.source) item.variables = { wordping_source: r.source };
        return item;
      }
      const item = new Item().setTitle(r.title)
      .setSubtitle(r.subtitle)
      .setArg(r.arg)
      .setIcon('assets/translate.png')
      .setCmd('Speak locally: ' + r.pronounce, r.pronounce, true, 'assets/translate-say.png')
      .setAlt(r.phonetics ? `${r.phonetics} · Return to play online pronunciation`
        : 'Play online pronunciation: ' + r.pronounce,
      r.pronounce, true, 'assets/translate-say.png')
      .setCtrl(
        'Save word',
        query ? `~save:${encodeURIComponent(query)}` : r.arg,
        true,
        query ? { wordping_command: `~save:${encodeURIComponent(query)}`, wordping_choice: r.title } : undefined,
      )
      .setCopy(r.title)
      .setQuicklookurl(r.quicklookurl)
      .result();
      if (r.source || r.partOfSpeech) item.variables = {
        ...(r.source ? { wordping_source: r.source } : {}),
        ...(r.partOfSpeech ? { wordping_pos: r.partOfSpeech } : {}),
        ...(r.source === 'Iciba' ? {
          wordping_audio_uk: r.audioUK || '', wordping_audio_us: r.audioUS || '',
        } : {}),
      };
      return item;
    });

    return this;
  }

  output(): string {
    return JSON.stringify({ items: this.results });
  }
}

export default Workflow;
