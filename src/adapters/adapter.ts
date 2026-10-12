export interface Result {
  title: string;
  subtitle: string;
  arg: string;
  pronounce: string;
  quicklookurl?: string;
}

export interface Adapter {
  key: string;

  secret: string;

  word: string;

  isEnglish: boolean;

  url :(word: string, targetLanguage?: string) => string;

  parse: (response: any) => Result[]
}

