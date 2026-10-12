import { Result } from "../adapters/adapter";
import Item from "./item";

class Workflow {

  private results: any[] = [];

  compose(results: Result[]): this {
    this.results = results.map(r => {
      return new Item().setTitle(r.title)
      .setSubtitle(r.subtitle)
      .setArg(r.arg)
      .setIcon('assets/translate.png')
      .setCmd('Speak locally: ' + r.pronounce, r.pronounce, true, 'assets/translate-say.png')
      .setAlt('Play online pronunciation: ' + r.pronounce, r.pronounce, true, 'assets/translate-say.png')
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
