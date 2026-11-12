/* boot.js — 启动：解析内嵌数据 → 建索引 → 地图 / 3D / 界面依次就绪 */
(function (global) {
  'use strict';

  function fatal(title, detail) {
    var box = document.createElement('div');
    box.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:99999', 'display:flex', 'align-items:center',
      'justify-content:center', 'padding:24px', 'background:#0d211e', 'color:#eaf4f1',
      'font:15px/1.7 "PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    ].join(';'));
    box.innerHTML = '<div style="max-width:640px">' +
      '<div style="font-size:20px;font-weight:700;margin-bottom:10px">' + title + '</div>' +
      '<div style="opacity:.8;white-space:pre-wrap">' + String(detail || '').replace(/[<>&]/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
      }) + '</div></div>';
    document.body.appendChild(box);
  }

  function readAtlas() {
    var node = document.getElementById('atlas-data');
    var raw = node ? node.textContent : '';
    if (raw && raw.indexOf('__ATLAS_DATA__') === -1 && raw.length > 200) {
      var data = JSON.parse(raw);
      // 先交给 data.js（它优先读 window.__ATLAS__），再释放 DOM 里的几 MB 字符串
      global.__ATLAS__ = data;
      node.textContent = '';
      if (node.parentNode) node.parentNode.removeChild(node);
      return data;
    }
    if (global.__ATLAS__) return global.__ATLAS__;
    throw new Error('页面里没有找到内嵌数据（#atlas-data）。如果你是在开发模式下直接打开 src/shell.html，请先运行 node tools/build.mjs 生成单文件版本。');
  }

  function start() {
    var t0 = performance.now();
    var atlas = readAtlas();

    DATA.build(atlas, global.__PHOTOS__ || null);
    var n = DATA.stats();
    if (!n.cities || !n.pois) throw new Error('数据不完整：城市 ' + n.cities + ' 条、点位 ' + n.pois + ' 条。');

    MAP.init({
      onPickPlace: function (place) {
        if (place && place.id) global.UI.openDetail(place);
      }
    });

    try {
      if (global.HERO) global.HERO.init();
    } catch (e) {
      console.warn('[hero] 3D 场景初始化失败，页面其余功能不受影响', e);
      var canvas = document.getElementById('heroCanvas');
      if (canvas) canvas.style.display = 'none';
    }

    global.UI.init();

    document.body.classList.add('is-ready');
    console.log('[城市安心游] 就绪 ' + Math.round(performance.now() - t0) + 'ms · ' +
      n.cities + ' 城 / ' + n.pois + ' 点位 / ' + n.places + ' 景点卡 / ' + n.photos + ' 实拍');

    global.__APP__ = {
      DATA: DATA, MAP: MAP, HERO: global.HERO, UI: global.UI, AI: global.AI, KB: KB, NET: NET, CFG: CFG,
      version: CFG.build()
    };
  }

  function again() {
    try {
      start();
    } catch (e) {
      console.error(e);
      fatal('页面没能启动', (e && e.stack) || e);
    }
  }

  global.addEventListener('error', function (e) {
    if (!e || !e.message) return;
    if (global.U && U.toast) U.toast('脚本报错：' + e.message, 'error');
  });
  global.addEventListener('unhandledrejection', function (e) {
    var msg = e && e.reason && (e.reason.message || e.reason);
    if (msg && global.U && U.toast) U.toast('请求失败：' + msg, 'error');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', again);
  else again();
})(window);
