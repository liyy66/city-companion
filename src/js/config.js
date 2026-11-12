/* config.js — 本机配置（密钥只存 localStorage）*/
(function (global) {
  'use strict';

  var DEFAULTS = {
    amapKey: '',
    amapSecret: '',
    baseUrl: '',
    model: '',
    modelKey: '',
    proxy: '',
    searchProvider: 'auto',
    searchKey: '',
    theme: 'auto'
  };

  var injected = (typeof global.__CFG__ === 'object' && global.__CFG__) ? global.__CFG__ : {};
  var state = {};
  var listeners = [];

  function load() {
    var saved = U.store('cfg') || {};
    state = {};
    for (var k in DEFAULTS) state[k] = saved[k] != null && saved[k] !== '' ? saved[k] : (injected[k] || DEFAULTS[k]);
    // 环境里注入的 key 优先生效（构建时写入），但不落盘
    for (var j in injected) if (injected[j]) state[j] = injected[j];
    return state;
  }

  function get() { return state; }

  function patch(obj) {
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) state[k] = obj[k];
    var keep = {};
    for (var j in DEFAULTS) keep[j] = state[j];
    U.store('cfg', keep);
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.warn(e); } });
    return state;
  }

  function reset() {
    U.store('cfg', null);
    load();
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.warn(e); } });
    return state;
  }

  function onChange(fn) { listeners.push(fn); }

  function trimBase(u) {
    return String(u || '').trim().replace(/\/+$/, '');
  }

  var MODEL_PRESETS = [
    { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { label: 'Ollama（本机/局域网）', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:4b' }
  ];

  var api = {
    DEFAULTS: DEFAULTS,
    MODEL_PRESETS: MODEL_PRESETS,
    load: load, get: get, patch: patch, reset: reset, onChange: onChange,
    trimBase: trimBase,
    amapKey: function () { return String(state.amapKey || '').trim(); },
    amapSecret: function () { return String(state.amapSecret || '').trim(); },
    // 设置里填了就用填的；否则页面只要是从 http(s) 打开的，就默认用同源 /api/*。
    // 线上（Cloudflare Pages + Functions）与本地（node server.mjs）都满足「接口和页面同源」，
    // 这样访客不用配任何东西；纯静态托管时 /api/health 会 404，NET.health() 会识别并自动降级。
    proxyBase: function () {
      var b = trimBase(state.proxy || (injected.proxy || ''));
      if (b) return b;
      var loc = global.location || {};
      if (loc.protocol === 'http:' || loc.protocol === 'https:') return loc.origin;
      return '';
    },
    proxyURL: function (path, params) {
      var base = api.proxyBase();
      if (!base) return '';
      var q = [];
      for (var k in (params || {})) {
        if (params[k] == null || params[k] === '') continue;
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
      return base + path + (q.length ? (path.indexOf('?') >= 0 ? '&' : '?') + q.join('&') : '');
    },
    // 站点自带模型：/api/health 说 chat:true 时由站点（Cloudflare 环境变量）出 Key，
    // 访客打开就能用，不需要填任何东西。优先级低于用户在设置里填的配置。
    setSiteModel: function (name) { state.siteModel = String(name || ''); },
    siteModel: function () { return state.siteModel || ''; },
    modelReady: function () {
      if (state.siteModel) return true;
      if (!state.model || !state.baseUrl) return false;
      if (state.modelKey) return true;
      // 本地/局域网模型（Ollama、vLLM、LM Studio）通常不要 Key：
      // 只要页面是经 server.mjs 打开的（或设置里填了服务地址），就认为能走代理。
      return !!api.proxyBase();
    },
    modelLabel: function () {
      if (!api.modelReady()) return '证据引擎';
      return state.model || state.siteModel || '大模型';
    },
    build: function () { return global.__BUILD__ || 'dev'; }
  };

  global.CFG = api;
  load();
})(window);
