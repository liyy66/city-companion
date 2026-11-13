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

  // 资料库里没有 / 模型找不到可引用证据时走这条路：允许模型用自己的知识回答，
  // 但必须自己声明哪些是要核实的，界面上会标「模型常识 · 未核实」。
  var GENERAL_PROMPT = [
    '你是「城市安心游」的向导小安。用户可能问景点、城市、人物、新闻、常识，什么都可能问。',
    '规则：',
    '1) 先给一句结论，再分点讲清楚，最多 5 条，口语中文，不要 Markdown 标题。',
    '2) 你有自己的知识，就用自己的知识回答，不要因为「资料库里没有」就拒答。',
    '3) 但票价、开放时间、政策、新闻、具体日期与数字这类会变的信息，不确定就写「需要核实」，给范围而不是编一个精确值。',
    '4) 不知道就说不知道，不要编人名、职务、事件细节。',
    '5) 不要提「根据证据」「作为 AI」。',
    '只输出 JSON：{"lead":"一句话结论","answers":[{"title":"小标题","lines":[{"t":"句子"}]}],"missing":["需要核实的点"]}'
  ].join('\n');

  function buildGeneralPrompt(question, g, webBlock) {
    var ev = KB.evidencePrompt(g);
    var user = [
      '【当前上下文】城市：' + (g.cityName || '未确定') + '；景点：' + (g.place ? g.place.n : '未指定'),
      '【用户问题】' + question,
      '【手里有的资料（有就用，没有就想办法用自己的知识回答）】',
      ev.text || '（无）',
      webBlock || ''
    ].join('\n');
    return [
      { role: 'system', content: GENERAL_PROMPT },
      { role: 'user', content: user }
    ];
  }

  // 不需要编号的版本：只要句子不像空话就留下
  function validateGeneralJSON(obj) {
    if (!obj || !obj.answers) return null;
    var blocks = [];
    (obj.answers || []).forEach(function (a) {
      if (!a || !a.lines) return;
      var lines = (a.lines || []).map(function (l) {
        if (!l) return null;
        var t = String(l.t || l.text || '').trim();
        return t ? { text: t, cites: [] } : null;
      }).filter(Boolean);
      if (lines.length) blocks.push({ title: String(a.title || '回答'), lines: lines });
    });
    if (!blocks.length) return null;
    return {
      lead: String(obj.lead || '').trim(),
      blocks: blocks,
      notes: (obj.missing || []).map(function (m) { return { text: String(m) }; })
    };
  }

  function buildPrompt(question, g, webBlock) {    var ev = KB.evidencePrompt(g);    var sys = [
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
    plan: '行程 安排 攻略',
    ticket: '门票 价格', hours: '开放时间', booking: '预约 实名', entrance: '入口 大门 怎么进',
    route: '怎么去 交通', crowd: '人多 排队 限流', safety: '安全 提示 公告', verify: '投诉 举报 电话',
    food: '吃什么 美食', photo: '拍照 机位', intro: '介绍 历史'
  };

  function webQueryFor(parsed, cityName, place) {
    var words = [];
    parsed.intents.forEach(function (it) {
      if (WEB_WORDS[it.id] && words.indexOf(WEB_WORDS[it.id]) < 0) words.push(WEB_WORDS[it.id]);
    });
    // 跟景点/城市都没关系的问法（新闻、人物、常识）：直接把问题本身当检索词
    if (!place && !cityName && parsed.raw) {
      return String(parsed.raw).replace(/^(请问|问一下|帮我看看|帮我|我想问)/, '').trim().slice(0, 60);
    }
    var parts = [place ? place.n : '', cityName || '', words.slice(0, 2).join(' ')];
    var q = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    // 资料库里没有这个景点时，用问题里抓到的专有名词去搜，而不是只搜城市名
    if (!place) {
      var ent = KB.entityOf ? KB.entityOf(parsed.raw || '') : '';
      if (ent && q.indexOf(ent) < 0) q = (ent + ' ' + words.slice(0, 2).join(' ') + ' ' + (cityName || '')).replace(/\s+/g, ' ').trim();
    }
    return q || (cityName || '') + ' 旅游 官方 公告';
  }

  function wantsFresh(parsed) {
    var ids = parsed.intents.map(function (x) { return x.id; });
    if (!ids.length) return true; // 没命中任何旅行意图（新闻、人物、常识）也去联网问一句
    if (/最近|新闻|今天|昨天|发生|事件|涨价|免费|闭馆|维修/.test(String(parsed.raw || ''))) return true;
    return ids.some(function (id) { return ['hours', 'crowd', 'booking', 'ticket', 'safety', 'route'].indexOf(id) >= 0; });
  }

  // 资料库里没有、或者模型给不出可引用证据时的兜底：让它用自己的知识答，
  // 但整篇标成「未核实」，并且把需要核实的点列出来。
  function generalAnswer(question, g, webLines, step) {
    if (!CFG.modelReady()) return Promise.resolve(null);
    if (step) step('compose', '资料不够，改用模型自己的知识回答（会标注未核实）');
    return callModel(buildGeneralPrompt(question, g, webLines), { maxTokens: 760, temperature: 0.35 })
      .then(function (text) {
        var v = validateGeneralJSON(extractJSON(text));
        if (!v) return null;
        v.mode = 'knowledge';
        v.unverified = true;
        v.cites = [];
        v.channels = g.cityName ? KB.channels(g.cityName).slice(0, 3) : KB.channels('全国').slice(0, 3);
        return v;
      })
      .catch(function () { return null; });
  }

  /**
   * 主流程。hooks: {step(name, detail), delta(text)}
   */  function ask(question, hooks) {
    hooks = hooks || {};
    var step = function (name, detail) { if (hooks.step) hooks.step(name, detail); };

    step('understand', '解析城市与意图');
    var parsed = KB.parse(question, state.ctx);
    parsed.raw = question;
    if (parsed.city) state.ctx.city = parsed.city;
    if (parsed.place) state.ctx.place = parsed.place;

    step('local', parsed.place ? '检索「' + parsed.place.n + '」的景点卡' : (parsed.city ? '检索「' + parsed.city.name + '」资料' : '检索内置资料'));
    var g = KB.gather(question, state.ctx);
    g.parsed = parsed;

    state.messages.push({ role: 'user', content: question });

    var webPromise, officialPromise, lastWeb = null;
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
      lastWeb = web;
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
        // 上游 401/429/超时 这些技术细节不该给游客看，换成能看懂的一句话
        var friendly = function (m) {
          var s = String(m || '');
          if (/401|invalid|api key|authentication|unauthorized/i.test(s)) return '站点模型还没接通（Key 未生效）';
          if (/429|太频繁|rate limit/i.test(s)) return '模型这会儿被限流了';
          if (/timeout|超时|aborted|504/i.test(s)) return '模型响应超时';
          return s;
        };
        if (reason) local.modelError = friendly(reason);
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

      // 判断「这条问题是不是超出了内置资料的范围」：问的是资料库里没有的对象，
      // 或者问的是新闻/人物/评价这类非景区问题。超范围就直接用模型自己的知识答，
      // 而不是让它拿着不相关的证据硬凑——那正是用户看到的「答不上来」。
      var ent = KB.entityOf ? KB.entityOf(question) : '';
      var localBlob = (g.all || []).filter(function (f) { return !f.web; })
        .map(function (f) { return (f.title || '') + (f.text || ''); }).join(' ');
      var newsy = /最近|新闻|发生|事件|事情|评价|怎么样|是谁|身价|公司|股价/.test(question);
      var hasEvidence = (g.all || []).some(function (f) { return !!f.text; });
      var thin = !g.place && ((!!ent && localBlob.indexOf(ent) < 0) || newsy || !hasEvidence);

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
      var cited = function () {
        return attempt(messages, 1).then(function (v) {
          if (!v) return generalAnswer(question, g, webLines, step);
          v.mode = 'model';
          v.web = web;
          v.cites = [];
          v.blocks.forEach(function (b) {
            b.lines.forEach(function (l) { v.cites = v.cites.concat(l.cites); });
          });
          v.channels = g.cityName ? KB.channels(g.cityName).slice(0, 4) : KB.channels('全国').slice(0, 3);
          return v;
        });
      };
      var run = thin
        ? generalAnswer(question, g, webLines, step).then(function (v) { return v || cited(); })
        : cited();
      return run.catch(function (e) {
        return fallback('模型调用失败：' + e.message);
      });
    }).then(function (ans) {
      ans.parsed = parsed;
      if (!ans.web) ans.web = lastWeb;
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
