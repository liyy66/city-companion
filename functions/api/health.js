/* GET /api/health — 能力自检：前端据此决定要不要显示「联网」「官方原文」「模型」标记 */
import { json, preflight } from '../_lib.js';

export const onRequestOptions = () => preflight();

export const onRequestGet = async ({ env }) => {
  const baseUrl = env.MODEL_BASE_URL || 'https://api.deepseek.com/v1';
  return json({
    ok: true,
    service: 'anxin-trip',
    version: 3,
    runtime: 'cloudflare-pages',
    now: new Date().toISOString(),
    capabilities: {
      // 有博查/Tavily 时走 API（快且合规），没有就退回 HTML 检索（可能被验证码拦）
      search: env.BOCHA_API_KEY ? 'bocha' : (env.TAVILY_API_KEY ? 'tavily' : 'html'),
      official: true,
      chat: !!(env.MODEL_API_KEY && env.MODEL_NAME && baseUrl),
      amap: !!env.AMAP_KEY,
      rateLimit: !!env.AX_KV,
      model: env.MODEL_NAME || ''
    },
    tips: env.BOCHA_API_KEY
      ? []
      : ['没有配置 BOCHA_API_KEY，官方渠道会退回 HTML 检索，海外节点可能被验证码拦住']
  });
};
