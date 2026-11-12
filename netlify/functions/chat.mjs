/* POST /api/chat — OpenAI 兼容的模型代理
 *
 * 为什么不让页面直连模型：
 *   1) 模型 Key 写进 HTML 就等于公开（F12 就能看到），放环境变量里才安全；
 *   2) 自建服务（Ollama / vLLM / LM Studio）常常只监听 127.0.0.1 或没开 CORS。
 * 两种模式并存：
 *   - 站点自备 Key（MODEL_API_KEY / MODEL_NAME / MODEL_BASE_URL）→ 访客打开就能用；
 *   - 访客自选模型（请求体带 baseUrl/apiKey/model）→ BYOK 演示，Key 只在内存过一手。
 *
 * Netlify 同步函数上限 10 秒，所以模型这一跳留 8.5 秒；超时就明确报 504，
 * 前端会退回内置证据引擎（回答仍然逐句有出处），不会白屏。 */
import { json, fail, sameSite, rateLimit, chatUrlOf, timeoutSignal, readJson } from './_shared.mjs';

export const config = { path: '/api/chat' };

// Netlify 同步函数上限 10 秒，所以模型这一跳留 9 秒（DeepSeek 正常 4–6 秒，
// 留出冷启动余量）；超时就明确报 504，前端会退回内置证据引擎，不会白屏。
const MODEL_TIMEOUT = 9000;

export default async (req, context) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return fail(405, '只接受 POST');
  if (!sameSite(req)) return fail(403, '只允许本站页面调用这个接口');

  const limited = rateLimit(req, 'chat', 30, 600, context);
  if (!limited.ok) return fail(429, '请求太频繁，请 10 分钟后再试');

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail(400, e.message);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return fail(400, '缺少 messages');
  if (messages.length > 16) return fail(400, '对话轮次太多');
  const chars = messages.reduce((n, m) => n + String((m && m.content) || '').length, 0);
  if (chars > 24000) return fail(413, '提示词太长（' + chars + ' 字符），请精简后再问');

  const env = process.env;
  const baseUrl = String(body.baseUrl || env.MODEL_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = String(body.apiKey || env.MODEL_API_KEY || '');
  const model = String(body.model || env.MODEL_NAME || '');
  if (!baseUrl) return fail(400, '没有配置模型接口地址');
  if (!/^https?:\/\//i.test(baseUrl)) return fail(400, '模型接口地址必须是 http/https');
  if (!model) return fail(400, '没有指定模型名');

  const payload = {
    model,
    messages: messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '')
    })),
    temperature: Math.min(1.2, Math.max(0, Number(body.temperature == null ? 0.2 : body.temperature))),
    max_tokens: Math.min(900, Math.max(120, Number(body.max_tokens || 700))),
    stream: false
  };

  const t = timeoutSignal(MODEL_TIMEOUT);
  try {
    const upstream = await fetch(chatUrlOf(baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {})
      },
      body: JSON.stringify(payload),
      signal: t.signal
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return json({ ok: false, reason: '上游模型返回 ' + upstream.status, detail: text.slice(0, 300) }, 502);
    }
    // 直接透传 OpenAI 形状：前端 callModel 只读 choices[0].message.content
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    return fail(aborted ? 504 : 502, aborted
      ? '模型 ' + Math.round(MODEL_TIMEOUT / 1000) + ' 秒内没有返回（可换更小的模型或降低 max_tokens）'
      : '连不上模型：' + (e && e.message ? e.message : String(e)));
  } finally {
    t.done();
  }
};
