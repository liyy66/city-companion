/* knowledge.js — 证据库与「先说清楚、再给依据」的回答合成器
 *
 * 这个文件替代原来的「百科联网检索」：先解析问题，再只拿相关证据，
 * 每一句都带 cite；拿不到就明确说未收录，并给官方核实入口。
 * 没有大模型时，它就是回答引擎；有大模型时，它是给模型的证据底座。
 */
(function (global) {
  'use strict';

  var INTENTS = [
    // 行程类必须排在最前：否则「重庆两天怎么安排」匹配不到意图，会退化成一串景点罗列
    { id: 'plan', label: '行程与安排', kw: ['安排', '行程', '怎么玩', '怎么逛', '规划', '几天', '几日', '一日游', '两日游', '三日游', '玩几天', '周末去', '怎么安排', '路线怎么'] },
    { id: 'ticket', label: '门票与价格', kw: ['门票', '要票', '买票', '票价', '多少钱', '收费', '免费', '价格', '学生票', '半价', '免票', '优惠', '套票'] },
    { id: 'booking', label: '预约与实名', kw: ['预约', '预订', '抢票', '实名', '名额', '限流', '订票', '提前订'] },
    { id: 'hours', label: '开放时间', kw: ['几点', '开放', '开门', '闭园', '关园', '关门', '营业', '时间', '夜场', '夜间', '开到', '多久', '几点关'] },
    { id: 'entrance', label: '入口与检票', kw: ['入口', '哪个门', '从哪进', '怎么进', '门口', '大门', '进园', '检票', '哪个口', '出站'] },
    { id: 'route', label: '交通与路线', kw: ['怎么去', '怎么走', '交通', '地铁', '公交', '打车', '自驾', '停车', '多远', '路线', '导航', '坐车', '换乘', '步行'] },
    { id: 'crowd', label: '客流与最佳时段', kw: ['人多', '排队', '拥挤', '旺季', '淡季', '最佳时间', '什么时候去', '客流', '挤不挤'] },
    { id: 'safety', label: '安全与避坑', kw: ['安全', '危险', '注意', '骗', '坑', '宰客', '投诉', '报警', '急救', '高原', '天气', '下雨', '汛期'] },
    { id: 'verify', label: '消费核验', kw: ['报价', '跟团', '一日游', '导游', '景交', '讲解费', '额外收费', '购物', '自费', '押金', '加价'] },
    { id: 'food', label: '吃与住', kw: ['吃', '美食', '小吃', '餐厅', '饭', '住', '酒店', '民宿'] },
    { id: 'photo', label: '拍照与机位', kw: ['拍照', '机位', '打卡', '出片', '夜景', '日出', '日落'] },
    { id: 'intro', label: '概况与看点', kw: ['介绍', '是什么', '值得', '好玩', '怎么样', '有什么', '历史', '特色', '看点', '推荐'] }
  ];

  /* 官方与核实渠道：只放确知存在的一级入口，其余用「限定站点的检索」生成，
     避免编造具体页面地址。 */
  var KNOWN_SITES = {
    '重庆': [{ n: '重庆市文化和旅游发展委员会', u: 'https://whlyw.cq.gov.cn/' }],
    '北京': [{ n: '北京市文化和旅游局', u: 'https://whlyj.beijing.gov.cn/' }],
    '上海': [{ n: '上海市文化和旅游局', u: 'https://whlyj.sh.gov.cn/' }],
    '天津': [{ n: '天津市文化和旅游局', u: 'https://whlyj.tj.gov.cn/' }],
    '成都': [{ n: '成都市文化广电旅游局', u: 'https://cdwglj.chengdu.gov.cn/' }],
    '杭州': [{ n: '杭州市文化广电旅游局', u: 'http://wgly.hangzhou.gov.cn/' }],
    '西安': [{ n: '西安市文化和旅游局', u: 'http://wlj.xa.gov.cn/' }],
    '昆明': [{ n: '昆明市文化和旅游局', u: 'https://whlyj.km.gov.cn/' }],
    '南京': [{ n: '南京市文化和旅游局', u: 'https://wlj.nanjing.gov.cn/' }],
    '苏州': [{ n: '苏州市文化广电和旅游局', u: 'https://wglj.suzhou.gov.cn/' }],
    '广州': [{ n: '广州市文化广电旅游局', u: 'https://wglj.gz.gov.cn/' }],
    '武汉': [{ n: '武汉市文化和旅游局', u: 'https://wlj.wuhan.gov.cn/' }],
    '长沙': [{ n: '长沙市文化旅游广电局', u: 'http://wlgd.changsha.gov.cn/' }],
    '青岛': [{ n: '青岛市文化和旅游局', u: 'http://whlyj.qingdao.gov.cn/' }],
    '厦门': [{ n: '厦门市文化和旅游局', u: 'https://wlj.xm.gov.cn/' }],
    '三亚': [{ n: '三亚市旅游和文化广电体育局', u: 'https://wtj.sanya.gov.cn/' }],
    '桂林': [{ n: '桂林市文化广电和旅游局', u: 'https://wglj.guilin.gov.cn/' }],
    '丽江': [{ n: '丽江市文化和旅游局', u: 'https://whlyj.lijiang.gov.cn/' }],
    '大理': [{ n: '大理州文化和旅游局', u: 'https://whlyj.dali.gov.cn/' }],
    '泉州': [{ n: '泉州市文化广电和旅游局', u: 'https://wlj.quanzhou.gov.cn/' }],
    '敦煌': [{ n: '敦煌市文体广电和旅游局', u: 'https://www.dunhuang.gov.cn/' }],
    '都江堰': [{ n: '都江堰市文化体育和旅游局', u: 'https://www.djy.gov.cn/' }],
    '香港': [{ n: '香港旅游发展局', u: 'https://www.discoverhongkong.com/' }],
    '澳门': [{ n: '澳门特别行政区政府旅游局', u: 'https://www.macaotourism.gov.mo/' }]
  };

  var NATIONAL_CHANNELS = [
    { n: '文化和旅游部', u: 'https://www.mct.gov.cn/', kind: '部委官网', d: '政策、假日提示、A 级景区名录' },
    { n: '全国旅游监管服务平台', u: 'https://jianguan.12301.cn/', kind: '监管', d: '查旅行社资质、导游证、电子合同' },
    { n: '12345 政务服务便民热线', u: '', kind: '投诉', d: '价格、强制消费、服务纠纷可直接拨打' },
    { n: '12318 文化市场举报', u: '', kind: '投诉', d: '演出、网吧、艺术品等文化市场问题' }
  ];

  function norm(s) { return DATA.norm(s); }

  function pickIntents(text) {
    var s = norm(text);
    var hits = [];
    INTENTS.forEach(function (it) {
      var n = 0;
      it.kw.forEach(function (k) { if (s.indexOf(norm(k)) >= 0) n++; });
      if (n) hits.push({ id: it.id, label: it.label, score: n });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits;
  }

  function hasFollowUpPronoun(text) {
    var s = norm(text);
    return /那|它|这里|那儿|那儿|这个|那个|还有|再问|换成|换成/.test(s) || s.length <= 4;
  }

  // 从问题里抓一个「像专有名词」的词：引号里的、或者「xx宫/馆/园/山/湖…」这类地名后缀，
  // 或者紧挨着「门票/开放/怎么去/在哪」的那个词。用来在资料库里查不到时仍然能去联网问一句。
  var ENTITY_SUFFIX = '宫|园|馆|寺|山|湖|塔|桥|城|陵|镇|村|街|殿|堂|楼|阁|窟|谷|洞|泉|瀑|海|岛|湾|峰|岭|峡|江|河|林|原|场|广场|中心|博物馆|美术馆|大剧院|公园|景区|古镇|老街|湿地|动物园|植物园';
  var ENTITY_RE = new RegExp('([\\u4e00-\\u9fa5A-Za-z\\u00b7]{2,12}(?:' + ENTITY_SUFFIX + '))');
  var NOISE_TAIL = /^(请问|想问|问一下|帮我|我想|我想问|想知道|那|这个|那个)/;
  function entityOf(text) {
    var s = String(text || '').trim();
    if (!s) return '';
    var q = s.match(/[「『“"《](.+?)[」』”"》]/);
    if (q && q[1] && q[1].length <= 20) return q[1].trim();
    var m = s.match(ENTITY_RE);
    if (m) {
      var cand = m[1].replace(NOISE_TAIL, '');
      if (cand.length >= 2) return cand;
    }
    // 「说说黄仁勋出纳的事情」这类：取「说说/讲讲/介绍一下」后面到句末的 2–12 字
    var v = s.match(/(?:说说|讲讲|介绍一下|聊聊|怎么看|如何评价)([\u4e00-\u9fa5A-Za-z·]{2,12})(?:的|这|那|事情|事|情况|问题|吗|呢|$)/);
    if (v) return v[1];
    return '';
  }

  /** 解析问题：城市 / 景点 / 意图。ctx 为上一轮的上下文 */
  function parse(question, ctx) {
    ctx = ctx || {};
    var q = String(question || '');
    var intents = pickIntents(q);
    var names = DATA.matchNames(q);
    var place = null, placeHit = null;

    for (var i = 0; i < names.length; i++) {
      var e = names[i];
      if (e.type === 'place') {
        var p = DATA.placeById(e.id);
        if (p) { place = p; placeHit = e.key; break; }
      }
    }

    var city = null;
    if (place) city = DATA.resolveCity(place.city) || { name: place.city };
    if (!city) city = DATA.cityInText(q);
    if (!city && ctx.city) city = typeof ctx.city === 'string' ? { name: ctx.city } : ctx.city;

    // 未点名景点时，只要没换城市就沿用上一轮景点（「从哪个门进？」「几点关门？」这类追问都靠它）
    var carried = false;
    var explicitCity = DATA.cityInText(q);
    var sameCity = !explicitCity || !ctx.place || !ctx.place.city ||
      explicitCity.name === ctx.place.city ||
      (DATA.resolveCity(ctx.place.city) || {}).name === explicitCity.name;
    if (!place && ctx.place && sameCity && (hasFollowUpPronoun(q) || !explicitCity)) {
      place = ctx.place; carried = true;
      placeHit = place.n;
    }
    if (!city && place) city = DATA.resolveCity(place.city) || { name: place.city };

    // 问题里点名了一个「库里没有的实体」（凡尔赛宫、黄仁勋……）时，不能沿用上一轮的景点，
    // 否则会把上一轮的城市/景点证据塞进新问题的回答里，出现「你问凡尔赛宫，但资料只涉及重庆翠湖」这种答非所问。
    var entNew = entityOf(q);
    if (entNew && place) {
      var pn = String(place.n || '');
      var sameEnt = pn.indexOf(entNew) >= 0 || entNew.indexOf(pn) >= 0;
      var inLocal = !!(DATA.matchNames(entNew) || []).length;
      if (!sameEnt && !inLocal) {
        place = null; placeHit = ''; carried = false;
        if (explicitCity && city) { /* 保留显式城市 */ } else if (ctx.city) { city = DATA.resolveCity(ctx.city) || null; }
      }
    }

    // 未点名景点，但问题里直接出现了某城市下的景点名（已在 names 里处理）
    var needCity = !city && !place;
    return {
      raw: q, city: city, place: place, placeName: place ? place.n : '',
      placeHit: placeHit, carried: carried, intents: intents,
      intent: intents.length ? intents[0].id : (place ? 'intro' : ''),
      needCity: needCity
    };
  }

  function channels(cityName) {
    var out = [];
    var known = KNOWN_SITES[cityName];
    if (known) known.forEach(function (x) { out.push({ n: x.n, u: x.u, kind: '文旅主管部门', d: '官网公告是票价、开放时间最权威的出处' }); });
    var q1 = encodeURIComponent(cityName + ' 文旅 景区 门票 开放时间');
    out.push({
      n: '限定政府站点的检索', u: 'https://cn.bing.com/search?q=' + encodeURIComponent('site:gov.cn ' + cityName + ' 景区 门票 开放时间'),
      kind: '搜索', d: '只看 .gov.cn 的结果，用来核对官方公告'
    });
    out.push({
      n: '微信公众号文章检索', u: 'https://weixin.sogou.com/weixin?type=2&query=' + encodeURIComponent(cityName + ' 文旅 景区 公告'),
      kind: '公众号', d: '本地文旅号、景区号通常第一时间发公告'
    });
    out.push({
      n: '抖音官方号检索', u: 'https://www.douyin.com/search/' + encodeURIComponent(cityName + ' 文旅'),
      kind: '短视频', d: '看现场实况（人流、天气），但以官方文字为准'
    });
    if (cityName !== '全国') NATIONAL_CHANNELS.forEach(function (x) { out.push(x); });
    return out;
  }

  function cite(t, u, d, extra) {
    return Object.assign({ t: t || '', u: u || '', d: d || '' }, extra || {});
  }

  /** 把某景点的结构化事实摊平，key 对齐 intent */
  function factsOfPlace(place) {
    var out = [];
    if (!place) return out;

    if (place.desc) {
      out.push({
        id: 'desc', intent: 'intro', title: '景点概况',
        text: place.desc,
        cite: place.src && place.src[0] ? cite(place.src[0].t, place.src[0].u, '') : cite('内置景点卡（编辑整理）', '', ''),
        weight: 1
      });
    }
    if (place.hl && place.hl.length) {
      out.push({
        id: 'hl', intent: 'intro', title: '看点', text: place.hl.join('、'),
        cite: cite('内置景点卡（编辑整理）', '', ''), weight: 1
      });
    }
    if (place.price) {
      out.push({
        id: 'price', intent: 'ticket', title: '票价',
        text: place.price.t,
        cite: cite(place.price.s ? '票价出处' : '内置景点卡', place.price.s, place.price.d),
        weight: 3
      });
    }
    if (place.hours) {
      var h = place.hours;
      out.push({
        id: 'hours', intent: 'hours', title: '开放时间',
        text: typeof h === 'string' ? h : h.t,
        cite: cite('开放时间出处', (h && h.s) || '', (h && h.d) || ''),
        weight: 3
      });
    }
    if (place.crowd) {
      out.push({
        id: 'crowd', intent: 'crowd', title: '客流提示',
        text: place.crowd.t,
        cite: cite('客流提示出处', place.crowd.s, place.crowd.d), weight: 2
      });
    }
    // 旅游指南里的分项事实（ticket / hours / entrance / 其他）
    var f = place.facts || {};
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      if (!v || !v.a) return;
      var imap = { ticket: 'ticket', hours: 'hours', entrance: 'entrance', booking: 'booking', route: 'route', crowd: 'crowd', safety: 'safety' };
      out.push({
        id: 'fact-' + k, intent: imap[k] || 'intro', title: (f[k].title || {
          ticket: '票价（官方说明）', hours: '开放时间（官方说明）', entrance: '入口与到达（官方说明）'
        }[k] || k),
        text: v.a, cite: cite(v.t || '官方转载', v.u, v.d), weight: 4
      });
    });
    (place.src || []).forEach(function (s, i) {
      out.push({
        id: 'src-' + i, intent: 'src', title: '出处：' + (s.t || '来源'),
        text: '', cite: cite(s.t, s.u, ''), weight: 0
      });
    });
    return out;
  }

  function refFacts(cityName) {
    return DATA.refsFor(cityName).map(function (r) {
      return {
        id: 'ref-' + r.id, intent: 'safety-ref', title: r.t,
        text: r.s || '', cite: cite(r.kind || '官方资料', r.u, r.d),
        topics: r.topics || [], weight: 2
      };
    });
  }

  function officialFacts(cityName) {
    return channels(cityName).filter(function (c) { return c.u; }).map(function (c, i) {
      return {
        id: 'ch-' + i, intent: 'channel', title: c.n + '（' + c.kind + '）',
        text: c.d, cite: cite(c.n, c.u, ''), weight: 0
      };
    });
  }

  /** 依据 context 收集证据；返回 {evidence, gaps, cityName} */
  function gather(question, ctx) {
    var parsed = parse(question, ctx);
    var cityName = parsed.city ? parsed.city.name : '';
    var place = parsed.place;
    var all = [], gaps = [];

    if (place) all = all.concat(factsOfPlace(place));
    if (cityName) {
      all = all.concat(refFacts(cityName));
      if (!place) {
        // 城市级：列出该城可查的景点
        var list = DATA.placesFor(cityName);
        if (list.length) {
          all.push({
            id: 'city-list', intent: 'intro', title: cityName + ' 已收录的景点',
            text: list.slice(0, 12).map(function (p) { return p.n; }).join('、'),
            cite: cite('内置景点库', '', ''), weight: 2
          });
        }
      }
    }

    var intentIds = parsed.intents.map(function (x) { return x.id; });
    var relevant = all.filter(function (f) {
      if (f.intent === 'src' || f.intent === 'channel') return false;
      if (!intentIds.length) return f.weight > 0 && (f.intent === 'intro');
      return intentIds.indexOf(f.intent) >= 0 || f.intent === 'safety-ref';
    });

    // 需要的证据缺失 → 记 gap
    intentIds.forEach(function (id) {
      var have = all.some(function (f) { return f.intent === id && f.text; });
      if (!have) gaps.push({ intent: id, place: place ? place.n : '', city: cityName });
    });

    return {
      parsed: parsed, cityName: cityName, place: place,
      evidence: relevant, extraSources: all.filter(function (f) { return f.intent === 'src' || f.intent === 'channel'; }),
      gaps: gaps, all: all
    };
  }

  var INTENT_ANSWER_TITLE = {
    plan: '行程与安排',
    ticket: '门票与价格', booking: '预约要求', hours: '开放时间', entrance: '从哪个门进',
    route: '怎么过去', crowd: '人多不多', safety: '安全与避坑', verify: '消费核验',
    food: '吃住', photo: '拍照机位', intro: '概况与看点'
  };

  function dedupeCites(list) {
    var seen = {}, out = [];
    list.forEach(function (c) {
      var k = (c.t || '') + '|' + (c.u || '');
      if (seen[k]) return;
      seen[k] = 1;
      out.push(c);
    });
    return out;
  }

  /** 无模型时的回答 */
  function composeLocal(g) {
    var p = g.parsed, place = g.place, cityName = g.cityName;
    var intentIds = p.intents.map(function (x) { return x.id; });
    if (!intentIds.length) intentIds = place ? ['intro'] : [];

    var lead = '';

    var blocks = [];
    intentIds.forEach(function (id) {
      if (id === 'route' && place) {
        var routeLines = g.evidence.filter(function (f) { return f.intent === 'entrance' || f.intent === 'route'; });
        if (!routeLines.length) {
          blocks.push({
            title: '怎么过去', lines: [],
            note: '内置资料没有这个景点的交通与入口细节。用「高德地图」按钮可以直接看实时路线；或在高德里搜景点名，看官方出入口标注。'
          });
          return;
        }
      }
      var lines = g.evidence.filter(function (f) { return f.intent === id; });
      if (!lines.length) return;
      blocks.push({
        title: INTENT_ANSWER_TITLE[id] || id,
        lines: lines.map(function (f) { return { text: f.text, cites: [f.cite], kind: f.id }; })
      });
    });

    // 行程类问题：按已收录景点和片区排两天，并明确「开放/预约/交通没收录」，不要回一串景点名
    if (intentIds.indexOf('plan') >= 0 && cityName) {
      var planCards = DATA.placesFor(cityName).filter(function (x) { return x.kind !== 'county'; }).slice(0, 9);
      if (planCards.length >= 2) {
        var areaMap = {};
        planCards.forEach(function (c) {
          var k = c.d || '城区';
          (areaMap[k] = areaMap[k] || []).push(c);
        });
        var areas = Object.keys(areaMap);
        var half = Math.max(1, Math.ceil(areas.length / 2));
        var day1 = areas.slice(0, half).reduce(function (a, k) { return a.concat(areaMap[k]); }, []);
        var day2 = areas.slice(half).reduce(function (a, k) { return a.concat(areaMap[k]); }, []);
        var names = function (arr) { return arr.map(function (c) { return c.n; }).join('、'); };
        if (!day2.length) {
          // 精选卡少于 3 张时，第二天用「周边点位」补：地图上已经标出来了，比硬编景点诚实
          day2 = [{ n: '周边点位（地图右侧「加载更多周边点位」，或按片区在高德里搜）' }];
        }
        blocks.push({
          title: '两天可以这样排',
          lines: [
            { text: '第一天：' + names(day1) + '。', cites: [], kind: 'plan' },
            {
              text: '第二天：' + (day2.length ? names(day2) : '从剩下的景点里再挑两三处，或去周边区县走一趟') + '。',
              cites: [], kind: 'plan'
            }
          ],
          note: '这只是按已收录景点和片区做的组合，不含实时开放时间、预约、交通与客流——出发前用下面的核实入口确认。'
        });
      }
    }

    // 概况型问题额外给出处
    var sources = dedupeCites(g.evidence.map(function (f) { return f.cite; }).filter(function (c) { return c.u; }));

    // 问的意图没有直接证据时，至少把「能确认的相关信息」摆出来，而不是只留一句「没收录」
    if (!blocks.length) {
      var related = g.evidence.filter(function (f) {
        return f.text && ['intro', 'ticket', 'hours', 'entrance', 'crowd'].indexOf(f.intent) >= 0;
      }).slice(0, 4);
      if (related.length) {
        blocks.push({
          title: place ? '关于「' + place.n + '」目前能确认的信息' : '关于「' + cityName + '」目前能确认的信息',
          lines: related.map(function (f) { return { text: f.text, cites: [f.cite], kind: f.id }; })
        });
      }
    }

    // 结论先行：把第一块里最像结论的一句提上来，避免「你问的是…」与小标题重复
    var leadFromEvidence = false;
    var LEAD_PREFIX = { hl: '主要看点是：', 'city-list': '这座城市收录的景点有：' };
    if (blocks.length && blocks[0].lines && blocks[0].lines.length) {
      var pick = 0;
      for (var bi = 0; bi < blocks[0].lines.length; bi++) {
        var ln = blocks[0].lines[bi] || {};
        if (ln.kind === 'desc' || String(ln.text || '').length >= 24) { pick = bi; break; }
      }
      var chosen = blocks[0].lines[pick];
      lead = (LEAD_PREFIX[chosen.kind] || '') + chosen.text;
      leadFromEvidence = true;
      if (blocks[0].lines.length > 1) {
        // 还有别的句子：把提上来那句从列表里去掉，避免同一句话出现两遍
        blocks[0].lines.splice(pick, 1);
      } else {
        // 只有这一句：保留它作为「原文摘录」，让回答不至于只剩一个结论
        blocks[0].lines[pick] = { text: '原文：' + chosen.text, cites: chosen.cites, kind: 'quote' };
      }
    }
    if (!lead) {
      var labels = intentIds.map(function (id) { return INTENT_ANSWER_TITLE[id] || id; });
      var what = labels.length ? labels.join('、') : '这条问题';
      lead = (place ? '「' + place.n + '」的' + what : (cityName ? '「' + cityName + '」的' + what : what)) +
        '，内置资料里没有可引用的原文。不编，直接给核实入口。';
    }

    var gapNotes = [];
    if (p.needCity) {
      gapNotes.push({ text: '还没判断出你说的是哪座城市或哪个景点。可以补一句城市名，或直接从左边城市目录里点一个。' });
    }
    if (g.gaps.length && place && leadFromEvidence) {
      var missingLabels = g.gaps.map(function (x) { return INTENT_ANSWER_TITLE[x.intent] || x.intent; });
      gapNotes.push({
        text: '内置资料里没有「' + place.n + '」的' + missingLabels.join('、') + '信息，我不想凭印象编一个。下面给了官方核实入口。'
      });
    }
    if (!place && cityName && !g.gaps.length && !intentIds.length) {
      gapNotes.push({ text: '这个问题还差一个具体景点名。比如「' + cityName + '的某景区门票多少」。' });
    }

    var ch = cityName ? channels(cityName).slice(0, 4) : channels('全国').slice(0, 3);

    return {
      lead: lead, blocks: blocks, notes: gapNotes, channels: ch,
      cites: sources, mode: 'local'
    };
  }

  /** 消费核验计算 */
  function fee(input) {
    var people = Math.max(1, +input.people || 1);
    var quote = Math.max(0, +input.quote || 0);
    var extras = 0, extraItems = [];
    String(input.must || '').replace(/([^\d，,、;；+]*?)(\d+(?:\.\d+)?)/g, function (m, name, num) {
      extras += +num;
      extraItems.push({ name: (name || '').replace(/[，,、;；+\s]+/g, ' ').trim() || '附加项', amount: +num });
      return m;
    });
    var perPerson = quote + extras;
    var total = perPerson * people;

    var flags = [];
    if (!quote) flags.push({ lv: 'info', t: '先填报价', d: '把对方给的每人价格填进去，才能判断贵不贵。' });
    if (quote && extras / quote > 0.3) flags.push({ lv: 'warn', t: '附加费占比过高', d: '必付附加已超过报价的 30%，属于典型的「低价引流、现场加价」，签合同前要求写清总价。' });
    if (input.optional) flags.push({ lv: 'warn', t: '含可选项目', d: '《旅游法》第三十五条禁止指定具体购物场所、不得安排另行付费项目；自愿参加的项目必须单独签补充协议。' });
    if (!input.invoice) flags.push({ lv: 'warn', t: '没有正规发票', d: '没有发票或电子合同，事后维权几乎没有凭证。正规旅行社必须开具发票并签电子合同。' });
    if (!input.agency) flags.push({ lv: 'bad', t: '查不到经营许可证', d: '在「全国旅游监管服务平台」用名称或许可证号查一下，查不到就不是合法旅行社。' });
    if (quote && perPerson < 80) flags.push({ lv: 'warn', t: '价格明显偏低', d: '低于一日游的基本成本，通常靠购物返点或自费项目补回，谨慎。' });

    return {
      people: people, quote: quote, extras: extras, extraItems: extraItems,
      perPerson: perPerson, total: total, flags: flags,
      channels: NATIONAL_CHANNELS
    };
  }

  /** 给大模型用的证据文本 */
  function evidencePrompt(g) {
    var lines = [];
    var n = 0;
    g.all.forEach(function (f) {
      if (!f.text) return;
      n++;
      lines.push('[' + n + '] ' + f.title + '：' + f.text +
        '（来源：' + (f.cite.t || '未标注') + (f.cite.u ? ' ' + f.cite.u : '') + (f.cite.d ? ' 更新于 ' + f.cite.d : '') + '）');
      f._n = n;
    });
    return { text: lines.join('\n'), count: n };
  }

  global.KB = {
    INTENTS: INTENTS, parse: parse, gather: gather, composeLocal: composeLocal,
    channels: channels, fee: fee, evidencePrompt: evidencePrompt,
    factsOfPlace: factsOfPlace, refFacts: refFacts,
    nationalChannels: NATIONAL_CHANNELS, intentTitle: INTENT_ANSWER_TITLE, entityOf: entityOf
  };
})(window);
