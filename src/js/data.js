/* data.js — 把内嵌数据建成索引。数据来源见页脚与 docs/SOURCES.md */
(function (global) {
  'use strict';

  var atlas = null;
  var idx = null;

  function parseAtlas() {
    if (atlas) return atlas;
    if (global.__ATLAS__) { atlas = global.__ATLAS__; return atlas; }
    var node = document.getElementById('atlas-data');
    if (!node) throw new Error('缺少内嵌数据');
    atlas = JSON.parse(node.textContent);
    return atlas;
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\s\u3000]+/g, '')
      .replace(/[·・\-—_()（）\[\]【】]/g, '')
      .toLowerCase();
  }

  function stripSuffix(s) {
    return norm(s).replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|风景区|风景名胜区|景区|公园|博物馆|步行街|广场|古镇|古城|市|区|县|省)$/g, '');
  }

  function build() {
    if (idx) return idx;
    var a = parseAtlas();

    var cities = a.cities || [];
    var byName = new Map();
    var byAd = new Map();
    var list = [];

    cities.forEach(function (c) {
      var item = {
        name: c.n, province: c.p, lat: +c.lat, lng: +c.lng,
        level: c.l || 'county', aliases: c.a || [], adcode: c.ad || 0
      };
      list.push(item);
      byName.set(norm(item.name), item);
      (item.aliases || []).forEach(function (al) { if (al && !byName.has(norm(al))) byName.set(norm(al), item); });
      if (item.adcode && !byAd.has(item.adcode)) byAd.set(item.adcode, item);
    });

    // 少数城市在数据里没有 adcode（边界因此画不出来）。用 DataV 行政区划表按「同名 + 最近距离」补齐，
    // 这样 3,900 多个城市与区县都能拿到行政边界，而不是只有重庆、昆明有图。
    var admin = a.admin || [];
    var adminByName = new Map();
    admin.forEach(function (x) {
      if (!x || !x[0] || !x[1]) return;
      var k = norm(x[1]);
      if (!adminByName.has(k)) adminByName.set(k, []);
      // DataV 的字段顺序是 [adcode, name, level, parent, lng, lat]
      adminByName.get(k).push({ adcode: x[0], name: x[1], lat: +x[5], lng: +x[4] });
    });
    var stripSuffix = function (s) {
      return String(s || '').replace(/(特别行政区|自治州|自治县|自治区|地区|盟|市辖区|市|县|区|旗)$/, '');
    };
    // 港澳台在行政区划表里是省级条目，名字与城市名不完全一致
    var SPECIAL_ADCODE = {
      '香港': 810000, '澳门': 820000,
      '台北': 710000, '新北': 710000, '桃园': 710000, '台中': 710000,
      '台南': 710000, '高雄': 710000, '基隆': 710000, '新竹': 710000, '嘉义': 710000
    };
    var filled = 0;
    list.forEach(function (item) {
      if (item.adcode) return;
      if (SPECIAL_ADCODE[item.name]) {
        item.adcode = SPECIAL_ADCODE[item.name];
        item.adcodeFilled = 'special';
        if (!byAd.has(item.adcode)) byAd.set(item.adcode, item);
        filled++;
        return;
      }
      var cands = (adminByName.get(norm(item.name)) || []).concat(adminByName.get(norm(stripSuffix(item.name))) || []);
      if (!cands.length) return;
      var best = null, bestD = Infinity;
      cands.forEach(function (c) {
        if (!c.adcode || !isFinite(c.lat) || !isFinite(c.lng)) return;
        var d = Math.abs(c.lat - item.lat) + Math.abs(c.lng - item.lng);
        if (d < bestD) { bestD = d; best = c; }
      });
      // 超过约 1.5 度（≈150km）不接受，避免把同名异地硬套上去
      if (!best || bestD > 1.5) return;
      item.adcode = best.adcode;
      item.adcodeFilled = 'name';
      if (!byAd.has(best.adcode)) byAd.set(best.adcode, item);
      filled++;
    });
    if (filled) console.info('[data] 用行政区划表补齐 ' + filled + ' 个城市的 adcode');

    var placeById = new Map();
    var placesByCity = new Map();
    (a.places || []).forEach(function (p) {
      var item = Object.assign({}, p, { approx: false, kind: p.kind || 'curated' });
      placeById.set(item.id, item);
      var key = item.city;
      if (!placesByCity.has(key)) placesByCity.set(key, []);
      placesByCity.get(key).push(item);
    });

    // 旅游指南里的景点（昆明）
    var guide = a.guide || {};
    Object.keys(guide).forEach(function (city) {
      (guide[city] || []).forEach(function (g, i) {
        var id = 'guide-' + city + '-' + i;
        if (placeById.has(id)) return;
        var item = {
          id: id, n: g.n, city: city, d: '', lat: null, lng: null,
          cat: '城市公园', desc: '', hl: g.a || [],
          price: null, hours: null, crowd: null,
          src: g.off ? [{ t: g.off.title, u: g.off.url }] : [],
          kind: 'guide', approx: false, aliases: g.a || [], facts: g.f || {}
        };
        placeById.set(id, item);
        if (!placesByCity.has(city)) placesByCity.set(city, []);
        placesByCity.get(city).push(item);
      });
    });

    // 县域景区索引（无坐标，放到县域中心附近，界面会标注「近似」）
    var counties = a.counties || {};
    var countyKeys = Object.keys(counties);
    countyKeys.forEach(function (name) {
      var c = byName.get(norm(name));
      var rec = counties[name];
      var spots = (rec && rec.s) || [];
      spots.forEach(function (s, i) {
        var id = 'county-' + name + '-' + i;
        if (placeById.has(id)) return;
        var seed = (i * 37 + name.length * 11) % 100 / 100;
        var ang = (i * 137.5) * Math.PI / 180;
        var rad = 0.02 + (i % 4) * 0.016;
        var item = {
          id: id, n: s.n, city: name, d: '', cat: s.c || '景区', desc: s.t || '', hl: [],
          lat: c ? c.lat + Math.sin(ang) * rad : null,
          lng: c ? c.lng + Math.cos(ang) * rad : null,
          price: null, hours: null, crowd: null, src: [], kind: 'county', approx: true,
          province: rec.p || (c && c.province) || ''
        };
        // 用 seed 打散半径，避免所有县域点位排成同心圆
        if (c && item.approx) item.lat = c.lat + Math.sin(ang) * rad * (0.6 + seed);
        placeById.set(id, item);
        if (!placesByCity.has(name)) placesByCity.set(name, []);
        placesByCity.get(name).push(item);
      });
    });

    // 照片：place id -> 相册；另有按名字索引的旧图
    var photos = a.photos || {};
    var legacy = a.legacyPhotos || {};
    var photoCount = 0;
    Object.keys(photos).forEach(function (k) { photoCount += (photos[k] || []).length; });

    // 官方参考条目
    var refsAll = a.refs || [];
    var refsByCity = new Map();
    refsAll.forEach(function (r) {
      var k = r.city || '全国';
      if (!refsByCity.has(k)) refsByCity.set(k, []);
      refsByCity.get(k).push(r);
    });

    // 全国点位网格索引（0.2° 一格）
    var pois = a.pois || [];
    var grid = new Map();
    var CELL = 0.2;
    function cellKey(lat, lng) {
      return Math.floor(lat / CELL) + ':' + Math.floor(lng / CELL);
    }
    for (var i = 0; i < pois.length; i++) {
      var p = pois[i];
      var k = cellKey(p[1], p[2]);
      var bucket = grid.get(k);
      if (!bucket) { bucket = []; grid.set(k, bucket); }
      bucket.push(i);
    }

    // 用于问题解析的名称表：长度倒序，保证「洪崖洞」优先于「洪崖」
    var nameEntries = [];
    placeById.forEach(function (p) {
      nameEntries.push({ key: p.n, type: 'place', id: p.id });
      (p.aliases || []).forEach(function (al) { if (al) nameEntries.push({ key: al, type: 'place', id: p.id }); });
      (p.hl || []).forEach(function (h) { if (h && h.length >= 3) nameEntries.push({ key: h, type: 'keyword', id: p.id }); });
    });
    Object.keys(legacy).forEach(function (n) {
      var exist = nameEntries.some(function (e) { return e.key === n; });
      if (!exist) nameEntries.push({ key: n, type: 'legacy', id: n });
    });
    nameEntries.sort(function (x, y) { return y.key.length - x.key.length; });
    var seen = new Set();
    nameEntries = nameEntries.filter(function (e) {
      var k = e.key + '|' + e.type + '|' + e.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    var cityNameEntries = list.map(function (c) { return { key: c.name, city: c }; })
      .concat(list.filter(function (c) { return c.aliases && c.aliases.length; })
        .reduce(function (acc, c) {
          c.aliases.forEach(function (al) { if (al && al.length >= 2) acc.push({ key: al, city: c }); });
          return acc;
        }, []))
      .sort(function (x, y) { return y.key.length - x.key.length; });

    idx = {
      raw: a, cities: list, byName: byName, byAd: byAd,
      placeById: placeById, placesByCity: placesByCity,
      guide: guide, counties: counties, countyKeys: countyKeys,
      photos: photos, legacy: legacy, photoCount: photoCount,
      refsAll: refsAll, refsByCity: refsByCity,
      pois: pois, grid: grid, CELL: CELL, cellKey: cellKey,
      nameEntries: nameEntries, cityNameEntries: cityNameEntries
    };
    return idx;
  }

  function photoSrc(f) {
    if (!f) return '';
    var bundle = global.__PHOTOS__;
    if (bundle && bundle[f]) return bundle[f];
    return f;
  }

  function searchCities(q, limit) {
    var I = build();
    var s = norm(q);
    if (!s) return [];
    var out = [];
    for (var i = 0; i < I.cities.length && out.length < (limit || 12); i++) {
      var c = I.cities[i];
      var n = norm(c.name);
      var score = -1;
      if (n === s) score = 100;
      else if (n.indexOf(s) === 0) score = 80 - n.length;
      else if (n.indexOf(s) > 0) score = 50 - n.length;
      else if (stripSuffix(c.name).indexOf(s) >= 0) score = 30;
      else if ((c.aliases || []).some(function (a) { return norm(a).indexOf(s) >= 0; })) score = 20;
      if (score >= 0) out.push({ city: c, score: score + (c.level === 'destination' ? 12 : 0) });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.map(function (x) { return x.city; });
  }

  function resolveCity(text) {
    var I = build();
    var s = norm(text);
    if (!s) return null;
    if (I.byName.has(s)) return I.byName.get(s);
    for (var i = 0; i < I.cityNameEntries.length; i++) {
      var e = I.cityNameEntries[i];
      if (s.indexOf(norm(e.key)) >= 0) return e.city;
    }
    var hit = searchCities(text, 1);
    return hit.length ? hit[0] : null;
  }

  /** 在城市名文本里找城市（用于「重庆洪崖洞」这类复合串） */
  function cityInText(text) {
    var I = build();
    var s = norm(text);
    for (var i = 0; i < I.cityNameEntries.length; i++) {
      var k = norm(I.cityNameEntries[i].key);
      if (k.length >= 2 && s.indexOf(k) >= 0) return I.cityNameEntries[i].city;
    }
    return null;
  }

  function matchNames(text) {
    var I = build();
    var s = norm(text);
    if (!s) return [];
    var hits = [];
    for (var i = 0; i < I.nameEntries.length; i++) {
      var e = I.nameEntries[i];
      var k = norm(e.key);
      if (k.length < 2) continue;
      if (s.indexOf(k) >= 0) {
        hits.push(e);
        // 同名字片段不要重复计入
        if (hits.length >= 6) break;
      }
    }
    return hits;
  }

  function placeById(id) { return build().placeById.get(id) || null; }

  function placesFor(cityName) {
    var I = build();
    var arr = (I.placesByCity.get(cityName) || []).slice();
    arr.sort(function (a, b) {
      var rank = { curated: 0, expanded: 0, guide: 1, county: 2 };
      var ra = rank[a.kind] == null ? 3 : rank[a.kind];
      var rb = rank[b.kind] == null ? 3 : rank[b.kind];
      return ra - rb || String(a.n).localeCompare(String(b.n), 'zh-CN');
    });
    // 同名景点会同时来自「精选卡」和「官方事实/县域」，只留一条，把缺的字段补上，
    // 否则景列表里会出现两个「翠湖公园」（线上截图里出现过，别删这段）。
    var seen = new Map();
    var merged = [];
    for (var k = 0; k < arr.length; k++) {
      var p = arr[k];
      var key = String(p.n || '').replace(/[\s·（）()]/g, '');
      var hit = seen.get(key);
      if (!hit) { seen.set(key, p); merged.push(p); continue; }
      ['desc', 'price', 'hours', 'crowd', 'hl', 'src', 'lat', 'lng'].forEach(function (f) {
        if ((hit[f] == null || hit[f] === '' || (Array.isArray(hit[f]) && !hit[f].length)) && p[f] != null) hit[f] = p[f];
      });
      if (p.aliases && p.aliases.length) {
        hit.aliases = (hit.aliases || []).concat(p.aliases.filter(function (a) {
          return (hit.aliases || []).indexOf(a) < 0;
        }));
      }
    }
    return merged;
  }

  function nearbyPois(lat, lng, radiusM, limit) {
    var I = build();
    var out = [];
    if (lat == null || lng == null) return out;
    var R = radiusM || 6000;
    var dLat = R / 111000;
    var dLng = R / (111000 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var i0 = Math.floor((lat - dLat) / I.CELL), i1 = Math.floor((lat + dLat) / I.CELL);
    var j0 = Math.floor((lng - dLng) / I.CELL), j1 = Math.floor((lng + dLng) / I.CELL);
    var cap = limit || 400;
    for (var i = i0; i <= i1; i++) {
      for (var j = j0; j <= j1; j++) {
        var bucket = I.grid.get(i + ':' + j);
        if (!bucket) continue;
        for (var t = 0; t < bucket.length; t++) {
          var p = I.pois[bucket[t]];
          var d = U.haversine(lat, lng, p[1], p[2]);
          if (d <= R) out.push({ name: p[0], lat: p[1], lng: p[2], cat: p[3] || '点位', dist: d });
        }
      }
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out.slice(0, cap);
  }

  function nearestCity(lat, lng) {
    var I = build();
    var best = null, bd = Infinity;
    for (var i = 0; i < I.cities.length; i++) {
      var c = I.cities[i];
      if (c.lat == null) continue;
      var d = U.haversine(lat, lng, c.lat, c.lng);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { city: best, dist: bd } : null;
  }

  function refsFor(cityName) {
    var I = build();
    var out = (I.refsByCity.get(cityName) || []).slice();
    if (cityName !== '全国') out = out.concat(I.refsByCity.get('全国') || []);
    return out;
  }

  function photosFor(place) {
    var I = build();
    if (!place) return [];
    var album = I.photos[place.id] || (place.name && I.photos[place.name]) || null;
    if (album && album.length) return album;
    var keys = [place.n].concat(place.aliases || []).concat(place.hl || []);
    for (var i = 0; i < keys.length; i++) {
      var lg = I.legacy[keys[i]];
      if (lg) return [lg];
    }
    return [];
  }

  function provinces() {
    var I = build();
    var m = new Map();
    I.cities.forEach(function (c) {
      if (!c.province) return;
      m.set(c.province, (m.get(c.province) || 0) + 1);
    });
    return Array.from(m.keys()).sort(function (a, b) { return String(a).localeCompare(String(b), 'zh-CN'); });
  }

  function destinations() {
    var I = build();
    return I.cities.filter(function (c) { return c.level === 'destination'; });
  }

  function stats() {
    var I = build();
    // 口径说明：placeById 里除了精选卡，还有 guide（官方指南）与 county（县域亮点）派生的条目，
    // 首屏统计只报「精选景点卡」，否则 551 这个数字会被误读成 551 个景点。
    var curated = 0;
    I.placeById.forEach(function (p) {
      if (p.kind === 'curated' || p.kind === 'expanded') curated++;
    });
    return {
      cities: I.cities.length,
      pois: I.pois.length,
      places: I.placeById.size,
      curated: curated,
      photos: I.photoCount,
      governors: I.countyKeys.length
    };
  }

  function guideFor(city) {
    var I = build();
    return I.guide[city] || null;
  }

  function countyFor(name) {
    var I = build();
    return I.counties[name] || null;
  }

  global.DATA = {
    build: build, norm: norm, stripSuffix: stripSuffix,
    cities: function () { return build().cities; },
    destinations: destinations, provinces: provinces,
    searchCities: searchCities, resolveCity: resolveCity, cityInText: cityInText,
    matchNames: matchNames, placeById: placeById, placesFor: placesFor,
    nearbyPois: nearbyPois, nearestCity: nearestCity,
    refsFor: refsFor, photosFor: photosFor, photoSrc: photoSrc,
    guideFor: guideFor, countyFor: countyFor, stats: stats,
    countyKeys: function () { return build().countyKeys; },
    attribution: function () { return build().raw.attribution || {}; },
    vector: function (city) { return (build().raw.vector || {})[city] || null; }
  };
})(window);
