/* ai.js — 问答编排：理解 → 检索 → （可选）联网 → 生成 → 逐句校验
 *
 * 关键约束：模型只能使用我们给的证据编号回答；返回后逐句校验编号，
 * 引用了不存在编号的句子会被直接丢弃。这样「答非所问」和「编造」都被挡在渲染之前。
 */
(function (global) {
  'use strict';

  var state = {
    messages: [],
    ctx: { city: null, place: null },
    lastAnswer: null
  };

  function reset() {
    state.messages = [];
    state.lastAnswer = null;
    state.ctx = { city: state.ctx.city, place: null };
  }

  function setCity(city) {
    state.ctx.city = city || null;
    if (!city) { state.ctx.place = null; return; }
    // 换了城市就丢掉上一座城市的景点上下文，避免「从哪个门进」问错地方
    var p = state.ctx.place;
    if (p && p.city && p.city !== city.name && (DATA.resolveCity(p.city) || {}).name !== city.name) {
      state.ctx.place = null;
    }
  }

  function setPlace(place) {
    state.ctx.place = place || null;
    if (place) state.ctx.city = DATA.resolveCity(place.city) || { name: place.city };
  }

  function modelEndpoint() {
    var cfg = CFG.get();
    var base = CFG.trimBase(cfg.baseUrl);
    if (!base) return '';
    return base + '/chat/completions';
  }

  function callModel(messages, opts) {
    opts = opts || {};
    var cfg = CFG.get();
    var proxy = CFG.proxyBase();
    var payload = {
      // 站点内置模型时把 model 留空，让服务端用它自己配置的名字（否则会覆盖成 gpt-4o-mini）
      model: cfg.model || (CFG.siteModel && CFG.siteModel() ? '' : 'gpt-4o-mini'),
      messages: messages,
      temperature: opts.temperature == null ? 0.2 : opts.temperature,
      max_tokens: opts.maxTokens || 700,
      stream: false
    };
    var req;
    if (proxy) {
      req = fetch(proxy + '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({}, payload, {
          baseUrl: CFG.trimBase(cfg.baseUrl),
          apiKey: cfg.modelKey || ''
        }))
      });
    } else {
      var url = modelEndpoint();
      if (!url) return Promise.reject(new Error('未填写模型接口地址'));
      req = fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (cfg.modelKey || '') },
        body: JSON.stringify(payload)
      });
    }
    return req.then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('模型返回 ' + r.status + '：' + String(t || '').slice(0, 160));
        });
      }
      return r.json();
    }).then(function (d) {
      var msg = d && d.choices && d.choices[0] && d.choices[0].message;
      var text = (msg && (msg.content || (msg.reasoning_content ? '' : ''))) || '';
      if (!text) throw new Error('模型没有返回内容');
      return text;
    }).catch(function (e) {
      if (e && e.name === 'TypeError') {
        throw new Error('浏览器直接被跨域拦截（CORS）。请运行 node server.mjs 并在设置里填本地服务地址，或改用代理。');
      }
      throw e;
    });
  }

  function extractJSON(text) {
    var s = String(text || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  // 4B 这级小模型第一次经常忘了按 JSON 回、或者句子漏编号；用这段话让它照着上一版改。
  var REPAIR_PROMPT = '上面的输出不合格：要么不是 JSON，要么有的句子没有 n 编号。' +
    '请只输出一个 JSON 对象，不要任何解释文字：' +
    '{"lead":"一句话结论","answers":[{"title":"门票","lines":[{"t":"句子","n":[1]}]}],"missing":[]}。' +
    'n 必须取上面证据里出现过的编号；写不出来的事实就不要写，放进 missing。';

  function buildPrompt(question, g, webBlock) {    var ev = KB.evidencePrompt(g);
    var sys = [
      '你是「城市安心游」的行程向导小安，服务对象是刚落地一座陌生城市的游客。',
      '硬性规则，违反任何一条都算失败：',
      '1) 只能使用下面编号证据里出现的事实。票价、时间、入口、电话、距离、政策，一律不得凭常识补全。',
      '2) 每一条 answers[].lines[] 必须给 n 数组，写用到的证据编号；没有对应证据的句子不要写。',
      '3) 证据不足时，把缺什么写进 missing，不要猜。missing 里写「未收录：X」这种具体说法。',
      '4) 先直接回答，再补充细节；总长度不超过 6 句，口语中文，不要 Markdown 标题。',
      '5) 不要提「根据证据」「作为 AI」这类元话语，直接说事。',
      '6) 有官方渠道（gov.cn）原文时，以官方原文为准；官方与其它网页冲突时，采纳官方并在 missing 里注明「公开网页与官方口径不一致」。',
      '只输出 JSON，结构：{"lead":"一句话结论","answers":[{"title":"门票","lines":[{"t":"句子","n":[1,2]}]}],"missing":["未收录：……"]}'
    ].join('\n');

    var user = [
      '【当前上下文】城市：' + (g.cityName || '未确定') + '；景点：' + (g.place ? g.place.n : '未指定'),
      '【用户问题】' + question,
      '【编号证据】',
      ev.text || '（无）',
      webBlock || ''
    ].join('\n');

    return [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ];
  }

  function validateModelJSON(obj, g) {
    if (!obj || !obj.answers) return null;
    var valid = {};
    g.all.forEach(function (f) { if (f.text && f._n) valid[f._n] = f; });
    var answers = [];
    (obj.answers || []).forEach(function (a) {
      if (!a || !a.lines) return;
      var lines = [];
      (a.lines || []).forEach(function (l) {
        if (!l || !l.t) return;
        var ns = Array.isArray(l.n) ? l.n : (l.n ? [l.n] : []);
        var cites = ns.map(function (n) { return valid[n] && valid[n].cite; }).filter(Boolean);
        if (!cites.length) return; // 没出处 → 丢弃
        lines.push({ text: String(l.t).trim(), cites: cites });
      });
      if (lines.length) answers.push({ title: String(a.title || '回答'), lines: lines });
    });
    if (!answers.length) return null;
    return {
      lead: String(obj.lead || '').trim(),
      blocks: answers,
      notes: (obj.missing || []).map(function (m) { return { text: String(m) }; })
    };
  }

  var WEB_WORDS = {
    ticket: '门票 价格', hours: '开放时间', booking: '预约 实名', entrance: '入口 大门 怎么进',
    route: '怎么去 交通', crowd: '人多 排队 限流', safety: '安全 提示 公告', verify: '投诉 举报 电话',
    food: '吃什么 美食', photo: '拍照 机位', intro: '介绍 历史'
  };

  function webQueryFor(parsed, cityName, place) {
    var words = [];
    parsed.intents.forEach(function (it) {
      if (WEB_WORDS[it.id] && words.indexOf(WEB_WORDS[it.id]) < 0) words.push(WEB_WORDS[it.id]);
    });
    var parts = [place ? place.n : '', cityName || '', words.slice(0, 2).join(' ')];
    var q = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return q || (cityName || '') + ' 旅游 官方 公告';
  }

  function wantsFresh(parsed) {
    var ids = parsed.intents.map(function (x) { return x.id; });
    return ids.some(function (id) { return ['hours', 'crowd', 'booking', 'ticket', 'safety', 'route'].indexOf(id) >= 0; });
  }

  /**
   * 主流程。hooks: {step(name, detail), delta(text)}
   */
  function ask(question, hooks) {
    hooks = hooks || {};
    var step = function (name, detail) { if (hooks.step) hooks.step(name, detail); };

    step('understand', '解析城市与意图');
    var parsed = KB.parse(question, state.ctx);
    if (parsed.city) state.ctx.city = parsed.city;
    if (parsed.place) state.ctx.place = parsed.place;

    step('local', parsed.place ? '检索「' + parsed.place.n + '」的景点卡' : (parsed.city ? '检索「' + parsed.city.name + '」资料' : '检索内置资料'));
    var g = KB.gather(question, state.ctx);
    g.parsed = parsed;

    state.messages.push({ role: 'user', content: question });

    var webPromise, officialPromise;
    if (wantsFresh(parsed)) {
      step('web', '查官方渠道 + 联网核对');
      var q = webQueryFor(parsed, g.cityName, g.place);
      webPromise = NET.search(q, { city: g.cityName }).then(function (r) {
        return Object.assign({ query: q }, r);
      });
      officialPromise = NET.official(q, g.cityName).then(function (r) {
        return Object.assign({ query: q }, r);
      });
    } else {
      webPromise = Promise.resolve({ ok: false, reason: '此问题不需要实时信息', results: [], via: 'skip', query: '' });
      officialPromise = Promise.resolve({ ok: false, sources: [], via: 'skip', reason: '' });
    }

    return Promise.all([webPromise, officialPromise]).then(function (pair) {
      var web = pair[0];
      var off = pair[1];
      web.official = off;
      // 把官方正文与联网结果并入证据池（编号续在本地证据之后）
      var offset = g.all.filter(function (f) { return f.text; }).length;
      var offOnlyWx = !!(off.ok && off.sources && off.sources.length &&
        off.sources.every(function (s) { return s.kind === 'wechat'; }));
      var webLines = '';
      if (off.ok && off.sources.length) {
        webLines += offOnlyWx
          ? '\n【景区微信公众号文章摘要（景区自己的公告渠道，非政府站原文，引用时说明是公众号）】'
          : '\n【官方渠道正文（gov.cn，权威出处，优先生效）】';
        off.sources.slice(0, 3).forEach(function (r, i) {
          var n = offset + i + 1;
          webLines += '\n[' + n + '] ' + r.title + '（' + r.host + (r.date ? ' ' + r.date : '') + '）：' + U.cut(r.text, 700);
          g.all.push({
            id: 'off-' + i, intent: 'official', title: r.title, text: U.cut(r.text, 900),
            cite: { t: U.hostLabel(r.url), u: r.url, d: r.date || '' }, _n: n, official: true
          });
        });
        offset += off.sources.slice(0, 3).length;
      }
      if (web.ok && web.results.length) {
        webLines += '\n【联网检索结果（可能过期，需标注来源）】';
        web.results.slice(0, 6).forEach(function (r, i) {
          var n = offset + i + 1;
          webLines += '\n[' + n + '] ' + r.title + '：' + U.cut(r.snippet, 220) + '（来源：' + U.hostOf(r.url) + ' ' + r.url + '）';
          g.all.push({
            id: 'web-' + i, intent: 'web', title: r.title, text: U.cut(r.snippet, 400),
            cite: { t: U.hostLabel(r.url), u: r.url, d: '' }, _n: n, web: true
          });
        });
      }

      step('compose', CFG.modelReady() ? '交给模型生成并校验引用' : '用内置证据合成回答');

      var fallback = function (reason) {
        var local = KB.composeLocal(g);
        local.mode = 'local';
        local.web = web;
        if (reason) local.modelError = reason;
        // 官方正文优先作为补充块
        if (off.ok && off.sources.length) {
          local.blocks.unshift({
            title: offOnlyWx ? '景区公众号文章摘要' : '官方页面原文摘录',
            note: offOnlyWx
              ? '以下是景区/文旅微信公众号文章里与这个问题相关的摘要（公开转载），不是政府站原文，请点开原文核对。'
              : '以下是政府/主管部门页面里与本问题相关的原文，优先以此为准。',
            lines: off.sources.slice(0, 3).map(function (r) {
              return {
                text: U.cut(r.text, 260),
                cites: [{ t: U.hostLabel(r.url), u: r.url, d: r.date || '' }],
                official: true
              };
            })
          });
        }
        // 联网结果作为补充块
        if (web.ok && web.results.length) {
          local.blocks.push({
            title: '联网检索到的公开信息',
            note: '这些是公开网页摘要，不是官方口径，用前请点开原页核对。',
            lines: web.results.slice(0, 4).map(function (r) {
              return { text: r.title + '：' + U.cut(r.snippet, 160), cites: [{ t: U.hostLabel(r.url), u: r.url, d: '' }], web: true };
            })
          });
        }
        return local;
      };

      if (!CFG.modelReady()) return fallback('');

      var messages = buildPrompt(question, g, webLines);
      // 小模型（4B 这级）经常第一次就漏编号或回成一坨解释文字：给它一次「看着自己上一版改」的机会，
      // 这正是「答非所问」里比较隐蔽的一种 —— 模型答得挺顺，但没有一句能对上出处。
      var attempt = function (msgs, left) {
        return callModel(msgs, { maxTokens: 800 }).then(function (text) {
          var v = validateModelJSON(extractJSON(text), g);
          if (v) return v;
          if (left <= 0) return null;
          step('repair', '模型输出没通过引用校验，带上它的原文重试一次');
          return attempt(msgs.concat([
            { role: 'assistant', content: String(text || '').slice(0, 1200) },
            { role: 'user', content: REPAIR_PROMPT }
          ]), left - 1);
        });
      };
      return attempt(messages, 1).then(function (v) {
        if (!v) return fallback('模型输出没有可校验的引用（已重试一次），已改用证据引擎');
        v.mode = 'model';
        v.web = web;
        v.cites = [];
        v.blocks.forEach(function (b) {
          b.lines.forEach(function (l) { v.cites = v.cites.concat(l.cites); });
        });
        v.channels = g.cityName ? KB.channels(g.cityName).slice(0, 4) : KB.channels('全国').slice(0, 3);
        return v;
      }).catch(function (e) {
        return fallback('模型调用失败：' + e.message);
      });
    }).then(function (ans) {
      ans.parsed = parsed;
      ans.city = state.ctx.city;
      // 只有这一轮真的用到了景点，才把它显示成「景点」上下文
      ans.place = g.place || null;
      state.lastAnswer = ans;
      state.messages.push({
        role: 'assistant', content: (ans.lead || '') + ' ' + (ans.blocks || []).map(function (b) {
          return b.lines.map(function (l) { return l.text; }).join('');
        }).join(' ')
      });
      return ans;
    });
  }

  global.AI = {
    state: state, reset: reset, setCity: setCity, setPlace: setPlace,
    ask: ask, callModel: callModel, modelEndpoint: modelEndpoint
  };
})(window);
