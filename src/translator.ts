import { Adapter } from "./adapters/adapter";
import Adapters from "./adapters";
import redaxios from './libs/redaxios'
import Workflow from './workflow/workflow'

interface ITranslator {
  adapter: Adapter;
  translate: (word: string) => Promise<any>;
}

class Translator implements ITranslator{

  adapter: Adapter;

  constructor(key: string, secret: string, platform: string, private nativeLanguage: string = "zh-CHS") {
    this.adapter = new Adapters[platform](key, secret);
  }

  public async translate(query: string): Promise<any> {
    // camel case to space case
    const word = query.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    // url
    const url = this.adapter.url(word, "en");
    // fetch
    const response = await redaxios.create().get(url);
    const detectedLanguage = String(response.data?.l || "").split("2")[0].toLowerCase();
    this.adapter.isEnglish = detectedLanguage === "en";
    if (detectedLanguage === "en" && this.nativeLanguage !== "en") {
      const nativeResponse = await redaxios.create().get(this.adapter.url(word, this.nativeLanguage));
      return new Workflow().compose(this.adapter.parse(nativeResponse.data)).output();
    }
    // parse
    const result = this.adapter.parse(response.data);
    // compose
    return new Workflow().compose(result).output();
  }
}

export default Translator;
