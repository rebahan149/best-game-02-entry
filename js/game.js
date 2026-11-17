/*
 * Gleamward — Seven Nights of Light.
 *
 * A light-beam defense game in vanilla JS + Canvas 2D. A hearth-lantern on
 * the left of a dark field throws one beam of light. The player drags and
 * rotates mirror shards to bend that beam across the field and burn back
 * waves of shadow creatures that creep toward the hearth. Survive seven
 * seeded nights, spending the embers the shadows drop on upgrades between
 * nights. If the hearth's health reaches zero, the dark wins.
 *
 * Beam physics live in js/beam.js (window.BeamMath). No libraries, no
 * build step: open index.html and play.
 */
(function () {
  'use strict';

  var BM = window.BeamMath;

  // ---------------------------------------------------------------- RNG
  // mulberry32: tiny deterministic PRNG. Night spawn schedules are built
  // from it, so a given night always fields the same shadows in the same
  // order — runs are reproducible and comparable between players.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ constants
  var W = 960;
  var H = 600;
  var NIGHTS_TOTAL = 7;
  var RUN_SEED = 20261117;
  var HEARTH = { x: 84, y: 300, r: 26 };
  var LANTERN = { x: 122, y: 300 };
  var BASE_DPS = 30;
  var BASE_HALF_WIDTH = 7;
  var BASE_BOUNCES = 6;
  var BASE_BEAM_LEN = 2500;
  var BASE_HEARTH_HP = 100;

  // Shadow archetypes. hp/speed/dmg are multipliers or absolute values
  // tuned per night in buildNight().
  var TYPES = {
    shade: { hp: 20, speed: 27, r: 13, dmg: 6, embers: 1, color: '#2c2440' },
    swift: { hp: 11, speed: 49, r: 10, dmg: 4, embers: 2, color: '#37254d' },
    wisp: { hp: 16, speed: 36, r: 11, dmg: 6, embers: 3, color: '#24344d' },
    brute: { hp: 74, speed: 15, r: 21, dmg: 16, embers: 4, color: '#1d1830' }
  };

  // Upgrade catalogue. cost(level) = round(base * growth^level).
  var UPGRADES = {
    mirror: { label: 'New Mirror Shard', max: 4, base: 16, growth: 1.5,
      blurb: 'One more mirror to bend the beam with.' },
    power: { label: 'Hotter Flame', max: 8, base: 10, growth: 1.55,
      blurb: '+35% beam burn damage.' },
    width: { label: 'Wider Beam', max: 6, base: 9, growth: 1.5,
      blurb: '+3 beam thickness. Easier to hold shadows in the light.' },
    lens: { label: 'Polished Lens', max: 4, base: 12, growth: 1.7,
      blurb: '+1 reflection and +350 beam reach.' },
    plating: { label: 'Hearth Plating', max: 6, base: 10, growth: 1.5,
      blurb: '+25 max hearth health and mend 40 now.' },
    frost: { label: 'Frost Charm', max: 5, base: 11, growth: 1.6,
      blurb: 'All shadows creep 8% slower.' },
    repair: { label: 'Kindle the Hearth', max: 99, base: 6, growth: 1.25,
      blurb: 'Mend 30 hearth health right away.' }
  };

  // ------------------------------------------------------------- state
  var G = null;

  function defaultMirrors() {
    // A starter "periscope": two 45-degree shards lift the beam up and
    // send it across the top lane; a third shard waits lower-right.
    return [
      { x: 430, y: 300, angle: -Math.PI / 4, half: 27 },
      { x: 430, y: 108, angle: -Math.PI / 4, half: 27 },
      { x: 650, y: 452, angle: Math.PI / 3, half: 27 }
    ];
  }

  function resetGame() {
    G = {
      mode: 'title', // title | play | shop | win | lose
      paused: false,
      time: 0,
      night: 1,
      embers: 0,
      hearthHp: BASE_HEARTH_HP,
      hearthMax: BASE_HEARTH_HP,
      aim: 0,
      mirrors: defaultMirrors(),
      levels: { mirror: 0, power: 0, width: 0, lens: 0, plating: 0, frost: 0, repair: 0 },
      creatures: [],
      spawnQueue: [],
      spawnTimer: 0,
      particles: [],
      floaters: [],
      beam: null,
      litMirrors: [],
      selected: -1,
      hovered: -1,
      flareUntil: 0,
      flareCdUntil: 0,
      kills: 0,
      leaked: 0,
      flash: 0,
      banner: '',
      bannerUntil: 0,
      stars: []
    };
    var rng = mulberry32(987654321);
    for (var i = 0; i < 130; i++) {
      G.stars.push({ x: rng() * W, y: rng() * H, r: rng() * 1.4 + 0.3, tw: rng() * 6.28 });
    }
    window.GleamwardGame = G; // exposed for headless smoke tests
  }

  // Derived stats from upgrade levels.
  function beamDps() {
    var dps = BASE_DPS * Math.pow(1.35, G.levels.power);
    if (G.time < G.flareUntil) dps *= 2.2; // flaring: the flame surges
    return dps;
  }

  // Flare: burn 5 embers to surge the beam for a few seconds. The panic
  // button for the moment a brute is about to reach the hearth.
  var FLARE_COST = 5;
  var FLARE_DURATION = 3.5;
  var FLARE_COOLDOWN = 12;
  function tryFlare() {
    if (G.mode !== 'play' || G.paused) return;
    if (G.embers < FLARE_COST || G.time < G.flareCdUntil) return;
    G.embers -= FLARE_COST;
    G.flareUntil = G.time + FLARE_DURATION;
    G.flareCdUntil = G.time + FLARE_COOLDOWN;
    floater(LANTERN.x + 26, LANTERN.y - 22, 'FLARE!');
    burst(LANTERN.x, LANTERN.y, '#ffd98f', 16, 130);
  }
  function beamHalfWidth() { return BASE_HALF_WIDTH + 3 * G.levels.width; }
  function maxBounces() { return BASE_BOUNCES + G.levels.lens; }
  function maxBeamLen() { return BASE_BEAM_LEN + 350 * G.levels.lens; }
  function frostMult() { return Math.pow(0.92, G.levels.frost); }
  function upgradeCost(key) {
    var u = UPGRADES[key];
    return Math.round(u.base * Math.pow(u.growth, G.levels[key]));
  }

  // --------------------------------------------------------------- DOM
  var canvas, ctx;
  var el = {};

  function grab(id) { return document.getElementById(id); }

  function cacheDom() {
    canvas = grab('game');
    ctx = canvas.getContext('2d');
    el.title = grab('title-screen');
    el.shop = grab('shop');
    el.end = grab('end-screen');
    el.endTitle = grab('end-title');
    el.endText = grab('end-text');
    el.shopNight = grab('shop-night');
    el.shopEmbers = grab('shop-embers');
    el.nextNight = grab('next-night');
    el.shopMsg = grab('shop-msg');
  }

  function show(node, on) {
    if (!node) return;
    if (on) node.classList.remove('hidden');
    else node.classList.add('hidden');
  }

  // ------------------------------------------------------------- input
  var pointer = { x: 0, y: 0, down: false };
  var dragMirror = -1;
  var dragOffset = { x: 0, y: 0 };
  var aiming = false;
  var keys = {};

  function toField(evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (W / rect.width),
      y: (evt.clientY - rect.top) * (H / rect.height)
    };
  }

  function mirrorAt(x, y) {
    for (var i = G.mirrors.length - 1; i >= 0; i--) {
      var m = G.mirrors[i];
      var e = BM.mirrorEnds(m);
      var d = BM.pointSegment(x, y, e[0], e[1], e[2], e[3]).dist;
      if (d < 16 || Math.hypot(x - m.x, y - m.y) < 18) return i;
    }
    return -1;
  }

  function clampMirror(m) {
    m.x = Math.max(36, Math.min(W - 36, m.x));
    m.y = Math.max(36, Math.min(H - 36, m.y));
    // Keep mirrors from swallowing the lantern's mouth.
    var dx = m.x - LANTERN.x;
    var dy = m.y - LANTERN.y;
    var d = Math.hypot(dx, dy);
    if (d < 58 && d > 0.01) {
      m.x = LANTERN.x + (dx / d) * 58;
      m.y = LANTERN.y + (dy / d) * 58;
    }
  }

  function rotateSelected(step) {
    if (G.selected >= 0 && G.mirrors[G.selected]) {
      G.mirrors[G.selected].angle += step;
    }
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', function (evt) {
      var p = toField(evt);
      pointer.x = p.x; pointer.y = p.y; pointer.down = true;
      if (Math.hypot(p.x - LANTERN.x, p.y - LANTERN.y) < 36) {
        aiming = true;
        return;
      }
      var idx = mirrorAt(p.x, p.y);
      if (idx >= 0) {
        dragMirror = idx;
        G.selected = idx;
        dragOffset.x = G.mirrors[idx].x - p.x;
        dragOffset.y = G.mirrors[idx].y - p.y;
      }
    });

    canvas.addEventListener('pointermove', function (evt) {
      var p = toField(evt);
      pointer.x = p.x; pointer.y = p.y;
      if (aiming) {
        G.aim = Math.atan2(p.y - LANTERN.y, p.x - LANTERN.x);
      } else if (dragMirror >= 0) {
        var m = G.mirrors[dragMirror];
        m.x = p.x + dragOffset.x;
        m.y = p.y + dragOffset.y;
        clampMirror(m);
      } else {
        G.hovered = mirrorAt(p.x, p.y);
      }
    });

    function release() {
      pointer.down = false;
      aiming = false;
      dragMirror = -1;
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointerleave', release);

    canvas.addEventListener('wheel', function (evt) {
      var idx = G.hovered >= 0 ? G.hovered : G.selected;
      if (idx >= 0 && G.mirrors[idx]) {
        evt.preventDefault();
        G.mirrors[idx].angle += (evt.deltaY > 0 ? 1 : -1) * 0.055;
        G.selected = idx;
      }
    }, { passive: false });

    canvas.addEventListener('dblclick', function (evt) {
      var p = toField(evt);
      var idx = mirrorAt(p.x, p.y);
      if (idx >= 0) G.mirrors[idx].angle += Math.PI / 12;
    });

    window.addEventListener('keydown', function (evt) {
      keys[evt.key.toLowerCase()] = true;
      if (evt.key === 'q' || evt.key === 'Q') rotateSelected(-Math.PI / 60);
      if (evt.key === 'e' || evt.key === 'E') rotateSelected(Math.PI / 60);
      if (evt.key === 'f' || evt.key === 'F') tryFlare();
      if ((evt.key === 'p' || evt.key === 'P' || evt.key === 'Escape') && G.mode === 'play') {
        G.paused = !G.paused;
      }
    });
    window.addEventListener('keyup', function (evt) {
      keys[evt.key.toLowerCase()] = false;
    });

    grab('btn-start').addEventListener('click', function () {
      show(el.title, false);
      startNight(1);
    });
    grab('btn-restart').addEventListener('click', function () {
      show(el.end, false);
      resetGame();
      startNight(1);
    });
    grab('btn-next').addEventListener('click', function () {
      show(el.shop, false);
      startNight(G.night + 1);
    });
    grab('btn-rot-l').addEventListener('click', function () { rotateSelected(-Math.PI / 36); });
    grab('btn-rot-r').addEventListener('click', function () { rotateSelected(Math.PI / 36); });
    grab('btn-pause').addEventListener('click', function () {
      if (G.mode === 'play') G.paused = !G.paused;
    });
    grab('btn-flare').addEventListener('click', tryFlare);

    var upButtons = document.querySelectorAll('.up');
    for (var i = 0; i < upButtons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { buy(btn.getAttribute('data-up')); });
      })(upButtons[i]);
    }
  }
