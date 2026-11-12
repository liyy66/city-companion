/* geo.js — 坐标系与中国区偏移纠正，以及高德 / 百度跳转链接
 *
 * 本项目内部一律使用 WGS-84 存储点位（数据集来源为 GeoNames / OpenStreetMap / 官方公布坐标）。
 * 高德瓦片与 DataV 行政边界均使用 GCJ-02（火星坐标）。
 * 因此：渲染到地图前必须 wgs2gcj；从高德接口取回的坐标必须 gcj2wgs 再入库。
 * 不做这一层转换，点位就会整体偏移 300~800 米，看起来像「地图上没有这个景点」。
 */
(function (global) {
  'use strict';

  var PI = Math.PI;
  var A = 6378245.0;
  var EE = 0.00669342162296594323;

  function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
  }

  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }

  /** WGS-84 -> GCJ-02，返回 [lat, lng] */
  function wgs2gcj(lat, lng) {
    lat = +lat; lng = +lng;
    if (outOfChina(lat, lng)) return [lat, lng];
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return [lat + dLat, lng + dLng];
  }

  /** GCJ-02 -> WGS-84，迭代逼近，返回 [lat, lng] */
  function gcj2wgs(lat, lng) {
    lat = +lat; lng = +lng;
    if (outOfChina(lat, lng)) return [lat, lng];
    var wLat = lat, wLng = lng;
    for (var i = 0; i < 4; i++) {
      var g = wgs2gcj(wLat, wLng);
      wLat += lat - g[0];
      wLng += lng - g[1];
    }
    return [wLat, wLng];
  }

  /** 数据坐标 -> 地图坐标（Leaflet 使用 [lat,lng]） */
  function toMap(lat, lng) { return wgs2gcj(lat, lng); }
  /** 地图坐标 -> 数据坐标 */
  function fromMap(lat, lng) { return gcj2wgs(lat, lng); }

  /** 递归把 GeoJSON 里的坐标从 WGS 转 GCJ（边界数据本身就是 GCJ，用不到，保留给其他源） */
  function geoJsonConvert(geo, fn) {
    function walk(c) {
      if (typeof c[0] === 'number') { var p = fn(c[1], c[0]); return [p[1], p[0]]; }
      return c.map(walk);
    }
    if (!geo) return geo;
    if (geo.type === 'FeatureCollection') {
      geo.features = (geo.features || []).map(function (f) {
        f.geometry = f.geometry && { type: f.geometry.type, coordinates: walk(f.geometry.coordinates) };
        return f;
      });
    } else if (geo.type === 'Feature') {
      geo.geometry = geo.geometry && { type: geo.geometry.type, coordinates: walk(geo.geometry.coordinates) };
    } else if (geo.coordinates) {
      geo.coordinates = walk(geo.coordinates);
    }
    return geo;
  }

  function qs(o) {
    var out = [];
    for (var k in o) {
      if (o[k] === undefined || o[k] === null || o[k] === '') continue;
      out.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k]));
    }
    return out.join('&');
  }

  /** 高德：搜索 / 标注 / 路线。coordinate=gaode 表示传入的是 GCJ 坐标 */
  function amapURI(kind, opt) {
    opt = opt || {};
    var name = opt.name || '';
    var base = 'https://uri.amap.com/';
    if (kind === 'search') {
      return base + 'search?' + qs({ keyword: name, city: opt.city || '', callnative: 0, src: 'city-companion' });
    }
    if (kind === 'route' && opt.to) {
      var to = opt.to;
      var gc = to.gcj || wgs2gcj(to.lat, to.lng);
      return base + 'navigation?' + qs({
        from: opt.from ? (wgs2gcj(opt.from.lat, opt.from.lng)[1] + ',' + wgs2gcj(opt.from.lat, opt.from.lng)[0] + ',' + (opt.fromName || '起点')) : '',
        to: gc[1] + ',' + gc[0] + ',' + (to.name || name),
        mode: opt.mode || 'walk', policy: 1, src: 'city-companion', coordinate: 'gaode', callnative: 0
      });
    }
    if (opt.lat != null) {
      var g = wgs2gcj(opt.lat, opt.lng);
      return base + 'marker?' + qs({
        position: g[1] + ',' + g[0], name: name, src: 'city-companion',
        coordinate: 'gaode', callnative: 0
      });
    }
    return base + 'search?' + qs({ keyword: name, city: opt.city || '', callnative: 0 });
  }

  /** 百度：coord_type=gcj02 直接吃高德坐标 */
  function baiduURI(opt) {
    opt = opt || {};
    var g = opt.gcj || wgs2gcj(opt.lat, opt.lng);
    return 'https://api.map.baidu.com/marker?' + qs({
      location: g[0] + ',' + g[1], title: opt.name || '', content: opt.desc || '',
      output: 'html', coord_type: 'gcj02', src: 'webapp.city-companion'
    });
  }

  function bboxOf(list, pad) {
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180, n = 0;
    (list || []).forEach(function (p) {
      if (!p || p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) return;
      n++;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });
    if (!n) return null;
    var p = pad == null ? 0.01 : pad;
    return [[minLat - p, minLng - p], [maxLat + p, maxLng + p]];
  }

  global.GEO = {
    outOfChina: outOfChina, wgs2gcj: wgs2gcj, gcj2wgs: gcj2wgs,
    toMap: toMap, fromMap: fromMap, geoJsonConvert: geoJsonConvert,
    amapURI: amapURI, baiduURI: baiduURI, bboxOf: bboxOf
  };
})(window);
