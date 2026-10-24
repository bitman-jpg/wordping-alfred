import Item from "./item";

export interface Result {
  title: string;
  subtitle: string;
  arg: string;
  pronounce: string;
  quicklookurl?: string;
}

class Workflow {

  private results: any[] = [];

  compose(results: Result[], query?: string): this {
    this.results = results.map(r => {
      return new Item().setTitle(r.title)
      .setSubtitle(r.subtitle)
      .setArg(r.arg)
      .setIcon('assets/translate.png')
      .setCmd('Speak locally: ' + r.pronounce, r.pronounce, true, 'assets/translate-say.png')
      .setAlt('Play online pronunciation: ' + r.pronounce, r.pronounce, true, 'assets/translate-say.png')
      .setCtrl(
        'Save word',
        query ? `~save:${encodeURIComponent(query)}` : r.arg,
        true,
        query ? { wordping_command: `~save:${encodeURIComponent(query)}` } : undefined,
      )
      .setCopy(r.title)
      .setQuicklookurl(r.quicklookurl)
      .result();
    });

    return this;
  }

  output(): string {
    return JSON.stringify({ items: this.results });
  }
}

export default Workflow;
