/* map.js — Leaflet + 高德瓦片；全国任意城市都可加载行政边界与点位
 *
 * 坐标约定：DATA 里全是 WGS-84，渲染前统一 GEO.toMap()（WGS→GCJ）。
 * 行政边界来自 DataV，本身就是 GCJ，直接画，不能再转。
 */
(function (global) {
  'use strict';

  var map = null;
  var layers = {
    road: null, sat: null, traffic: null,
    boundary: null, places: null, pois: null, route: null, me: null
  };
  var markers = new Map();      // placeId -> marker
  var current = { city: null, adcode: 0, base: 'road', bounds: null };
  var hooks = { onPickPlace: null };
  var token = 0;

  var TILE = {
    road: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    sat: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    traffic: 'https://tm.amap.com/trafficengine/mapabc/traffictile?v=1.0&t=1&x={x}&y={y}&z={z}'
  };

  function init(opts) {
    opts = opts || {};
    hooks.onPickPlace = opts.onPickPlace || null;
    if (!global.L) {
      var box = document.getElementById('map');
      if (box) box.innerHTML = '<div class="map-fallback">地图库未能加载。请检查文件是否完整。</div>';
      return null;
    }
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      minZoom: 3,
      maxZoom: 18,
      worldCopyJump: true,
      zoomSnap: 0.5
    });
    map.setView([29.56, 106.57], 11);
    layers.road = L.tileLayer(TILE.road, { subdomains: '1234', maxZoom: 18, detectRetina: false }).addTo(map);
    layers.sat = L.tileLayer(TILE.sat, { subdomains: '1234', maxZoom: 18 });
    map.on('zoomend', function () { relabelIfNeeded(); });
    return map;
  }

  function relabelIfNeeded() {
    if (!map || !layers.places) return;
    var z = map.getZoom();
    if (!layers.places.eachLayer) return;
    layers.places.eachLayer(function (m) {
      if (m._tip && m._tip._container) {
        m._tip._container.style.opacity = z >= 12 ? '1' : '0';
      }
    });
  }

  function setBase(kind) {
    if (!map) return;
    current.base = kind === 'sat' ? 'sat' : 'road';
    if (current.base === 'sat') {
      if (map.hasLayer(layers.road)) map.removeLayer(layers.road);
      layers.sat.addTo(map);
    } else {
      if (map.hasLayer(layers.sat)) map.removeLayer(layers.sat);
      layers.road.addTo(map);
    }
    var frame = document.getElementById('mapFrame');
    if (frame) frame.classList.toggle('is-sat', current.base === 'sat');
  }

  function setTraffic(on) {
    if (!map) return;
    if (on) {
      if (!layers.traffic) {
        layers.traffic = L.tileLayer(TILE.traffic, { maxZoom: 18, opacity: 0.75, className: 'traffic-tiles' });
      }
      layers.traffic.addTo(map);
      if (layers.traffic.bringToFront) layers.traffic.bringToFront();
    } else if (layers.traffic) {
      map.removeLayer(layers.traffic);
    }
  }

  function markerIcon(place, selected) {
    var cat = place.cat || '景点';
    var glyph = cat.indexOf('博物馆') >= 0 ? '博' :
      cat.indexOf('自然') >= 0 ? '山' :
        cat.indexOf('公园') >= 0 ? '园' :
          cat.indexOf('地标') >= 0 ? '标' :
            cat.indexOf('观景') >= 0 ? '景' :
              cat.indexOf('历史') >= 0 ? '史' : '点';
    var cls = 'pinmark' + (selected ? ' is-on' : '') + (place.kind === 'county' ? ' is-county' : '');
    return L.divIcon({
      className: 'pinhit',
      html: '<div class="' + cls + '" data-cat="' + U.esc(cat) + '"><span>' + glyph + '</span></div>',
      iconSize: [28, 34],
      iconAnchor: [14, 32]
    });
  }

  function renderPlaces(list) {
    if (!map) return;
    if (layers.places) { map.removeLayer(layers.places); layers.places = null; }
    markers.clear();
    var group = L.layerGroup();
    var named = [];
    (list || []).forEach(function (p) {
      if (p.lat == null || p.lng == null) return;
      var ll = GEO.toMap(p.lat, p.lng);
      var m = L.marker(ll, { icon: markerIcon(p), keyboard: false, riseOnHover: true });
      m.on('click', function () {
        select(p.id);
        if (hooks.onPickPlace) hooks.onPickPlace(p);
      });
      var tipHtml = '<b>' + U.esc(p.n) + '</b>' + (p.approx ? '<i>位置为县域近似中心</i>' : '') +
        '<em>' + U.esc(p.cat || '') + '</em>';
      m.bindTooltip(tipHtml, { direction: 'top', offset: [0, -28], className: 'maptip', opacity: 1 });
      group.addLayer(m);
      markers.set(p.id, m);
      named.push(m);
    });
    layers.places = group.addTo(map);
    relabelIfNeeded();
  }

  function renderPois(center, list) {
    if (!map) return;
    if (layers.pois) { map.removeLayer(layers.pois); layers.pois = null; }
    if (!list || !list.length) return;
    var group = L.layerGroup();
    list.forEach(function (p) {
      var ll = GEO.toMap(p.lat, p.lng);
      var dot = L.circleMarker(ll, {
        radius: 3.2, weight: 0, fillColor: '#2f6f63', fillOpacity: 0.5
      });
      dot.bindTooltip(U.esc(p.name) + '<i>' + U.esc(p.cat) + ' · ' + U.fmtDist(p.dist) + '</i>', {
        direction: 'top', className: 'maptip sm', opacity: 1
      });
      group.addLayer(dot);
    });
    layers.pois = group.addTo(map);
  }

  function boundaryStyle() {
    return { color: '#1f6f63', weight: 2, opacity: 0.85, fillColor: '#1f6f63', fillOpacity: 0.05, interactive: false };
  }

  function renderBoundary(geo) {
    if (!map) return null;
    if (layers.boundary) { map.removeLayer(layers.boundary); layers.boundary = null; }
    layers.approx = false;
    if (!geo) return null;
    layers.boundary = L.geoJSON(geo, {
      style: boundaryStyle,
      onEachFeature: function (f, layer) {
        var name = f.properties && (f.properties.name || f.properties.NAME);
        if (name) {
          layer.bindTooltip(String(name), { sticky: true, className: 'maptip geo', direction: 'center', opacity: 0.9 });
        }
      }
    }).addTo(map);
    return layers.boundary;
  }

  function setBoundaryVisible(on) {
    if (!map || !layers.boundary) return;
    if (on) layers.boundary.addTo(map);
    else map.removeLayer(layers.boundary);
  }

  function setPoiVisible(on) {
    if (!map) return;
    if (on && layers.pois) layers.pois.addTo(map);
    if (!on && layers.pois) map.removeLayer(layers.pois);
  }

  function fitAll() {
    if (!map) return;
    var pts = [];
    markers.forEach(function (m) { pts.push(m.getLatLng()); });
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.18), { animate: true });
      return;
    }
    if (layers.boundary && layers.boundary.getBounds && layers.boundary.getBounds().isValid()) {
      map.fitBounds(layers.boundary.getBounds(), { animate: true });
    }
  }

  function select(placeId) {
    markers.forEach(function (m, id) {
      if (m._icon) {
        var pin = m._icon.querySelector('.pinmark');
        if (pin) pin.classList.toggle('is-on', id === placeId);
      }
    });
  }

  function focusPlace(place, zoom) {
    if (!map || !place || place.lat == null) return;
    var ll = GEO.toMap(place.lat, place.lng);
    map.setView(ll, zoom || Math.max(map.getZoom(), 15), { animate: true });
    select(place.id);
  }

  function clearRoute() {
    if (layers.route) { map.removeLayer(layers.route); layers.route = null; }
  }

  function drawRoute(res, from, to) {
    if (!map || !res || !res.ok || !res.points || !res.points.length) return null;
    clearRoute();
    var pts = res.points.map(function (p) { return GEO.toMap(p[0], p[1]); });
    layers.route = L.layerGroup([
      L.polyline(pts, { color: '#c0683c', weight: 5, opacity: 0.9, lineJoin: 'round' }).addTo(map),
      L.circleMarker(pts[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#1f6f63', fillOpacity: 1 }).addTo(map),
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#c0683c', fillOpacity: 1 }).addTo(map)
    ]).addTo(map);
    map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: true });
    return layers.route;
  }

  function showCity(city, opts) {
    if (!map || !city) return Promise.resolve(null);
    opts = opts || {};
    var my = ++token;
    current.city = city;
    var ll = GEO.toMap(city.lat, city.lng);
    var zoom = city.level === 'destination' ? 11 : (city.level === 'city' ? 10 : 12);

    if (!opts.preserveView) map.setView(ll, zoom, { animate: true });
    clearRoute();

    var places = DATA.placesFor(city.name);
    renderPlaces(places);
    var pois = DATA.nearbyPois(city.lat, city.lng, city.level === 'destination' ? 9000 : 14000, 260);
    renderPois(ll, pois);
    current.places = places.length;
    current.pois = pois.length;
    current.hasCards = places.length > 0;

    var ad = city.adcode || 0;
    if (!ad) {
      if (layers.boundary) { map.removeLayer(layers.boundary); layers.boundary = null; }
      // 没有 adcode 的（多为已撤销的老区县、港澳台个别城市、镇级地名）画不出官方边界。
      // 退一步画一个范围圈：至少让人看到"这里大概多大一片"，而不是一片空白。
      renderApproxArea(ll, city);
      current.boundary = 'approx';
      if (!opts.preserveView) map.setView(ll, city.level === 'county' ? 11 : 10, { animate: true });
      return Promise.resolve({
        places: places.length, pois: pois.length, boundary: 'approx',
        radius: approxRadius(city.level)
      });
    }

    return NET.boundary(ad).then(function (geo) {
      if (my !== token) return null;          // 已被后续切换取代
      var ok = !!geo;
      if (ok) renderBoundary(geo);
      else renderApproxArea(ll, city);
      current.boundary = ok ? 'official' : 'approx';
      if (ok && layers.boundary && layers.boundary.getBounds().isValid() && !opts.preserveView) {
        map.fitBounds(layers.boundary.getBounds(), { animate: true, padding: [12, 12] });
      }
      return { places: places.length, pois: pois.length, boundary: current.boundary, adcode: ad };
    });
  }

  // 范围示意半径（米）：县 9km、市 30km、目的地 45km
  function approxRadius(level) {
    if (level === 'county') return 9000;
    if (level === 'destination') return 45000;
    return 30000;
  }

  function renderApproxArea(ll, city) {
    if (!map) return;
    if (layers.boundary) { map.removeLayer(layers.boundary); layers.boundary = null; }
    var r = (city && city.level === 'county') ? 9000 : ((city && city.level === 'destination') ? 45000 : 30000);
    layers.boundary = L.circle(ll, {
      radius: r, color: '#0f6b52', weight: 1.2, opacity: 0.55,
      fillColor: '#0f6b52', fillOpacity: 0.05, dashArray: '5 5', interactive: false
    }).addTo(map);
    layers.approx = true;
  }

  function invalidate() { if (map) setTimeout(function () { map.invalidateSize(); }, 60); }

  function getMap() { return map; }

  global.MAP = {
    init: init, showCity: showCity, setBase: setBase, setTraffic: setTraffic,
    setBoundaryVisible: setBoundaryVisible, setPoiVisible: setPoiVisible,
    fitAll: fitAll, focusPlace: focusPlace, select: select,
    drawRoute: drawRoute, clearRoute: clearRoute, invalidate: invalidate,
    current: function () { return current; }, getMap: getMap,
    boundaryLoaded: function () { return !!(layers && layers.boundary); }
  };
})(window);
