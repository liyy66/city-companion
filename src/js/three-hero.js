/* three-hero.js — 首页的三维「城市微缩模型」
 *
 * 只做视觉：可拖动旋转、滚轮缩放、切城市时重建天际线。
 * 尊重 prefers-reduced-motion，页面不可见时自动暂停渲染。
 */
(function (global) {
  'use strict';

  var renderer, scene, camera, group, buildings, edges, river, ring, dust, glow;
  var raf = 0, running = false, visible = true, reduced = false;
  var clock = null;
  var state = {
    seed: 1, targetH: [], curH: [], ready: false,
    az: -0.7, el: 0.5, dist: 15.6, targetDist: 15.6,
    dragging: false, lastX: 0, lastY: 0, auto: true
  };
  var N = 240;

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function palette() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? {
      bg: 0x0b1512, ground: 0x10201b, build1: 0x235049, build2: 0x5b9384,
      river: 0x2b6f86, ring: 0x4d8a7b, dust: 0x9fd8c6, glow: 0x2e7d6a
    } : {
      bg: 0xe8eee9, ground: 0xbfd0c6, build1: 0x8cac9f, build2: 0x27514a,
      river: 0x86b3c2, ring: 0x6f938a, dust: 0x2f5c50, glow: 0x8ec7b6
    };
  }

  function rng(seed) {
    var s = seed * 9301 + 49297;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function makeBuildings() {
    var geo = new THREE.BoxGeometry(1, 1, 1);
    // 注意：不要开 vertexColors —— InstancedMesh 的 setColorAt 走 instanceColor，
    // 开了 vertexColors 会去找几何体上并不存在的 color 属性，结果整片楼变黑。
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.66, metalness: 0.12, flatShading: true
    });
    var mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  function layout() {
    var r = rng(state.seed);
    var pal = palette();
    var c1 = new THREE.Color(pal.build1), c2 = new THREE.Color(pal.build2);
    var dummy = new THREE.Object3D();
    var col = new THREE.Color();
    var target = [];
    var base = [];

    for (var i = 0; i < N; i++) {
      // 极坐标抖动布点：中心密、外圈疏
      var t = i / N;
      var ang = r() * Math.PI * 2;
      var rad = Math.pow(r(), 0.62) * 5.1 + 0.35;
      var x = Math.cos(ang) * rad;
      var z = Math.sin(ang) * rad;
      // 河道挖空
      if (Math.abs(z - Math.sin(x * 0.7) * 0.9) < 0.55) rad += 0.9;
      var h = 0.12 + Math.pow(1 - rad / 5.6, 1.6) * (0.5 + r() * 1.9);
      if (r() > 0.93) h += 1.2;
      var w = 0.16 + r() * 0.2;
      var sz = w * (0.8 + r() * 0.6);
      var ry = r() * Math.PI;
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(w, h, sz);
      dummy.rotation.set(0, ry, 0);
      dummy.updateMatrix();
      buildings.setMatrixAt(i, dummy.matrix);
      var mix = Math.min(1, 0.25 + h / 2.4);
      col.copy(c1).lerp(c2, mix).offsetHSL(0, 0, (r() - 0.5) * 0.06);
      buildings.setColorAt(i, col);
      target.push(h);
      base.push({ x: x, z: z, sx: w, sz: sz, ry: ry });
    }
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    state.targetH = target;
    state.base = base;
    if (state.curH.length !== target.length) state.curH = target.map(function () { return 0.001; });
  }

  function buildRiver() {
    var pts = [];
    for (var i = 0; i <= 24; i++) {
      var x = -6 + i * 0.5;
      pts.push(new THREE.Vector3(x, 0.06, Math.sin(x * 0.7) * 0.9));
    }
    var curve = new THREE.CatmullRomCurve3(pts);
    var g = new THREE.Group();
    // 河面收窄一点，更像穿城而过的江，而不是一条跑道
    var geo = new THREE.TubeGeometry(curve, 90, 0.3, 6, false);
    var mat = new THREE.MeshStandardMaterial({
      color: palette().river, roughness: 0.22, metalness: 0.4,
      transparent: true, opacity: 0.8
    });
    g.add(new THREE.Mesh(geo, mat));
    // 水面上的一道高光，给它一点流动感
    var hi = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 90, 0.045, 4, false),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
    );
    hi.position.y = 0.16;
    g.add(hi);
    return g;
  }

  // 盘面用一张径向渐变贴图：中心浅、边缘深，看起来像一块有厚度和光照的沙盘底座，
  // 而不是一枚被灯打爆的白盘子。
  function plateTexture(force) {
    if (state.plateTex && !force) return state.plateTex;
    if (state.plateTex && force) { state.plateTex.dispose(); state.plateTex = null; }
    var c = document.createElement('canvas');
    c.width = c.height = 512;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      g.addColorStop(0, '#1a332c');
      g.addColorStop(0.55, '#132722');
      g.addColorStop(0.92, '#0d1c18');
      g.addColorStop(1, '#0a1613');
    } else {
      g.addColorStop(0, '#e6efe8');
      g.addColorStop(0.5, '#d3e0d6');
      g.addColorStop(0.86, '#b6c9be');
      g.addColorStop(1, '#9fb5a9');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    state.plateTex = tex;
    return tex;
  }

  function buildRing() {
    var g = new THREE.Group();
    var pal = palette();
    // 盘面下方的柔和投影：让这座「城市模型」落在画面里，而不是漂着
    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(6.25, 64),
      new THREE.MeshBasicMaterial({
        color: document.documentElement.getAttribute('data-theme') === 'dark' ? 0x000000 : 0x14362b,
        transparent: true, opacity: 0.13, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.215;
    shadow.userData.role = 'shadow';
    g.add(shadow);

    var torus = new THREE.Mesh(
      new THREE.TorusGeometry(5.35, 0.028, 6, 120),
      new THREE.MeshBasicMaterial({ color: pal.ring, transparent: true, opacity: 0.65 })
    );
    torus.rotation.x = Math.PI / 2;
    torus.position.y = 0.055;
    torus.userData.role = 'ring';
    g.add(torus);

    // 两道内圈：给盘面一点尺度参照，空盘也不会显得空
    [2.3, 3.9].forEach(function (r, i) {
      var l = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.012, 4, 100),
        new THREE.MeshBasicMaterial({ color: pal.ring, transparent: true, opacity: i ? 0.2 : 0.28 })
      );
      l.rotation.x = Math.PI / 2;
      l.position.y = 0.045;
      l.userData.role = 'inner';
      g.add(l);
    });

    var base = new THREE.Mesh(
      new THREE.CylinderGeometry(5.9, 5.72, 0.22, 72, 1, false),
      new THREE.MeshStandardMaterial({ map: plateTexture(), color: 0xc6d6ca, roughness: 0.95, metalness: 0.02 })
    );
    base.position.y = -0.09;
    base.userData.role = 'base';
    g.add(base);

    // 盘沿一圈深色压边，避免整块高亮成一枚白盘子
    var lip = new THREE.Mesh(
      new THREE.TorusGeometry(5.86, 0.035, 6, 120),
      new THREE.MeshBasicMaterial({ color: pal.ring, transparent: true, opacity: 0.5 })
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.005;
    lip.userData.role = 'ring';
    g.add(lip);
    return g;

    // 盘沿一圈深色压边，避免整块高亮成一枚白盘子
    var lip = new THREE.Mesh(
      new THREE.TorusGeometry(5.86, 0.035, 6, 120),
      new THREE.MeshBasicMaterial({ color: pal.ring, transparent: true, opacity: 0.5 })
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.005;
    g.add(lip);
    return g;
  }

  function buildDust() {
    var r = rng(state.seed + 7);
    var pos = new Float32Array(420 * 3);
    for (var i = 0; i < 420; i++) {
      var a = r() * Math.PI * 2, rad = 1.2 + r() * 6.4;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = 0.3 + r() * 3.6;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: palette().dust, size: 0.045, transparent: true, opacity: 0.75,
      sizeAttenuation: true, depthWrite: false
    });
    return new THREE.Points(geo, mat);
  }

  function resize() {
    if (!renderer) return;
    var canvas = renderer.domElement;
    var w = canvas.clientWidth || canvas.parentElement.clientWidth;
    var h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function applyCamera() {
    if (!camera) return;
    var d = state.dist;
    var el = Math.max(-0.15, Math.min(1.25, state.el));
    camera.position.set(
      Math.cos(state.az) * Math.cos(el) * d,
      Math.sin(el) * d + 1.2,
      Math.sin(state.az) * Math.cos(el) * d
    );
    camera.lookAt(0, 0.62, 0);
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!visible || !renderer) return;

    // 建筑生长
    var changed = false;
    for (var i = 0; i < N; i++) {
      var th = state.targetH[i] || 0.1;
      var cur = state.curH[i];
      if (Math.abs(cur - th) > 0.002) {
        state.curH[i] = cur + (th - cur) * 0.085;
        changed = true;
      }
    }
    if (changed && state.base) {
      var dummy = frame.dummy || (frame.dummy = new THREE.Object3D());
      for (var j = 0; j < N; j++) {
        var b = state.base[j];
        var h = Math.max(0.001, state.curH[j]);
        dummy.position.set(b.x, h / 2, b.z);
        dummy.scale.set(b.sx, h, b.sz);
        dummy.rotation.set(0, b.ry, 0);
        dummy.updateMatrix();
        buildings.setMatrixAt(j, dummy.matrix);
      }
      buildings.instanceMatrix.needsUpdate = true;
    }

    if (state.auto && !state.dragging && !reduced) {
      state.az += 0.0016;
      applyCamera();
    }
    if (Math.abs(state.dist - state.targetDist) > 0.01) {
      state.dist += (state.targetDist - state.dist) * 0.12;
      applyCamera();
    }
    if (dust) dust.rotation.y += 0.0006;
    if (group) group.position.y = Math.sin(performance.now() / 2600) * 0.035;
    if (glow) {
      var s = 1 + Math.sin(performance.now() / 1800) * 0.03;
      glow.scale.set(s, s, s);
    }
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    frame();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function bindPointer(canvas) {
    var down = false, px = 0, py = 0;
    canvas.addEventListener('pointerdown', function (e) {
      down = true; state.dragging = true; px = e.clientX; py = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      state.auto = false;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      state.az -= dx * 0.006;
      state.el = Math.max(-0.1, Math.min(1.2, state.el + dy * 0.005));
      applyCamera();
    });
    var up = function () { down = false; state.dragging = false; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.targetDist = Math.max(8, Math.min(26, state.targetDist + e.deltaY * 0.012));
      state.auto = false;
    }, { passive: false });
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', function () { canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointerup', function () { canvas.style.cursor = 'grab'; });
  }

  function init() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    if (!global.THREE) return;
    reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) {
      console.warn('WebGL 不可用', e);
      return;
    }
    renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.97;

    scene = new THREE.Scene();
    var pal = palette();
    scene.fog = new THREE.Fog(pal.bg, 16, 34);

    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    applyCamera();

    scene.add(new THREE.HemisphereLight(0xffffff, pal.bg, 1.0));
    var key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(6, 10, 5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(pal.glow, 0.9);
    rim.position.set(-7, 4, -6);
    scene.add(rim);

    group = new THREE.Group();
    scene.add(group);

    buildings = makeBuildings();
    group.add(buildings);
    river = buildRiver();
    group.add(river);
    ring = buildRing();
    scene.add(ring);
    dust = buildDust();
    scene.add(dust);

    glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 18),
      new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.16 })
    );
    glow.position.set(0, 0.5, 0);
    group.add(glow);

    layout();
    resize();
    state.ready = true;

    bindPointer(canvas);
    if (global.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
    else global.addEventListener('resize', resize);

    if ('IntersectionObserver' in global) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.05 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
    });

    start();
    // 让建筑有个生长动画
    state.curH = state.targetH.map(function () { return 0.001; });
  }

  /** 切换城市：换一套天际线 + 换色 */
  function setCity(name, seed) {
    if (!state.ready) return;
    state.seed = Math.abs(Math.floor((seed || hash(String(name || 'city'))) * 100000)) % 100000 + 1;
    layout();
    var pal = palette();
    if (scene) scene.fog.color.setHex(pal.bg);
    if (river && river.children[0]) river.children[0].material.color.setHex(pal.river);
    if (dust) dust.material.color.setHex(pal.dust);
    if (glow) glow.material.color.setHex(pal.glow);
    if (ring) {
      ring.children.forEach(function (c) {
        if (!c.material || !c.material.color) return;
        var role = c.userData && c.userData.role;
        if (role === 'shadow') return;                    // 投影保持深色，不跟着换主题
        if (role === 'base') {                            // 底座走径向渐变贴图，随主题重建
          c.material.map = plateTexture(true);
          c.material.needsUpdate = true;
          return;
        }
        else c.material.color.setHex(pal.ring);
      });
    }
  }

  function refreshTheme() { setCity((global.__heroCity || '重庆'), null); }

  global.HERO = {
    init: init, setCity: setCity, refreshTheme: refreshTheme,
    ready: function () { return state.ready; },
    pause: stop, resume: start
  };
})(window);
