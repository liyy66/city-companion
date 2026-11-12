/* ui.js — 视图层：城市浏览、景点面板、地图联动、对话渲染、消费核验、设置 */
(function (global) {
  'use strict';

  var $ = U.$, $$ = U.$$;
  var state = {
    city: null,
    places: [],
    filter: '',
    poiShown: 0,
    pois: [],
    chatBusy: false,
    lastAnswer: null,
    cityPage: 0,
    photoContext: null,
    webHintShown: false,
    offHintShown: false
  };

  /* ---------------- 入场 ---------------- */

  function bindReveal() {
    var nodes = $$('.reveal');
    if (!nodes.length) return;
    var show = function (n) { n.classList.add('in'); };
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(show);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          show(e.target);
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.03 });
    nodes.forEach(function (n) { io.observe(n); });
    // 兜底：任何情况下 1.6 秒后都必须可见，动画只是装饰，不能挡住内容
    setTimeout(function () { nodes.forEach(show); }, 1600);
  }

  /* ---------------- 主题 ---------------- */

  function systemDark() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(mode) {
    var v = mode || CFG.get().theme || 'auto';
    var dark = v === 'dark' || (v === 'auto' && systemDark());
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var btn = $('#btnTheme');
    if (btn) btn.innerHTML = '<svg><use href="#' + (dark ? 'i-sun' : 'i-moon') + '"/></svg>';
    $$('[data-theme-set]').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-theme-set') === v);
    });
    if (global.HERO && global.HERO.refreshTheme) global.HERO.refreshTheme();
  }

  /* ---------------- 顶部状态 ---------------- */

  function setPill(node, text, kind) {
    if (!node) return;
    var span = node.querySelector('span');
    if (span) span.textContent = text;
    node.classList.remove('ok', 'warn', 'bad');
    if (kind) node.classList.add(kind);
  }

  function refreshPills() {
    var st = DATA.stats();
    setPill($('#pillData'), U.fmtNum(st.cities) + ' 城 · ' + U.fmtNum(st.pois) + ' 点', 'ok');

    NET.probeTile().then(function (r) {
      setPill($('#pillMap'), r.ok ? '高德底图在线' : '底图不可达', r.ok ? 'ok' : 'bad');
      var st2 = $('#mapStatus');
      if (st2) {
        st2.className = 'map-status' + (r.ok ? ' ok' : ' bad');
        st2.querySelector('span').textContent = r.ok
          ? '高德实时底图 · GCJ-02 已校准'
          : '底图不可达：请检查网络。仍可查看已缓存的边界与点位。';
        setTimeout(function () { if (st2) st2.classList.add('fade'); }, 3600);
      }
    });

    // 有后端（线上 Functions / 本地 server.mjs）时先别急着写「未配置」：
    // /api/health 马上会说站点有没有自带模型，这句只作为一两百毫秒的占位。
    var sitePending = !CFG.modelReady() && !!CFG.proxyBase();
    setPill($('#pillModel'),
      CFG.modelReady() ? (CFG.get().model || '模型已配置') : (sitePending ? '检测站点模型…' : '模型未配置'),
      CFG.modelReady() ? 'ok' : (sitePending ? '' : 'warn'));
    setPill($('#pillMode'), CFG.modelReady() ? CFG.get().model : '证据引擎', CFG.modelReady() ? 'ok' : '');

    // 站点能力（线上 Functions / 本地 server.mjs）：有内置模型时访客什么都不用配
    NET.health().then(function (h) {
      state.remote = h;
      var caps = (h && h.capabilities) || {};
      CFG.setSiteModel(caps.chat ? (caps.model || '站点默认模型') : '');
      if (caps.chat) {
        setPill($('#pillModel'), '站点模型 · ' + (caps.model || '已开通'), 'ok');
        setPill($('#pillMode'), caps.model || '模型 + 证据', 'ok');
      }
      var footer = $('#footerStatus');
      if (!footer) return;
      var search = caps.search === 'bocha' ? '博查 API'
        : caps.search === 'tavily' ? 'Tavily API'
          : caps.search === 'html' ? 'HTML 检索（可能遇验证码）'
            : (CFG.get().searchKey ? '搜索 API' : '未开启联网');
      var model = CFG.get().model
        || (caps.chat ? (caps.model || '站点内置') + '（站点提供）' : '')
        || '未配置（用内置证据引擎）';
      footer.textContent = '底图：高德瓦片 · 边界：DataV · 检索：' + search + ' · 模型：' + model;
    });

    var bs = $('#buildStamp');
    if (bs) bs.textContent = CFG.build();
  }

  function animateCounters() {
    var st = DATA.stats();
    var map = { statCities: st.cities, statPois: st.pois, statCards: st.curated, statPhotos: st.photos };
    Object.keys(map).forEach(function (id) {
      var node = $('#' + id);
      if (!node) return;
      var target = map[id], from = 0, t0 = performance.now();
      var tick = function (t) {
        var k = Math.min(1, (t - t0) / 900);
        var v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
        node.textContent = v.toLocaleString('zh-CN');
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---------------- 城市 ---------------- */

  function renderHotCities() {
    var box = $('#hotCities');
    if (!box) return;
    var names = ['重庆', '昆明', '北京', '上海', '成都', '杭州', '西安'];
    box.innerHTML = '';
    names.forEach(function (n) {
      var c = DATA.resolveCity(n);
      if (!c) return;
      var b = U.el('button', { class: 'chip', type: 'button', text: n });
      b.addEventListener('click', function () { setCity(c, { fromUser: true }); });
      box.appendChild(b);
    });
  }

  function renderCityList() {
    var box = $('#cityList');
    if (!box) return;
    box.innerHTML = '';
    var dests = DATA.destinations();
    var cur = state.city;
    var list = dests.slice();
    if (cur && !list.some(function (c) { return c.name === cur.name; })) list.unshift(cur);
    list.forEach(function (c) {
      var item = U.el('button', {
        class: 'city-item' + (cur && cur.name === c.name ? ' is-on' : ''),
        type: 'button', dataset: { city: c.name }
      }, [
        U.el('span', { class: 'nm', text: c.name }),
        U.el('span', { class: 'pv', text: c.province || '' })
      ]);
      item.addEventListener('click', function () { setCity(c, { fromUser: true }); });
      box.appendChild(item);
    });
    if (!list.length) box.appendChild(U.el('div', { class: 'empty', text: '没有匹配的城市' }));
  }

  function markCityActive() {
    $$('#cityList .city-item').forEach(function (el) {
      el.classList.toggle('is-on', el.dataset.city === (state.city && state.city.name));
    });
  }

  function cityLevelLabel(c) {
    if (!c) return '';
    if (c.level === 'destination') return '目的地';
    if (c.level === 'city') return '城市';
    return '区县';
  }

  function setCity(city, opts) {
    opts = opts || {};
    if (!city) return Promise.resolve(null);
    state.city = city;
    state.filter = '';
    state.poiShown = 0;
    AI.setCity(city);

    var title = $('#mapCityName');
    if (title) title.textContent = city.name;
    var badge = $('#mapCityBadge');
    if (badge) badge.textContent = cityLevelLabel(city);
    var meta = $('#mapCityMeta');
    if (meta) meta.textContent = (city.province || '') + ' · ' + city.lat.toFixed(3) + '°N ' + city.lng.toFixed(3) + '°E · 正在读取边界';

    var heroCity = $('#heroCity');
    if (heroCity) heroCity.textContent = city.name;
    global.__heroCity = city.name;
    var heroCoord = $('#heroCoord');
    if (heroCoord) heroCoord.textContent = city.lat.toFixed(2) + '°N · ' + city.lng.toFixed(2) + '°E';
    if (global.HERO) global.HERO.setCity(city.name, city.lat * 1000 + city.lng);

    var ctx = $('#composerCtx');
    if (ctx) ctx.textContent = '城市：' + city.name + (CFG.modelReady() ? ' · ' + CFG.get().model : ' · 证据引擎');

    markCityActive();
    renderPlaces(city);
    renderOfficial(city);
    renderQuick();
    updateAmapButton(city);
    renderEvidence([]);

    return MAP.showCity(city).then(function (r) {
      if (!r) return r;
      if (meta) {
        var btxt = r.boundary === 'official' ? ' · 行政边界已加载'
          : (r.boundary === 'approx' ? ' · 暂无官方边界，显示范围示意' : ' · 边界数据不可用');
        meta.textContent = (city.province || '') + ' · ' + city.lat.toFixed(3) + '°N ' + city.lng.toFixed(3) + '°E' + btxt;
      }
      if (!opts.silent) U.toast('已切换到 ' + city.name + '：底图、边界与点位已更新');
      return r;
    });
  }

  function updateAmapButton(city) {
    var a = $('#btnOpenAmap');
    if (a) {
      a.href = GEO.amapURI('search', { name: city.name + ' 景点', city: city.name });
      a.textContent = '';
      a.appendChild(U.el('span', { html: '<svg><use href="#i-link"/></svg>' }));
      a.appendChild(document.createTextNode('在高德中看' + city.name));
    }
  }

  /* ---------------- 景点列表 ---------------- */

  function renderPlaces(city) {
    var list = DATA.placesFor(city.name);
    state.places = list;
    var title = $('#placeColTitle');
    if (title) title.textContent = city.name + ' 的景点';
    var count = $('#placeColCount');
    if (count) count.textContent = list.length ? list.length + ' 个已收录' : '暂无精选';

    renderCatFilter(list);
    renderPlaceList();
  }

  function renderCatFilter(list) {
    var box = $('#catFilter');
    if (!box) return;
    box.innerHTML = '';
    var cats = {};
    list.forEach(function (p) { if (p.cat) cats[p.cat] = (cats[p.cat] || 0) + 1; });
    var keys = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 6);
    var mk = function (label, val) {
      var b = U.el('button', {
        class: 'chip' + (state.filter === val ? ' is-on' : ''), type: 'button', text: label
      });
      b.addEventListener('click', function () {
        state.filter = val;
        renderCatFilter(list);
        renderPlaceList();
      });
      return b;
    };
    if (keys.length > 1) box.appendChild(mk('全部', ''));
    keys.forEach(function (k) { box.appendChild(mk(k, k)); });
  }

  function placedLine(p) {
    if (p.approx) return '位置为县域近似中心';
    if (p.d) return p.d;
    return p.cat || '';
  }

  function renderPlaceList() {
    var box = $('#placeList');
    if (!box) return;
    box.innerHTML = '';
    var list = state.places.filter(function (p) { return !state.filter || p.cat === state.filter; });
    if (!list.length) {
      var c = state.city || {};
      var pois = c.lat ? DATA.nearbyPois(c.lat, c.lng, c.level === 'destination' ? 9000 : 14000, 200).length : 0;
      var wrap = U.el('div', { class: 'empty-state' }, [
        U.el('b', { text: (c.name || '这座城市') + ' 还没有精选景点卡' }),
        U.el('p', {
          text: '地图照样能用：高德实时底图' + (c.adcode ? ' + 行政边界' : ' + 范围示意圈') +
            '，地图上已经标出 ' + pois + ' 个周边点位。想看这座城的景点，可以直接问小安，或者用下方按钮跳高德检索。'
        })
      ]);
      var a1 = U.el('a', {
        class: 'btn btn-ghost btn-sm', target: '_blank', rel: 'noopener noreferrer',
        href: GEO.amapURI('search', { name: (c.name || '') + ' 景点', city: c.name || '' })
      });
      a1.textContent = '在高德看' + (c.name || '') + '景点';
      var b2 = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button' });
      b2.textContent = '问小安怎么玩';
      b2.addEventListener('click', function () {
        sendQuestion((c.name || '') + '有什么值得去的景点？');
      });
      wrap.appendChild(U.el('div', { class: 'empty-actions' }, [a1, b2]));
      box.appendChild(wrap);
    }
    list.slice(0, 40).forEach(function (p) {
      var item = U.el('button', { class: 'place-item', type: 'button', dataset: { id: p.id } }, [
        U.el('span', { class: 'p-cat', text: p.cat || '景点' }),
        U.el('span', { class: 'p-name', text: p.n }),
        U.el('span', { class: 'p-desc', text: U.cut(p.desc || p.hl && p.hl.join('、') || '', 46) }),
        U.el('span', { class: 'p-meta', text: placedLine(p) + (p.price ? ' · 票价有据' : '') })
      ]);
      item.addEventListener('click', function () { openDetail(p); });
      box.appendChild(item);
    });

    // 周边点位
    if (state.city) {
      var pois = DATA.nearbyPois(state.city.lat, state.city.lng, state.city.level === 'destination' ? 9000 : 14000, 200);
      state.pois = pois;
      var show = Math.max(0, state.poiShown);
      if (show > 0) {
        box.appendChild(U.el('div', { class: 'list-sep', text: '周边可去（OpenStreetMap）' }));
        pois.slice(0, show).forEach(function (p) {
          box.appendChild(U.el('div', { class: 'poi-item' }, [
            U.el('b', { text: p.name }),
            U.el('span', { text: p.cat + ' · ' + U.fmtDist(p.dist) })
          ]));
        });
      }
      var more = $('#btnMorePlace');
      if (more) {
        var remain = Math.max(0, pois.length - show);
        more.textContent = remain ? '加载更多周边点位（还有 ' + remain + ' 个）' : (pois.length ? '已显示全部周边点位' : '本区域暂无周边点位');
        more.disabled = !remain;
      }
    }
  }

  /* ---------------- 景点详情 ---------------- */

  var detailPlace = null;

  function openDetail(place) {
    detailPlace = place;
    var dlg = $('#detailDialog');
    if (!dlg) return;
    $('#detailCity').textContent = (place.city || '') + (place.d ? ' · ' + place.d : '');
    $('#detailTitle').textContent = place.n;
    $('#detailSub').textContent = place.cat || '';

    var gal = $('#detailGallery');
    gal.innerHTML = '';
    var photos = DATA.photosFor(place);
    if (photos.length) {
      photos.slice(0, 6).forEach(function (ph, i) {
        var img = U.el('img', {
          src: DATA.photoSrc(ph.f), alt: ph.t || place.n, loading: 'lazy',
          class: 'thumb' + (i === 0 ? ' wide' : '')
        });
        img.addEventListener('click', function () { openPhoto(photos, i); });
        gal.appendChild(img);
      });
      $('#detailPhotoNote').textContent = '实拍来自 Wikimedia Commons，' + photos.length + ' 张；许可见各图说明。';
    } else {
      gal.appendChild(U.el('div', { class: 'photo-empty' }, [
        U.el('b', { text: '暂无实拍' }),
        U.el('p', { text: '这张景点卡没有配授权实拍。图片只放可溯源的，不放来源不明的网图。' })
      ]));
      $('#detailPhotoNote').textContent = '';
    }

    var facts = $('#detailFacts');
    facts.innerHTML = '';
    var add = function (k, v, cite) {
      if (!v) return;
      var dd = U.el('dd', { text: v });
      if (cite && cite.u) {
        dd.appendChild(U.el('a', {
          class: 'src-inline', href: cite.u, target: '_blank', rel: 'noopener noreferrer',
          text: (cite.t ? U.cut(cite.t, 14) : '出处') + (cite.d ? ' · ' + U.fmtDate(cite.d) : '')
        }));
      }
      facts.appendChild(U.el('dt', { text: k }));
      facts.appendChild(dd);
    };
    add('所在', (place.province || '') + (place.city || '') + (place.d ? ' · ' + place.d : ''));
    add('类型', place.cat);
    if (place.price) add('票价', place.price.t, { t: '票价出处', u: place.price.s, d: place.price.d });
    if (place.hours) add('开放时间', typeof place.hours === 'string' ? place.hours : place.hours.t,
      { t: '时间出处', u: (place.hours && place.hours.s) || '', d: (place.hours && place.hours.d) || '' });
    if (place.crowd) add('客流', place.crowd.t, { t: '客流出处', u: place.crowd.s, d: place.crowd.d });
    if (place.hl && place.hl.length) add('看点', place.hl.join('、'));
    if (place.approx) add('坐标精度', '未收录精确坐标，地图位置按县域中心近似展示');
    if (place.lat != null) add('坐标（WGS-84）', place.lat.toFixed(5) + ', ' + place.lng.toFixed(5));

    // 官方事实（旅游指南）
    if (place.facts) {
      Object.keys(place.facts).forEach(function (k) {
        var f = place.facts[k];
        if (!f || !f.a) return;
        add(({ ticket: '票价（官方）', hours: '时间（官方）', entrance: '入口（官方）' }[k] || k), f.a, { t: f.t, u: f.u, d: f.d });
      });
    }

    var src = $('#detailSources');
    src.innerHTML = '';
    var all = (place.src || []).slice();
    if (place.facts) Object.keys(place.facts).forEach(function (k) {
      var f = place.facts[k];
      if (f && f.u) all.push({ t: f.t, u: f.u });
    });
    var seen = {};
    all = all.filter(function (s) { return s.u && !seen[s.u] && (seen[s.u] = 1); });
    if (!all.length) {
      src.appendChild(U.el('p', { class: 'muted-xs', text: '这张卡没有可点击的出处，内容属于编辑整理，请以现场公告为准。' }));
    }
    all.forEach(function (s) {
      src.appendChild(U.el('a', {
        class: 'src-row', href: s.u, target: '_blank', rel: 'noopener noreferrer'
      }, [
        U.el('span', { class: 'host', text: U.hostLabel(s.u) }),
        U.el('span', { class: 'ttl', text: U.cut(s.t || s.u, 42) }),
        U.el('span', { class: 'arrow', text: '↗' })
      ]));
    });

    var amap = $('#detailAmap');
    amap.href = place.lat != null ? GEO.amapURI('marker', { name: place.n, lat: place.lat, lng: place.lng, city: place.city }) :
      GEO.amapURI('search', { name: place.n, city: place.city });
    var baidu = $('#detailBaidu');
    baidu.href = place.lat != null ? GEO.baiduURI({ name: place.n, lat: place.lat, lng: place.lng, desc: place.city + ' ' + place.n }) :
      'https://map.baidu.com/search/' + encodeURIComponent(place.n);

    if (place.lat != null) MAP.focusPlace(place, 15);
    openDialog(dlg);
  }

  function askAbout(place) {
    var q = place.n + ' 要门票吗？开放时间和入口是怎样的？';
    closeDialog($('#detailDialog'));
    setCity(DATA.resolveCity(place.city) || state.city, { silent: true }).then(function () {
      var input = $('#askInput');
      if (input) input.value = q;
      sendQuestion(q);
      var sec = $('#assistant');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- 照片 ---------------- */

  function openPhoto(list, index) {
    state.photoContext = { list: list, index: index };
    renderPhoto();
    openDialog($('#photoDialog'));
  }

  function renderPhoto() {
    var c = state.photoContext;
    if (!c) return;
    var ph = c.list[c.index];
    var img = $('#photoLarge');
    img.src = DATA.photoSrc(ph.f);
    img.alt = ph.t || '';
    $('#photoTitle').textContent = ph.t || '实拍';
    $('#photoCredit').textContent = [ph.a ? '摄影 ' + ph.a : '', ph.lic || ''].filter(Boolean).join(' · ') || '来源未标注';
    var src = $('#photoSource');
    src.href = ph.u || '#';
    src.style.display = ph.u ? '' : 'none';
    var nav = $('#photoNav');
    nav.innerHTML = '';
    c.list.slice(0, 8).forEach(function (p, i) {
      var img2 = U.el('img', { src: DATA.photoSrc(p.f), alt: p.t || '', class: 'nav-thumb' + (i === c.index ? ' is-on' : '') });
      img2.addEventListener('click', function () { c.index = i; renderPhoto(); });
      nav.appendChild(img2);
    });
  }

  /* ---------------- 对话 ---------------- */

  function scrollChat() {
    var log = $('#chatLog');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function bubble(role, html) {
    var log = $('#chatLog');
    if (!log) return null;
    var node = U.el('div', { class: 'msg ' + role, html: html });
    log.appendChild(node);
    scrollChat();
    return node;
  }

  function renderQuick() {
    var box = $('#quickRow');
    if (!box) return;
    box.innerHTML = '';
    var city = state.city ? state.city.name : '';
    var place = AI.state.ctx.place;
    var qs = [];
    if (place) {
      qs.push(place.n + ' 要门票吗？');
      qs.push(place.n + ' 从哪个门进？');
      qs.push(place.n + ' 几点开门？');
      qs.push(place.n + ' 人多吗，什么时候去好？');
    } else if (city) {
      qs.push(city + ' 有哪些值得去的地方？');
      qs.push(city + ' 两天怎么安排？');
      qs.push(city + ' 有什么要当心的地方？');
    }
    if (!qs.length) qs.push('第一次去重庆，怎么安排两天？');
    qs.slice(0, 4).forEach(function (q) {
      var b = U.el('button', { class: 'chip', type: 'button', text: q });
      b.addEventListener('click', function () { sendQuestion(q); });
      box.appendChild(b);
    });
  }

  function setChain(step, done) {
    $$('#chain .chain-step').forEach(function (el) {
      var s = el.dataset.step;
      el.classList.toggle('is-on', s === step);
      if (done && s === step) { el.classList.remove('is-on'); el.classList.add('is-done'); }
      if (s === step && !done) el.classList.remove('is-done');
    });
  }

  function resetChain() {
    $$('#chain .chain-step').forEach(function (el) { el.classList.remove('is-on', 'is-done'); });
  }

  function citeRenderer() {
    var map = [];
    var find = function (c) {
      var k = (c.t || '') + '|' + (c.u || '');
      for (var i = 0; i < map.length; i++) if (map[i].k === k) return i + 1;
      map.push({ k: k, c: c });
      return map.length;
    };
    return {
      chip: function (c) {
        if (!c || !c.u) return c && c.t ? '<span class="cite-plain">' + U.esc(c.t) + '</span>' : '';
        var n = find(c);
        return '<a class="cite" href="' + U.esc(c.u) + '" target="_blank" rel="noopener noreferrer" title="' +
          U.esc((c.t || '') + (c.d ? ' · ' + c.d : '')) + '">' + n + '</a>';
      },
      list: function () { return map; }
    };
  }

  function answerHTML(ans) {
    var cr = citeRenderer();
    var h = [];
    var parsed = ans.parsed || {};
    var chips = [];
    if (ans.city) chips.push('城市 · ' + ans.city.name);
    if (ans.place) chips.push('景点 · ' + ans.place.n);
    (parsed.intents || []).slice(0, 2).forEach(function (it) { chips.push('意图 · ' + it.label); });
    if (ans.mode === 'model') chips.push('模型生成 · 已校验引用');
    else chips.push('证据引擎');
    var off = (ans.web && ans.web.official) || null;
    if (off && off.ok && off.sources && off.sources.length) {
      // 区分「政府站原文」和「公众号文章」：两者的可信度不同，标签必须说实话
      var onlyWx = off.sources.every(function (s) { return s.kind === 'wechat'; });
      chips.push(onlyWx
        ? '公众号 · ' + off.sources.length + ' 篇'
        : '官方原文 · ' + off.sources.length + ' 页');
    }

    h.push('<div class="ans">');
    h.push('<div class="ans-chips">' + chips.map(function (c) { return '<span>' + U.esc(c) + '</span>'; }).join('') + '</div>');
    if (ans.lead) h.push('<p class="ans-lead">' + U.esc(ans.lead) + '</p>');

    (ans.blocks || []).forEach(function (b) {
      h.push('<div class="ans-block"><h5>' + U.esc(b.title) + '</h5>');
      if (b.note) h.push('<p class="ans-note">' + U.esc(b.note) + '</p>');
      if (b.lines && b.lines.length) {
        h.push('<ul>');
        b.lines.forEach(function (l) {
          var cites = (l.cites || []).map(cr.chip).join('');
          h.push('<li>' + U.esc(l.text) + (cites ? ' ' + cites : '') + '</li>');
        });
        h.push('</ul>');
      }
      h.push('</div>');
    });

    (ans.notes || []).forEach(function (n) {
      h.push('<p class="ans-warn">' + U.esc(n.text) + '</p>');
    });

    if (ans.modelError) {
      h.push('<p class="ans-hint">' + U.esc(ans.modelError) + '（已自动切换到内置证据引擎，回答仍然逐句有出处。）</p>');
    }

    if (ans.web && ans.web.ok === false) {
      if (ans.web.via === 'none') {
        if (!state.webHintShown) {
          state.webHintShown = true;
          h.push('<p class="ans-hint">联网检索未开启：回答只用内置资料。要接实时公告，在设置里填检索 Key 或本地服务地址。</p>');
        }
      } else if (ans.web.via !== 'skip' && ans.web.via !== 'off') {
        h.push('<p class="ans-hint">联网检索没成功：' + U.esc(ans.web.reason) + '。上面的内容全部来自内置资料，未使用网络信息。</p>');
      }
    }

    if (off && off.ok === false && off.via === 'proxy' && off.reason && !state.offHintShown) {
      state.offHintShown = true;
      h.push('<p class="ans-hint">官方渠道这次没抓到页面：' + U.esc(off.reason) + '。回答只用了内置资料与公开网页。</p>');
    }

    if (ans.channels && ans.channels.length) {
      h.push('<div class="ans-channels"><span>核实入口</span>' +
        ans.channels.map(function (c) {
          return c.u ? '<a href="' + U.esc(c.u) + '" target="_blank" rel="noopener noreferrer">' + U.esc(c.n) + ' ↗</a>' :
            '<b>' + U.esc(c.n) + (c.d ? '（' + U.esc(c.d) + '）' : '') + '</b>';
        }).join('') + '</div>');
    }

    var list = cr.list();
    if (list.length) {
      h.push('<details class="ans-src"><summary>查看 ' + list.length + ' 条出处</summary><ol>');
      list.forEach(function (x) {
        h.push('<li><a href="' + U.esc(x.c.u) + '" target="_blank" rel="noopener noreferrer">' +
          U.esc(x.c.t || U.hostLabel(x.c.u)) + '</a>' +
          (x.c.d ? ' <em>' + U.esc(U.fmtDate(x.c.d)) + '</em>' : '') + '</li>');
      });
      h.push('</ol></details>');
    }
    h.push('</div>');
    return h.join('');
  }

  function renderEvidence(ans) {
    var box = $('#evidenceBox');
    var cnt = $('#evidenceCount');
    if (!box) return;
    if (!ans) {
      box.innerHTML = '<p class="muted-xs">提问后，这里会列出本次用到的资料与检索结果。</p>';
      if (cnt) cnt.textContent = '0 条';
      return;
    }
    var items = [];
    (ans.blocks || []).forEach(function (b) {
      (b.lines || []).forEach(function (l) {
        (l.cites || []).forEach(function (c) { items.push({ c: c, kind: '本地' }); });
      });
    });
    if (ans.web && ans.web.results) {
      ans.web.results.slice(0, 5).forEach(function (r) { items.push({ c: { t: r.title, u: r.url, d: '' }, kind: '联网' }); });
    }
    var seen = {}, uniq = [];
    items.forEach(function (x) {
      var k = (x.c.u || '') + '|' + (x.c.t || '');
      if (seen[k]) return;
      seen[k] = 1;
      uniq.push(x);
    });
    if (cnt) cnt.textContent = uniq.length + ' 条';
    box.innerHTML = '';
    if (!uniq.length) {
      box.innerHTML = '<p class="muted-xs">这条回答没有引用具体资料（相关资料未收录）。右侧「官方渠道」是可以直接核对的地方。</p>';
      return;
    }
    uniq.forEach(function (x) {
      var row = x.c.u ? U.el('a', { class: 'ev-row', href: x.c.u, target: '_blank', rel: 'noopener noreferrer' }) :
        U.el('div', { class: 'ev-row' });
      row.appendChild(U.el('span', { class: 'ev-kind' + (x.kind === '联网' ? ' web' : ''), text: x.kind }));
      row.appendChild(U.el('span', { class: 'ev-t', text: U.cut(x.c.t || U.hostLabel(x.c.u), 38) }));
      if (x.c.d) row.appendChild(U.el('span', { class: 'ev-d', text: U.fmtDate(x.c.d) }));
      box.appendChild(row);
    });
  }

  function renderOfficial(city) {
    var box = $('#officialBox');
    var tag = $('#officialCity');
    if (!box) return;
    if (tag) tag.textContent = city ? city.name : '—';
    box.innerHTML = '';
    var ch = city ? KB.channels(city.name) : KB.channels('全国');
    ch.slice(0, 5).forEach(function (c) {
      var row = c.u ? U.el('a', { class: 'ch-row', href: c.u, target: '_blank', rel: 'noopener noreferrer' }) :
        U.el('div', { class: 'ch-row' });
      row.appendChild(U.el('span', { class: 'ch-kind', text: c.kind }));
      row.appendChild(U.el('span', { class: 'ch-n', text: c.n }));
      row.appendChild(U.el('span', { class: 'ch-d', text: c.d }));
      box.appendChild(row);
    });
  }

  function typingNode() {
    return bubble('bot', '<div class="typing"><i></i><i></i><i></i><span>正在查资料…</span></div>');
  }

  function sendQuestion(text) {
    text = String(text || '').trim();
    if (!text || state.chatBusy) return Promise.resolve(null);
    state.chatBusy = true;
    resetChain();
    var input = $('#askInput');
    if (input) { input.value = ''; input.style.height = 'auto'; }
    var btn = $('#btnSend');
    if (btn) btn.disabled = true;

    bubble('me', U.esc(text));
    var t = typingNode();
    var status = $('#chatStatus');
    if (status) status.textContent = '正在解析问题…';

    return AI.ask(text, {
      step: function (name, detail) {
        resetChain();
        setChain(name);
        if (status) status.textContent = detail || '';
      }
    }).then(function (ans) {
      if (t) t.remove();
      resetChain();
      bubble('bot', answerHTML(ans));
      renderEvidence(ans);
      state.lastAnswer = ans;
      if (status) status.textContent = '回答已生成 · ' + (ans.mode === 'model' ? '模型引用已校验' : '内置证据引擎');
      if (ans.place) {
        MAP.focusPlace(ans.place, 14);
        var meta = $('#placeColTitle');
        if (meta) meta.textContent = ans.city ? ans.city.name + ' 的景点' : meta.textContent;
        renderQuick();
      }
      return ans;
    }).catch(function (e) {
      if (t) t.remove();
      bubble('bot', '<p class="ans-warn">出错了：' + U.esc(e && e.message ? e.message : String(e)) + '</p>');
      if (status) status.textContent = '出错';
      return null;
    }).then(function (ans) {
      state.chatBusy = false;
      if (btn) btn.disabled = false;
      return ans;
    });
  }

  /* ---------------- 消费核验 ---------------- */

  function feeInputs() {
    return {
      people: +($('#feePeople') || {}).value || 1,
      quote: +($('#feeQuote') || {}).value || 0,
      item: ($('#feeItem') || {}).value || '',
      must: ($('#feeMust') || {}).value || '',
      optional: !!($('#feeOptional') || {}).checked,
      invoice: !!($('#feeInvoice') || {}).checked,
      agency: !!($('#feeAgency') || {}).checked
    };
  }

  function renderFee() {
    var r = KB.fee(feeInputs());
    var total = $('#feeTotal');
    if (total) total.innerHTML = (r.perPerson ? r.perPerson.toFixed(r.perPerson % 1 ? 2 : 0) : '—') + '<small>元 / 人</small>';
    var sub = $('#feeSub');
    if (sub) sub.textContent = r.quote ? ('含必付附加 ' + r.extras + ' 元 · ' + r.people + ' 人合计 ' + r.total.toFixed(0) + ' 元') : '填入报价后开始计算';

    var br = $('#feeBreak');
    if (br) {
      br.innerHTML = '';
      var rows = [['对方报价', r.quote]];
      r.extraItems.forEach(function (x) { rows.push([x.name, x.amount]); });
      rows.push(['人均合计', r.perPerson]);
      rows.forEach(function (row) {
        br.appendChild(U.el('div', { class: 'fee-row' }, [
          U.el('span', { text: row[0] }),
          U.el('b', { text: row[1] ? row[1] + ' 元' : '—' })
        ]));
      });
    }

    var flagBox = $('#feeFlag');
    if (flagBox) {
      flagBox.innerHTML = '';
      r.flags.forEach(function (f) {
        flagBox.appendChild(U.el('div', { class: 'flag ' + f.lv }, [
          U.el('b', { text: f.t }), U.el('span', { text: f.d })
        ]));
      });
    }

    var adv = $('#feeAdvice');
    if (adv) {
      adv.innerHTML = '';
      if (r.quote) {
        adv.appendChild(U.el('p', { class: 'muted-xs', text: '核验思路：先看「人均总价」而不是报价；再看必须另付的项目是否写进合同；最后查对方是否为合法旅行社。' }));
        var ch = U.el('div', { class: 'channels' });
        KB.nationalChannels.forEach(function (c) {
          if (c.u) ch.appendChild(U.el('a', { class: 'chip', href: c.u, target: '_blank', rel: 'noopener noreferrer', text: c.n + ' ↗' }));
          else ch.appendChild(U.el('span', { class: 'chip', text: c.n }));
        });
        adv.appendChild(ch);
      } else {
        adv.appendChild(U.el('p', { class: 'muted-xs', text: '填好人数和报价，就能看到人均总价与风险点。' }));
      }
    }
  }

  /* ---------------- 对话框 ---------------- */

  function openDialog(dlg) {
    if (!dlg) return;
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (!dlg) return;
    if (dlg.close) dlg.close();
    else dlg.removeAttribute('open');
  }

  function bindDialogClose(dlg, btn) {
    if (!dlg) return;
    if (btn) btn.addEventListener('click', function () { closeDialog(dlg); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) closeDialog(dlg);
    });
  }

  /* ---------------- 城市目录 ---------------- */

  function renderCityDialog() {
    var grid = $('#cityGrid');
    if (!grid) return;
    var q = ($('#cityFilter') || {}).value || '';
    var prov = ($('#provinceSel') || {}).value || '';
    var list;
    if (q) {
      list = DATA.searchCities(q, 300);
    } else if (prov) {
      list = DATA.cities().filter(function (c) { return c.province === prov; });
    } else {
      list = DATA.destinations().concat(DATA.cities().filter(function (c) {
        return c.level === 'city';
      }));
    }
    if (prov) list = list.filter(function (c) { return c.province === prov; });
    state.cityList = list;
    var page = Math.max(60, state.cityPage * 60 + 60);
    grid.innerHTML = '';
    list.slice(0, page).forEach(function (c) {
      var b = U.el('button', { class: 'city-cell', type: 'button' }, [
        U.el('b', { text: c.name }),
        U.el('span', { text: (c.province || '') + ' · ' + cityLevelLabel(c) })
      ]);
      b.addEventListener('click', function () {
        setCity(c, { fromUser: true });
        closeDialog($('#cityDialog'));
      });
      grid.appendChild(b);
    });
    if (!list.length) grid.appendChild(U.el('div', { class: 'empty', text: '没有匹配的城市' }));
    var more = $('#cityMore');
    if (more) more.style.display = list.length > page ? '' : 'none';
    var meta = $('#cityDialogMeta');
    if (meta) meta.textContent = '共 ' + DATA.stats().cities + ' 条城市与区县 · 当前显示 ' + Math.min(page, list.length) + ' 条';
  }

  /* ---------------- 设置 ---------------- */

  function fillSettings() {
    var c = CFG.get();
    var set = function (id, v) { var n = $('#' + id); if (n) n.value = v || ''; };
    set('setAmapKey', c.amapKey);
    set('setAmapSecret', c.amapSecret);
    set('setBaseUrl', c.baseUrl);
    set('setModel', c.model);
    set('setModelKey', c.modelKey);
    set('setProxy', c.proxy);
    set('setSearchKey', c.searchKey);
    var sp = $('#setSearchProvider');
    if (sp) sp.value = c.searchProvider || 'auto';
  }

  function saveSettings() {
    var val = function (id) { var n = $('#' + id); return n ? n.value.trim() : ''; };
    CFG.patch({
      amapKey: val('setAmapKey'),
      amapSecret: val('setAmapSecret'),
      baseUrl: val('setBaseUrl'),
      model: val('setModel'),
      modelKey: val('setModelKey'),
      proxy: val('setProxy'),
      searchKey: val('setSearchKey'),
      searchProvider: val('setSearchProvider') || 'auto'
    });
    NET.resetHealth();
    refreshPills();
    resetChain();
    var status = $('#chatStatus');
    if (status) status.textContent = CFG.modelReady()
      ? '已接入 ' + CFG.get().model + '：先检索证据，再生成并校验引用'
      : '检索式回答 · 未配置模型时使用内置证据引擎';
    closeDialog($('#settingsDialog'));
    U.toast('配置已保存到本机');
    renderOfficial(state.city);
    renderQuick();
  }

  function testOutput(id, text, kind) {
    var n = $('#' + id);
    if (!n) return;
    n.textContent = text;
    n.className = 'test-out ' + (kind || '');
  }

  /* ---------------- 演示 ---------------- */

  var demoRunning = false;
  function runDemo() {
    if (demoRunning) { U.toast('演示进行中'); return; }
    demoRunning = true;
    var km = DATA.resolveCity('昆明');
    var cq = DATA.resolveCity('重庆');
    U.toast('演示：先看昆明的实时地图');
    var seq = Promise.resolve();
    seq = seq.then(function () { return setCity(km, { fromUser: true }); })
      .then(function () { return U.sleep(700); })
      .then(function () {
        var p = DATA.placesFor('昆明').find(function (x) { return x.n.indexOf('翠湖') >= 0; });
        if (p) openDetail(p);
        return U.sleep(1600);
      })
      .then(function () {
        closeDialog($('#detailDialog'));
        var sec = $('#assistant');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return sendQuestion('翠湖要票不？');
      })
      .then(function () { return U.sleep(500); })
      .then(function () { return sendQuestion('那要预约吗？'); })
      .then(function () { return U.sleep(400); })
      .then(function () { return sendQuestion('从哪个门进？'); })
      .then(function () {
        U.toast('演示：切到重庆，看地图是否同样完整');
        return setCity(cq, { fromUser: true });
      })
      .then(function () { return U.sleep(900); })
      .then(function () {
        var p = DATA.placesFor('重庆').find(function (x) { return x.n.indexOf('洪崖洞') >= 0; });
        if (p) openDetail(p);
      })
      .then(function () { demoRunning = false; })
      .catch(function (e) { demoRunning = false; console.warn(e); });
    return seq;
  }

  /* ---------------- 绑定 ---------------- */

  function bindSearch() {
    var input = $('#cityInput');
    var box = $('#citySuggest');
    if (!input || !box) return;
    var items = [], active = -1;

    var render = function (list) {
      items = list;
      active = -1;
      box.innerHTML = '';
      if (!list.length) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      list.forEach(function (c, i) {
        var row = U.el('button', { class: 'sug', type: 'button', role: 'option' }, [
          U.el('b', { text: c.name }),
          U.el('span', { text: (c.province || '') + ' · ' + cityLevelLabel(c) })
        ]);
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          choose(c);
        });
        box.appendChild(row);
      });
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    var choose = function (c) {
      input.value = '';
      box.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      setCity(c, { fromUser: true });
    };

    input.addEventListener('input', U.debounce(function () {
      var q = input.value.trim();
      if (!q) { box.hidden = true; return; }
      render(DATA.searchCities(q, 9));
    }, 120));

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        $$('.sug', box).forEach(function (n, i) { n.classList.toggle('is-active', i === active); });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && items[active]) return choose(items[active]);
        var c = DATA.resolveCity(input.value);
        if (c) choose(c);
        else U.toast('没有找到这座城市，试试「重庆」「阿勒泰」或区县名', 'error');
      } else if (e.key === 'Escape') {
        box.hidden = true;
      }
    });

    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) box.hidden = true;
    });
  }

  function bindMapTools() {
    $$('[data-base]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-base]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        MAP.setBase(b.dataset.base);
      });
    });
    var traffic = U.el('button', {
      class: 'map-tool map-tool-text', type: 'button', title: '高德实时路况', 'aria-pressed': 'false',
      html: '<span>路况</span>'
    });
    var tools = $('.map-tools');
    if (tools) tools.insertBefore(traffic, tools.firstChild);
    traffic.addEventListener('click', function () {
      var on = traffic.getAttribute('aria-pressed') !== 'true';
      traffic.setAttribute('aria-pressed', String(on));
      MAP.setTraffic(on);
      U.toast(on ? '已叠加高德实时路况（红色拥堵 / 黄色缓行）' : '已关闭路况');
    });

    var bd = $('#btnBoundary');
    if (bd) bd.addEventListener('click', function () {
      var on = bd.getAttribute('aria-pressed') !== 'true';
      bd.setAttribute('aria-pressed', String(on));
      MAP.setBoundaryVisible(on);
    });
    var poi = $('#btnPoi');
    if (poi) poi.addEventListener('click', function () {
      var on = poi.getAttribute('aria-pressed') !== 'true';
      poi.setAttribute('aria-pressed', String(on));
      MAP.setPoiVisible(on);
    });
    var fit = $('#btnFitAll');
    if (fit) fit.addEventListener('click', function () { MAP.fitAll(); });
    var en = $('#btnEnlarge');
    if (en) en.addEventListener('click', function () {
      var frame = $('#mapFrame');
      var col = $('#mapCol');
      var on = frame.classList.toggle('is-big');
      if (col) col.classList.toggle('is-big', on);
      MAP.invalidate();
      en.innerHTML = on ? '<svg><use href="#i-expand"/></svg>' : '<svg><use href="#i-expand"/></svg>';
      U.toast(on ? '放大地图（再点一次还原）' : '已还原');
    });
    var more = $('#btnMorePlace');
    if (more) more.addEventListener('click', function () {
      state.poiShown += 24;
      renderPlaceList();
    });
    var allCity = $('#btnAllCities');
    if (allCity) allCity.addEventListener('click', function () {
      state.cityPage = 0;
      renderCityDialog();
      openDialog($('#cityDialog'));
    });
    var dia = $('#btnCityDialog');
    if (dia) dia.addEventListener('click', function () {
      state.cityPage = 0;
      renderCityDialog();
      openDialog($('#cityDialog'));
    });
  }

  function bindChat() {
    var send = $('#btnSend');
    if (send) send.addEventListener('click', function () {
      var input = $('#askInput');
      sendQuestion(input ? input.value : '');
    });
    var input = $('#askInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendQuestion(input.value);
        }
      });
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(140, input.scrollHeight) + 'px';
      });
    }
    var nw = $('#btnNewChat');
    if (nw) nw.addEventListener('click', function () {
      AI.reset();
      var log = $('#chatLog');
      if (log) log.innerHTML = '';
      renderEvidence(null);
      resetChain();
      greeting();
      renderQuick();
      U.toast('已开始新对话');
    });
  }

  function greeting() {
    var city = state.city ? state.city.name : '重庆';
    bubble('bot', '<div class="ans"><p class="ans-lead">我是小安。你可以直接问某座城市或某个景点的门票、开放时间、从哪个门进、怎么过去、人多不多。</p>' +
      '<p class="ans-hint">我会先说清楚理解成了什么，再只用查得到的资料回答，每句带出处。查不到就说查不到。</p>' +
      '<div class="ans-chips"><span>当前城市 · ' + U.esc(city) + '</span><span>' +
      (CFG.modelReady() ? '模型 · ' + U.esc(CFG.get().model) : '证据引擎 · 未配置模型') + '</span></div></div>');
  }

  function bindFee() {
    ['feePeople', 'feeQuote', 'feeItem', 'feeMust', 'feeOptional', 'feeInvoice', 'feeAgency'].forEach(function (id) {
      var n = $('#' + id);
      if (n) n.addEventListener('input', renderFee);
      if (n && n.type === 'checkbox') n.addEventListener('change', renderFee);
    });
    renderFee();
  }

  function bindSettings() {
    var btn = $('#btnSettings');
    if (btn) btn.addEventListener('click', function () {
      fillSettings();
      openDialog($('#settingsDialog'));
    });
    bindDialogClose($('#settingsDialog'), $('#settingsClose'));
    var save = $('#settingsSave');
    if (save) save.addEventListener('click', saveSettings);
    var reset = $('#settingsReset');
    if (reset) reset.addEventListener('click', function () {
      CFG.reset();
      fillSettings();
      refreshPills();
      applyTheme(CFG.get().theme);
      U.toast('已恢复默认配置');
    });
    var clear = $('#btnClearCache');
    if (clear) clear.addEventListener('click', function () {
      U.storeClear();
      U.toast('已清除本机缓存，刷新后生效');
    });

    $$('[data-theme-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        var mode = b.getAttribute('data-theme-set');
        CFG.patch({ theme: mode });
        applyTheme(mode);
      });
    });

    var ta = $('#testAmap');
    if (ta) ta.addEventListener('click', function () {
      CFG.patch({ amapKey: ($('#setAmapKey') || {}).value.trim(), amapSecret: ($('#setAmapSecret') || {}).value.trim() });
      testOutput('amapOut', '测试中…');
      NET.probeAmapKey().then(function (r) {
        testOutput('amapOut', r.ok ? '可用，示例结果：' + (r.sample || '洪崖洞') : '失败：' + r.reason, r.ok ? 'ok' : 'bad');
        refreshPills();
      });
    });

    var tm = $('#testModel');
    if (tm) tm.addEventListener('click', function () {
      CFG.patch({
        baseUrl: ($('#setBaseUrl') || {}).value.trim(),
        model: ($('#setModel') || {}).value.trim(),
        modelKey: ($('#setModelKey') || {}).value.trim()
      });
      testOutput('modelOut', '测试中…');
      NET.probeModel().then(function (r) {
        testOutput('modelOut', r.ok ? '可用：' + (r.text || '在线') : '失败：' + r.reason, r.ok ? 'ok' : 'bad');
        refreshPills();
      });
    });

    var ts = $('#testSearch');
    if (ts) ts.addEventListener('click', function () {
      CFG.patch({
        proxy: ($('#setProxy') || {}).value.trim(),
        searchKey: ($('#setSearchKey') || {}).value.trim(),
        searchProvider: ($('#setSearchProvider') || {}).value || 'auto'
      });
      testOutput('searchOut', '测试中…');
      NET.search('重庆 洪崖洞 门票 官方', { city: '重庆' }).then(function (r) {
        testOutput('searchOut', r.ok ? '可用（' + r.via + '），返回 ' + r.results.length + ' 条' : '不可用：' + r.reason, r.ok ? 'ok' : 'bad');
        refreshPills();
      });
    });

    var preset = U.el('div', { class: 'preset-row' });
    var anchor = $('#setBaseUrl');
    if (anchor && anchor.parentElement) {
      CFG.MODEL_PRESETS.forEach(function (p) {
        var b = U.el('button', { class: 'chip tiny', type: 'button', text: p.label });
        b.addEventListener('click', function () {
          if ($('#setBaseUrl')) $('#setBaseUrl').value = p.baseUrl;
          if ($('#setModel')) $('#setModel').value = p.model;
          U.toast('已填入 ' + p.label + ' 的地址与模型名，再填 API Key 即可');
        });
        preset.appendChild(b);
      });
      anchor.parentElement.appendChild(preset);
    }
  }

  function init() {
    applyTheme(CFG.get().theme);
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { if ((CFG.get().theme || 'auto') === 'auto') applyTheme('auto'); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    var bt = $('#btnTheme');
    if (bt) bt.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark';
      var mode = cur ? 'light' : 'dark';
      CFG.patch({ theme: mode });
      applyTheme(mode);
    });

    // 城市目录
    var prov = $('#provinceSel');
    if (prov) {
      DATA.provinces().forEach(function (p) {
        prov.appendChild(U.el('option', { value: p, text: p }));
      });
      prov.addEventListener('change', function () { state.cityPage = 0; renderCityDialog(); });
    }
    var cf = $('#cityFilter');
    if (cf) cf.addEventListener('input', U.debounce(function () { state.cityPage = 0; renderCityDialog(); }, 160));
    var cm = $('#cityMore');
    if (cm) cm.addEventListener('click', function () { state.cityPage += 1; renderCityDialog(); });
    bindDialogClose($('#cityDialog'), $('#cityDialogClose'));

    // 详情
    bindDialogClose($('#detailDialog'), $('#detailClose'));
    var ask = $('#detailAsk');
    if (ask) ask.addEventListener('click', function () { if (detailPlace) askAbout(detailPlace); });
    var route = $('#detailRoute');
    if (route) route.addEventListener('click', function () {
      if (!detailPlace) return;
      var q = '从' + (state.city ? state.city.name : '市区') + '怎么去' + detailPlace.n + '？走哪个门最近？';
      closeDialog($('#detailDialog'));
      sendQuestion(q);
      var sec = $('#assistant');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    bindDialogClose($('#photoDialog'), $('#photoClose'));

    $('#btnDemo').addEventListener('click', runDemo);

    bindSearch();
    bindMapTools();
    bindChat();
    bindFee();
    bindSettings();
    bindReveal();

    renderHotCities();
    renderCityList();
    animateCounters();
    refreshPills();
    greeting();
    renderQuick();
    renderOfficial(null);
    renderEvidence(null);

    var start = DATA.resolveCity('重庆') || DATA.destinations()[0];
    setCity(start, { silent: true }).then(function () {
      if (start) U.toast('已载入 ' + start.name + '：底图与边界就绪，点左侧城市可切换全国任意城市');
    });
  }

  global.UI = {
    init: init, setCity: setCity, sendQuestion: sendQuestion,
    openDetail: openDetail, runDemo: runDemo, state: state
  };
})(window);
