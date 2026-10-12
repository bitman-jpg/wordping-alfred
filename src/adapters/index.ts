import Youdao from './youdao';

const Adapters: Record<string, new (key: string, secret: string) => Youdao> = {
  Youdao,
};

export default Adapters;
