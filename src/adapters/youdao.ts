import { Adapter, Result } from "./adapter";
import md5 from "../libs/md5";

class Youdao implements Adapter {
  key: string;

  secret: string;

  word: string = "";

  isEnglish: boolean = false;

  results: Result[] = [];

  constructor(key: string, secret: string) {
    this.key = key;
    this.secret = secret;
  }

  url(word: string, targetLanguage: string = "en"): string {
    this.isEnglish = this.detectEnglish(word);
    this.word = word;

    const from = "auto";
    const to = targetLanguage;
    const salt = Math.floor(Math.random() * 10000).toString();
    const sign = md5(`${this.key}${word}${salt}${this.secret}`);

    const params = new URLSearchParams({
      q: word,
      from,
      to,
      appKey: this.key,
      salt,
      sign,
    });

    return "https://openapi.youdao.com/api?" + params.toString();
  }

  parse(data: any): Result[] {
    if (data.errorCode !== "0") {
      return this.parseError(data.errorCode);
    }

    const { translation, basic, web } = data;

    this.parseTranslation(translation);
    this.parseBasic(basic);
    this.parseWeb(web);

    return this.results;
  }

  private parseTranslation(translation: object) {
    if (translation) {
      const pronounce = this.isEnglish ? this.word : translation[0];
      this.addResult( translation[0], this.word, translation[0], pronounce );
    }
  }

  private parseBasic(basic: any) {
    if (basic) {
      let pronounce;
      basic.explains.forEach((explain) => {
        pronounce = this.isEnglish ? this.word : explain;
        this.addResult(explain, this.word, explain, pronounce);
      });

    }
  }

  private parseWeb(web: any) {
    if (web) {
      web.forEach((item, index) => {
        let pronounce = this.isEnglish ? item.key : item.value[0];
        this.addResult( item.value.join(", "), item.key, item.value[0], pronounce);
      });
    }
  }

  private parseError(code: number): Result[] {
    const messages = {
      101: "缺少必填的参数",
      102: "不支持的语言类型",
      103: "翻译文本过长",
      108: "应用ID无效",
      110: "无相关服务的有效实例",
      111: "开发者账号无效",
      112: "请求服务无效",
      113: "查询为空",
      202: "签名检验失败,检查 KEY 和 SECRET",
      401: "账户已经欠费",
      411: "访问频率受限",
    };

    const message = messages[code] || "请参考错误码：" + code;

    return this.addResult("👻 翻译出错啦", message, "Ooops...");
  }

  private addResult( title: string, subtitle: string, arg: string = "", pronounce: string = ""): Result[] {
    const quicklookurl = "https://www.youdao.com/w/" + this.word;

    const maxLength = this.isEnglish ? 60 : 27;
    
    if (title.length > maxLength) {
      const copy = title;
      title = copy.slice(0, maxLength);
      subtitle = copy.slice(maxLength);
    }

    this.results.push({ title, subtitle, arg, pronounce, quicklookurl });
    return this.results;
  }

  private detectEnglish(word: string): boolean {
    return /^[\p{Script=Latin}\p{M}\d\s.,!?;:'"()\[\]{}\-_/]+$/u.test(word);
  }
}

export default Youdao;
