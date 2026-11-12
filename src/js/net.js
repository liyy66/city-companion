/* net.js — 网络层：行政边界、高德 Web 服务、联网检索、本地代理
 *
 * 设计原则：任何一次外部请求失败都必须「说出来」，不能静默降级成看起来正常的答案。
 */
(function (global) {
  'use strict';

  var boundaryCache = new Map();
  var poiCache = new Map();

  function withTimeout(promise, ms, tag) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((tag || '请求') + '超时（' + Math.round(ms / 1000) + 's）'));
      }, ms);
      promise.then(function (v) { if (done) return; done = true; clearTimeout(t); resolve(v); },
        function (e) { if (done) return; done = true; clearTimeout(t); reject(e); });
    });
  }

  function fetchJSON(url, opts) {
    opts = opts || {};
    var ms = opts.timeout || 12000;
    var init = { method: opts.method || 'GET', headers: opts.headers || {} };
    if (opts.body) {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      init.headers['content-type'] = init.headers['content-type'] || 'application/json';
    }
    var p = fetch(url, init).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    return withTimeout(p, ms, opts.tag || '数据');
  }

  function fetchText(url, opts) {
    opts = opts || {};
    var p = fetch(url, { method: opts.method || 'GET', headers: opts.headers || {} }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
    return withTimeout(p, opts.timeout || 12000, opts.tag || '页面');
  }

  /* ---------------- 行政边界（DataV.GeoAtlas，GCJ-02 坐标） ---------------- */

  function boundary(adcode) {
    if (!adcode) return Promise.resolve(null);
    if (boundaryCache.has(adcode)) return boundaryCache.get(adcode);

    // DataV 会按 Referer 拦：从 xxx.netlify.app 这类第三方域名直接取会 403。
    // 所以有同源后端时优先走后端（服务端没有 Referer），没有时再直连（本地 file:// 用）。
    var proxyURL = CFG.proxyURL('/api/boundary', { adcode: adcode });
    var urls = (proxyURL ? [proxyURL] : []).concat([
      'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '_full.json',
      'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '.json'
    ]);

    var p = (async function () {
      for (var i = 0; i < urls.length; i++) {
        try {
          var geo = await fetchJSON(urls[i], { timeout: 14000, tag: '行政边界' });
          if (geo && geo.type) return geo;
          if (geo && geo.geo && geo.geo.type) return geo.geo;
        } catch (e) { /* 试下一个 */ }
      }
      return null;
    })();

    boundaryCache.set(adcode, p);
    return p;
  }

  /* ---------------- 高德 Web 服务（需 Key；restapi 支持 CORS） ---------------- */
  /* 传入 / 返回坐标均为 WGS-84；高德接口用 GCJ-02，这里统一换算。 */

  function amapBase() {
    var key = CFG.amapKey();
    if (!key) return '';
    return 'https://restapi.amap.com/v3/';
  }

  function parseLocation(loc) {
    var a = String(loc || '').split(',');
    if (a.length !== 2) return null;
    var w = GEO.gcj2wgs(+a[1], +a[0]);
    return { lat: w[0], lng: w[1] };
  }

  function amapPOI(keyword, city, limit) {
    var base = amapBase();
    if (!base || !keyword) return Promise.resolve({ ok: false, reason: '未配置高德 Key', pois: [] });
    var ck = keyword + '|' + city;
    if (poiCache.has(ck)) return poiCache.get(ck);
    var url = base + 'place/text?key=' + encodeURIComponent(CFG.amapKey()) +
      '&keywords=' + encodeURIComponent(keyword) +
      '&city=' + encodeURIComponent(city || '') +
      '&citylimit=true&offset=' + (limit || 20) + '&page=1&extensions=base';
    var p = fetchJSON(url, { timeout: 10000, tag: '高德检索' }).then(function (d) {
      if (!d || d.status !== '1') throw new Error(d && d.info ? d.info : '高德返回异常');
      var pois = (d.pois || []).map(function (x) {
        var ll = parseLocation(x.location);
        return {
          name: x.name, address: x.address, tel: x.tel, type: x.type,
          lat: ll && ll.lat, lng: ll && ll.lng, gcj: true, source: 'amap'
        };
      }).filter(function (x) { return x.lat != null; });
      return { ok: true, pois: pois, count: d.count };
    }).catch(function (e) {
      return { ok: false, reason: e.message, pois: [] };
    });
    poiCache.set(ck, p);
    return p;
  }

  function amapRoute(from, to, mode) {
    var base = amapBase();
    if (!base) return Promise.resolve({ ok: false, reason: '未配置高德 Key' });
    var g1 = GEO.wgs2gcj(from.lat, from.lng);
    var g2 = GEO.wgs2gcj(to.lat, to.lng);
    var origin = g1[1] + ',' + g1[0], dest = g2[1] + ',' + g2[0];
    var path = mode === 'walk' ? 'direction/walking' : (mode === 'transit' ? 'direction/transit/integrated' : 'direction/driving');
    var url = base + path + '?key=' + encodeURIComponent(CFG.amapKey()) +
      '&origin=' + origin + '&destination=' + dest +
      (mode === 'transit' ? '&city=' + encodeURIComponent(to.city || '') : '') +
      '&extensions=base';
    return fetchJSON(url, { timeout: 12000, tag: '高德路线' }).then(function (d) {
      if (!d || d.status !== '1') throw new Error(d && d.info ? d.info : '高德路线返回异常');
      var out = { ok: true, mode: mode, distance: 0, duration: 0, points: [], steps: [] };
      if (d.route && d.route.paths && d.route.paths.length) {
        var p = d.route.paths[0];
        out.distance = +p.distance || 0;
        out.duration = +p.duration || 0;
        (p.steps || []).forEach(function (s) {
          (s.polyline || '').split(';').forEach(function (pair) {
            var a = pair.split(',');
            if (a.length === 2) {
              var w = GEO.gcj2wgs(+a[1], +a[0]);
              out.points.push([w[0], w[1]]);
            }
          });
          if (s.instruction) out.steps.push(s.instruction);
        });
      } else if (d.route && d.route.transits && d.route.transits.length) {
        var tr = d.route.transits[0];
        out.distance = +tr.distance || 0;
        out.duration = +tr.duration || 0;
        out.steps.push('公交方案需结合站点步行，建议在高德 App 内查看详细换乘。');
      }
      return out;
    }).catch(function (e) {
      return { ok: false, reason: e.message };
    });
  }

  /* ---------------- 联网检索 ---------------- */
  /* 顺序：本地代理 → 博查 API → Tavily → 无 */

  function normalizeResults(list) {
    return (list || []).map(function (x) {
      if (!x) return null;
      return {
        title: x.title || x.name || '未命名结果',
        url: x.url || x.link || '',
        snippet: x.snippet || x.summary || x.content || x.description || '',
        kind: x.kind || 'web'
      };
    }).filter(function (x) { return x && x.url; });
  }

  function bochaSearch(q, key) {
    return fetchJSON('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      timeout: 9000,
      tag: '博查检索',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: { query: q, freshness: 'oneYear', summary: true, count: 8 }
    }).then(function (d) {
      var v = d && d.data && d.data.webPages && d.data.webPages.value;
      return normalizeResults(v);
    });
  }

  function tavilySearch(q, key) {
    return fetchJSON('https://api.tavily.com/search', {
      method: 'POST', timeout: 9000, tag: 'Tavily 检索',
      headers: { 'content-type': 'application/json' },
      body: { api_key: key, query: q, search_depth: 'basic', max_results: 8, include_answer: false }
    }).then(function (d) { return normalizeResults(d && d.results); });
  }

  function proxySearch(q, city) {
    var url = CFG.proxyURL('/api/search', { q: q, city: city || '' });
    if (!url) return Promise.reject(new Error('未配置本地服务'));
    return fetchJSON(url, { timeout: 14000, tag: '本地检索' }).then(function (d) {
      return normalizeResults(d && (d.results || d.items));
    });
  }

  function proxyPage(url) {
    var u = CFG.proxyURL('/api/page', { url: url });
    if (!u) return Promise.reject(new Error('未配置本地服务'));
    return fetchJSON(u, { timeout: 14000, tag: '页面抓取' });
  }

  /**
   * 官方渠道：让本地服务只检索政府站点（gov.cn）并抓正文。
   * 没有本地服务时返回 ok:false（前端据此说明"官方渠道需要本地服务"）。
   */
  function official(q, city) {
    var url = CFG.proxyURL('/api/official', { q: q, city: city || '' });
    if (!url) return Promise.resolve({ ok: false, via: 'none', sources: [], reason: '未连接本地服务，无法抓取政府站点' });
    return fetchJSON(url, { timeout: 16000, tag: '官方渠道' }).then(function (d) {
      var list = (d && (d.sources || d.pages)) || [];
      list = list.map(function (x) {
        return {
          title: x.title || '官方页面',
          url: x.url || '',
          host: x.host || U.hostOf(x.url || ''),
          text: x.text || x.snippet || '',
          date: x.date || '',
          kind: x.kind === 'wechat' ? 'wechat' : 'official'
        };
      }).filter(function (x) { return x.url; });
      return { ok: !!list.length, via: (d && d.via) || 'proxy', sources: list, reason: list.length ? '' : ((d && d.reason) || '政府站点没有相关页面') };
    }).catch(function (e) {
      return { ok: false, via: 'proxy', sources: [], reason: e.message };
    });
  }

  function search(q, opts) {
    opts = opts || {};
    var cfg = CFG.get();
    var provider = cfg.searchProvider || 'auto';
    var key = String(cfg.searchKey || '').trim();
    if (provider === 'none') return Promise.resolve({ ok: false, reason: '已关闭联网检索', results: [], via: 'off' });

    var chain = [];
    if (CFG.proxyBase() && (provider === 'auto' || provider === 'proxy' || provider === 'bocha' || provider === 'tavily')) {
      chain.push({ via: 'proxy', run: function () { return proxySearch(q, opts.city); } });
    }
    if (key && (provider === 'auto' || provider === 'bocha')) {
      chain.push({ via: 'bocha', run: function () { return bochaSearch(q, key); } });
    }
    if (key && (provider === 'auto' || provider === 'tavily')) {
      chain.push({ via: 'tavily', run: function () { return tavilySearch(q, key); } });
    }
    if (!chain.length) {
      return Promise.resolve({ ok: false, reason: '未配置本地服务或检索 API Key', results: [], via: 'none' });
    }

    var lastErr = '';
    return chain.reduce(function (p, step) {
      return p.then(function (acc) {
        if (acc && acc.ok) return acc;
        return step.run().then(function (results) {
          if (results && results.length) return { ok: true, via: step.via, results: results };
          return { ok: false, via: step.via, reason: lastErr || '检索无结果', results: [] };
        }).catch(function (e) {
          lastErr = step.via + '：' + e.message;
          return { ok: false, via: step.via, reason: lastErr, results: [] };
        });
      });
    }, Promise.resolve(null)).then(function (r) {
      return r || { ok: false, reason: '检索失败', results: [], via: 'none' };
    });
  }

  /* ---------------- 健康检查 ---------------- */

  function probeTile() {
    var url = 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=816&y=404&z=10';
    var img = new Image();
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, reason: '底图超时' }); } }, 8000);
      img.onload = function () { if (done) return; done = true; clearTimeout(t); resolve({ ok: true }); };
      img.onerror = function () { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, reason: '底图不可达' }); };
      img.src = url;
    });
  }

  function probeProxy() {
    var base = CFG.proxyBase();
    if (!base) return Promise.resolve({ ok: false, reason: '没有可用的接口地址' });
    var url = CFG.proxyURL('/api/health');
    return fetchJSON(url, { timeout: 5000, tag: '本地服务' })
      .then(function (d) { return { ok: true, info: d }; })
      .catch(function (e) { return { ok: false, reason: e.message }; });
  }

  /* 站点能力自检：线上（Pages Functions）与本地（server.mjs）都由 /api/health 回答。
     成功就记住，避免每个问题都多一次请求；改了设置会清掉缓存。 */
  var healthCache = null;

  function health() {
    var base = CFG.proxyBase();
    if (!base) {
      return Promise.resolve({ ok: false, reason: '这是纯静态打开的页面，没有 /api 接口', capabilities: {} });
    }
    if (healthCache) return Promise.resolve(healthCache);
    return fetchJSON(base + '/api/health', { timeout: 4000, tag: '能力自检' })
      .then(function (d) {
        var c = (d && d.capabilities) || {};
        healthCache = { ok: true, capabilities: c, model: c.model || '', runtime: d.runtime || 'node' };
        return healthCache;
      })
      .catch(function (e) {
        // 不缓存失败：用户可能刚启动服务或刚填了地址
        return { ok: false, reason: e.message, capabilities: {} };
      });
  }

  function resetHealth() { healthCache = null; }

  function probeModel() {
    var cfg = CFG.get();
    if (!CFG.modelReady()) return Promise.resolve({ ok: false, reason: '未配置模型' });
    var base = CFG.trimBase(cfg.baseUrl);
    if (!base) return Promise.resolve({ ok: false, reason: '未填写接口地址' });

    // 有本地服务就走它的 /api/chat：浏览器不必直接跨域访问模型，
    // 本机/局域网的小模型冷启动也要几十秒，所以超时给到 90s。
    var proxy = CFG.proxyBase();
    var url = proxy ? proxy + '/api/chat' : base + '/chat/completions';
    var body = {
      model: cfg.model, temperature: 0, max_tokens: 8, stream: false,
      messages: [{ role: 'user', content: '回复“在线”两个字。' }]
    };
    if (proxy) { body.baseUrl = base; body.apiKey = cfg.modelKey || ''; }

    var init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (cfg.modelKey || 'proxy') },
      body: JSON.stringify(body)
    };
    var p = fetch(url, init).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) {}
        if (!r.ok) {
          throw new Error((d && (d.reason || (d.error && d.error.message))) || ('HTTP ' + r.status));
        }
        return d || {};
      });
    });
    return withTimeout(p, 90000, '模型连通性').then(function (d) {
      var t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      return { ok: true, text: String(t || '').trim(), via: proxy ? 'proxy' : 'direct' };
    }).catch(function (e) {
      var m = e.message || String(e);
      if (/Failed to fetch|NetworkError|load failed/i.test(m) || e.name === 'TypeError') {
        m = '连不上模型：浏览器被跨域拦截，或模型只监听 127.0.0.1。请用 node server.mjs 打开页面，并确认模型已设 OLLAMA_HOST=0.0.0.0';
      }
      return { ok: false, reason: m };
    });
  }

  function probeAmapKey() {
    if (!CFG.amapKey()) return Promise.resolve({ ok: false, reason: '未填写 Key' });
    return amapPOI('洪崖洞', '重庆', 1).then(function (r) {
      if (r.ok) return { ok: true, sample: r.pois[0] && r.pois[0].name };
      return { ok: false, reason: r.reason };
    });
  }

  global.NET = {
    fetchJSON: fetchJSON, fetchText: fetchText, withTimeout: withTimeout,
    boundary: boundary, amapPOI: amapPOI, amapRoute: amapRoute,
    search: search, proxyPage: proxyPage, official: official,
    health: health, resetHealth: resetHealth,
    probeTile: probeTile, probeProxy: probeProxy, probeModel: probeModel, probeAmapKey: probeAmapKey
  };
})(window);
