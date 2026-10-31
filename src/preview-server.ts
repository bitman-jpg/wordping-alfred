declare var tjs: any;
import { previewHandler } from './preview-handler';

const statePath = tjs.args[3];
if (!statePath) throw new Error('Missing preview state path');
const token = crypto.randomUUID();
let lastRequest = Date.now();
const handle = previewHandler(token);
const server = tjs.serve({ listenIp: '127.0.0.1', port: 0, async fetch(request: Request) {
  lastRequest = Date.now();
  return handle(request);
}});
await tjs.writeFile(statePath, JSON.stringify({ port: server.port, token }));
setInterval(() => { if (Date.now() - lastRequest > 30 * 60 * 1000) tjs.exit(0); }, 60000);
