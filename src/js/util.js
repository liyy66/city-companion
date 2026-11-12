/* util.js — 基础工具，无依赖 */
(function (global) {
  'use strict';

  var doc = global.document;

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  function el(tag, attrs) {
    var node = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset') { for (var d in v) node.dataset[d] = v[d]; }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) { kid.forEach(function (x) { if (x != null) node.appendChild(x); }); }
      else if (typeof kid === 'string' || typeof kid === 'number') node.appendChild(doc.createTextNode(String(kid)));
      else node.appendChild(kid);
    }
    return node;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    n = Number(n);
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + ' 万';
    return n.toLocaleString('zh-CN');
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 160);
    };
  }

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371008.8, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function fmtDist(m) {
    if (m == null || isNaN(m)) return '';
    if (m < 950) return Math.round(m / 10) * 10 + ' 米';
    return (m / 1000).toFixed(m < 9500 ? 1 : 0) + ' 公里';
  }

  function store(key, val) {
    var P = 'ax.v1.';
    try {
      if (arguments.length === 1) {
        var raw = global.localStorage.getItem(P + key);
        return raw == null ? null : JSON.parse(raw);
      }
      if (val === null || val === undefined) global.localStorage.removeItem(P + key);
      else global.localStorage.setItem(P + key, JSON.stringify(val));
      return val;
    } catch (e) { return null; }
  }

  function storeClear() {
    try {
      var P = 'ax.v1.', kill = [];
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (k && k.indexOf(P) === 0) kill.push(k);
      }
      kill.forEach(function (k) { global.localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  var toastTimer = 0;
  function toast(msg, kind) {
    var box = $('#toast');
    if (!box) return;
    box.textContent = msg;
    box.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = ''; }, kind === 'error' ? 4600 : 2800);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function fmtDate(d) {
    if (!d) return '';
    return String(d).replace(/-/g, '.');
  }

  function today() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function hostOf(url) {
    try { return new URL(url, global.location.href).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function hostLabel(url) {
    var h = hostOf(url);
    var map = {
      'gov.cn': '政府网站', 'mct.gov.cn': '文化和旅游部', 'mem.gov.cn': '应急管理部',
      'amap.com': '高德地图', 'uri.amap.com': '高德地图', 'map.baidu.com': '百度地图',
      'commons.wikimedia.org': '维基共享资源', 'zh.wikipedia.org': '维基百科',
      'weixin.sogou.com': '微信公众号检索', 'mp.weixin.qq.com': '微信公众号',
      'douyin.com': '抖音', 'xiaohongshu.com': '小红书', 'mafengwo.cn': '马蜂窝',
      'ctrip.com': '携程', 'qunar.com': '去哪儿', 'dianping.com': '大众点评'
    };
    if (map[h]) return map[h];
    if (/\.gov\.cn$/.test(h)) return '政府网站';
    if (/\.edu\.cn$/.test(h)) return '教育机构';
    return h || '来源';
  }

  /* 简易 unicode 安全的截断 */
  function cut(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function whenIdle(fn, t) {
    if ('requestIdleCallback' in global) global.requestIdleCallback(fn, { timeout: t || 1200 });
    else setTimeout(fn, 60);
  }

  global.U = {
    $: $, $$: $$, el: el, esc: esc, fmtNum: fmtNum, clamp: clamp, debounce: debounce,
    haversine: haversine, fmtDist: fmtDist, store: store, storeClear: storeClear,
    toast: toast, sleep: sleep, fmtDate: fmtDate, today: today,
    hostOf: hostOf, hostLabel: hostLabel, cut: cut, whenIdle: whenIdle
  };
})(window);
