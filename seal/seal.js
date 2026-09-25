/*!
 * 印章平台 seal.js v1.4 —— 零后端、零存储的网页印章
 *
 * 用法（在网页任意位置插入一行）：
 *   <script src="https://www.521567.xyz/seal/seal.js" data-seal="BASE64数据串"></script>
 *   <script src="..." data-seals='["B64","B64"]'></script>          多章
 *   <script src="..." data-seal="B64" data-target="#box"></script>  指定容器
 *   <script src="..." data-seal="B64" data-size="140"></script>     自定义大小
 *   <script src="..." data-seal="B64" data-pos="float-br"></script> 摆放位置
 *
 * 摆放位置 data-pos（不填 = inline 跟随代码位置）：
 *   嵌入页面（随页面滚动）：inline 跟随代码位置 | top 页面顶部 | bottom 页面底部(页脚)
 *   悬浮屏幕（固定不随滚动）：float-br 右下(默认悬浮) | float-bl 左下 | float-tr 右上
 *     | float-tl 左上 | float-bc 底部居中 | float-tc 顶部居中 | float-ml 左侧居中
 *     | float-mr 右侧居中 | float-center 屏幕正中
 *   支持简写别名：rb/br、bl/lb、tr/rt、tl/lt、bc、tc、ml、mr、center/middle、
 *     top/head/page-top、bottom/foot/footer/page-bottom、inline/default/flow，
 *     大小写、空格、下划线均可（如 "Right_Bottom" → float-br）
 * 可选属性：data-verify="验证页URL"  data-size="像素"（悬浮默认110 / 嵌入默认160）
 * 验证页默认取「本文件所在目录下的 check.html」，与 seal.js 同目录即可，无需配置。
 *
 * 印章数据字段：n=单位名称 d=绑定域名(|分隔) i=编号 t=签发时间 e=过期时间(0永久)
 *               m=隐藏留言 s=章面下标文字 st=样式(official/paw/smile/bolt/heart)
 * 注意：本文件是纯 JS，首尾绝不能包 <script> 标签！
 */
(function () {
  "use strict";

  var DEFAULT_BASE = "https://www.521567.xyz/seal/";
  var _script = document.currentScript;
  var VERIFY =
    (_script && _script.dataset.verify) ||
    (_script && _script.src
      ? new URL("check.html", _script.src).href
      : DEFAULT_BASE + "check.html");

  /* ---------- base64（URL-safe 变体，支持中文） ---------- */
  function b64e(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64d(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(escape(atob(s)));
  }

  /* ---------- 数据解析 ---------- */
  function parse(str) {
    try {
      var o = JSON.parse(b64d(str));
      if (!o || typeof o.n !== "string" || !o.n) return null;
      return {
        n: String(o.n), d: String(o.d || ""), i: String(o.i || ""),
        t: +o.t || 0, e: +o.e || 0, m: String(o.m || ""), s: String(o.s || ""),
        st: String(o.st || "official")
      };
    } catch (e) { return null; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- 域名匹配（容忍大小写与首尾空格） ---------- */
  function matchDomain(patterns, host) {
    if (!host) return false;
    host = String(host).trim().toLowerCase();
    if (!host) return false;
    return String(patterns).split("|").some(function (p) {
      p = p.trim().toLowerCase();
      if (!p) return false;
      if (p.charAt(0) === "*" && p.charAt(1) === ".") {
        var base = p.slice(2);
        return host === base || host.slice(-(base.length + 1)) === "." + base;
      }
      return host === p;
    });
  }

  /* ---------- 状态判定 ---------- */
  function status(data, host) {
    if (host === null) return "preview";            // file:// 本地预览
    if (!matchDomain(data.d, host)) return "mismatch";
    if (data.e && Date.now() > data.e) return "expired";
    return "valid";
  }

  /* ---------- 摆放位置 ---------- */
  var FLOAT_POS = {
    "float-br": 1, "float-bl": 1, "float-tr": 1, "float-tl": 1,
    "float-bc": 1, "float-tc": 1, "float-ml": 1, "float-mr": 1, "float-center": 1
  };
  var POS_ALIAS = {
    "rb": "float-br", "br": "float-br", "right-bottom": "float-br", "bottom-right": "float-br",
    "bl": "float-bl", "lb": "float-bl", "left-bottom": "float-bl", "bottom-left": "float-bl",
    "tr": "float-tr", "rt": "float-tr", "right-top": "float-tr", "top-right": "float-tr",
    "tl": "float-tl", "lt": "float-tl", "left-top": "float-tl", "top-left": "float-tl",
    "bc": "float-bc", "bottom-center": "float-bc",
    "tc": "float-tc", "top-center": "float-tc",
    "ml": "float-ml", "lm": "float-ml", "left-middle": "float-ml", "middle-left": "float-ml",
    "mr": "float-mr", "rm": "float-mr", "right-middle": "float-mr", "middle-right": "float-mr",
    "mc": "float-center", "center": "float-center", "middle": "float-center",
    "screen-center": "float-center", "screen": "float-center",
    "inline": "inline", "default": "inline", "flow": "inline", "embed": "inline",
    "top": "top", "head": "top", "page-top": "top",
    "bottom": "bottom", "foot": "bottom", "footer": "bottom", "page-bottom": "bottom"
  };
  function normalizePos(raw) {
    var s = String(raw == null ? "" : raw).trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!s) return "inline";
    if (FLOAT_POS[s] || s === "inline" || s === "top" || s === "bottom") return s;
    return POS_ALIAS[s] || null;
  }
  /* 把章挂到页面上的对应位置 */
  function place(el, wrap, pos) {
    var b = document.body;
    if (!b || !el || !pos || pos === "inline") return;
    if (pos === "top") b.insertBefore(el, b.firstChild);
    else b.appendChild(el);                          /* bottom 与所有悬浮位 */
    if (FLOAT_POS[pos] && wrap) wrap.classList.add("sp-float", "sp-" + pos);
  }

  /* ---------- 中心图案库（娱乐向，避开官方徽标元素） ---------- */
  var STYLE_ICONS = {
    /* 正式章 · 五角星（保留作为可选样式） */
    official:
      '<path transform="translate(100,106) scale(2.2)" ' +
      'd="M0,-9 L2.7,-2.8 L9.4,-2.8 L4,1.5 L6,8 L0,4.2 L-6,8 L-4,1.5 -9.4,-2.8 L-2.7,-2.8 Z"/>',
    /* 猫爪章 */
    paw:
      "<g>" +
      '<ellipse cx="100" cy="111" rx="8.8" ry="7.2"/>' +
      '<ellipse cx="85.5" cy="96" rx="4.4" ry="5.6" transform="rotate(-24 85.5 96)"/>' +
      '<ellipse cx="94.5" cy="89.5" rx="4.4" ry="5.6" transform="rotate(-8 94.5 89.5)"/>' +
      '<ellipse cx="105.5" cy="89.5" rx="4.4" ry="5.6" transform="rotate(8 105.5 89.5)"/>' +
      '<ellipse cx="114.5" cy="96" rx="4.4" ry="5.6" transform="rotate(24 114.5 96)"/>' +
      "</g>",
    /* 笑脸章 */
    smile:
      "<g>" +
      '<circle cx="100" cy="102" r="14.5" fill="none" stroke="#b3272d" stroke-width="2.8"/>' +
      '<circle cx="94.5" cy="97.5" r="2.1"/>' +
      '<circle cx="105.5" cy="97.5" r="2.1"/>' +
      '<path d="M92.5,105.5 Q100,113.5 107.5,105.5" fill="none" stroke="#b3272d" ' +
      'stroke-width="2.8" stroke-linecap="round"/>' +
      "</g>",
    /* 闪电章 */
    bolt:
      '<path d="M103,84 L87,107 L97,107 L93,122 L113,97 L102,97 Z"/>',
    /* 爱心章 */
    heart:
      '<path d="M100,120 C92,112 85,105 85,98 C85,92 89,89 93,89 ' +
      'C96,89 99,91 100,94 C101,91 104,89 107,89 C111,89 115,92 115,98 ' +
      'C115,105 108,112 100,120 Z"/>'
  };
  var STYLE_NAMES = {
    official: "正式章（五角星）", paw: "猫爪章", smile: "笑脸章",
    bolt: "闪电章", heart: "爱心章"
  };
  function centerIcon(style) {
    return STYLE_ICONS[String(style || "official").toLowerCase()] || STYLE_ICONS.official;
  }

  /* ---------- 印章 SVG（纯代码，印泥质感用 filter 链） ---------- */
  var _uid = 0;
  function renderSVG(data, st, size) {
    size = size || 160;
    var id = "spf" + ++_uid;
    var rawName = String(data.n).slice(0, 24);
    var name = esc(rawName);
    var cap = esc(data.s || "网络专用").slice(0, 12);
    var code = esc(data.i).slice(0, 10);
    var marks = { mismatch: "域名不符", expired: "已过审验期", preview: "本地预览" };
    var mark = marks[st] || "";
    var markSVG = mark
      ? '<g transform="translate(100,100) rotate(-18)">'
        + '<rect x="-60" y="-17" width="120" height="34" fill="none" '
        + 'stroke="#b3272d" stroke-width="2"/>'
        + '<text x="0" y="8" text-anchor="middle" font-size="18" fill="#b3272d" '
        + 'font-family="KaiTi,STKaiti,serif" font-weight="bold">' + mark + "</text></g>"
      : "";

    /* 环形单位名称：居中于正上方（路径 25% 处），过长时整体等比缩小 */
    var wsum = 0;
    for (var ci = 0; ci < rawName.length; ci++) {
      var ch = rawName.charAt(ci);
      wsum += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.55;
    }
    var maxArc = 70 * Math.PI * 4 / 3;            /* 最长约横跨 240°，避免压到章底 */
    var k = wsum * 19 > maxArc ? maxArc / (wsum * 19) : 1;
    var fs = Math.round(15 * k * 100) / 100;
    var sp = Math.round(4 * k * 100) / 100;

    return (
      '<svg viewBox="0 0 200 200" width="' + size + '" height="' + size +
      '" role="img" aria-label="印章：' + name + '">' +
      "<defs>" +
      '<filter id="' + id + '" x="-20%" y="-20%" width="140%" height="140%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" result="d"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="d" scale="3" result="w"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 9 -3.4" result="k"/>' +
      '<feComposite in="w" in2="k" operator="in"/>' +
      "</filter>" +
      '<path id="' + id + 'r" d="M100,100 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0"/>' +
      "</defs>" +
      '<g filter="url(#' + id + ')" fill="#b3272d">' +
      '<circle cx="100" cy="100" r="92" fill="none" stroke="#b3272d" stroke-width="5"/>' +
      '<circle cx="100" cy="100" r="84" fill="none" stroke="#b3272d" stroke-width="1.5"/>' +
      /* 单位名称：环形文字，居中于顶部 */
      '<text font-size="' + fs + '" letter-spacing="' + sp + '" ' +
      'font-family="FangSong,STFangsong,SimSun,serif" fill="#b3272d">' +
      '<textPath href="#' + id + 'r" xlink:href="#' + id + 'r" startOffset="25%" ' +
      'text-anchor="middle">' + name + "</textPath></text>" +
      /* 中心图案（按印章样式） */
      centerIcon(data.st) +
      /* 印章编号：移至图案与下标文字之间，避免被环形名称遮挡 */
      (code ? '<text x="100" y="142" text-anchor="middle" font-size="9" letter-spacing="1" ' +
        'font-family="Times New Roman,serif" fill="#b3272d">NO.' + code + "</text>" : "") +
      '<text x="100" y="164" text-anchor="middle" font-size="11" letter-spacing="3" ' +
      'font-family="FangSong,STFangsong,SimSun,serif" fill="#b3272d">' + cap + "</text>" +
      "</g>" + markSVG + "</svg>"
    );
  }

  /* ---------- 样式注入 ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".sp-seal{display:inline-block;position:relative;line-height:0;vertical-align:middle}" +
    /* 无底色纯印章：不再用 multiply（深色背景会把章染黑），改轻微透明保留印泥感 */
    ".sp-seal svg{opacity:.92}" +
    ".sp-seal.sp-off svg{filter:grayscale(.85);opacity:.8}" +
    '.sp-seal-link{position:absolute;right:2px;bottom:2px;font:10px/1.4 "Microsoft YaHei",sans-serif;' +
    "color:#b3272d;text-decoration:none;opacity:.55;letter-spacing:1px;transition:opacity .2s}" +
    ".sp-seal-link:hover{opacity:1}" +
    /* 悬浮模式：无底色、无方框，纯印章悬浮；点击全部穿透到下层网页，
       仅「验真」小角标保留可点（不挡下层按钮/链接） */
    ".sp-float{position:fixed;z-index:2147483000;pointer-events:none}" +
    ".sp-float .sp-seal-link{pointer-events:auto}" +
    ".sp-float-br{right:16px;bottom:16px}" +
    ".sp-float-bl{left:16px;bottom:16px}" +
    ".sp-float-tr{right:16px;top:16px}" +
    ".sp-float-tl{left:16px;top:16px}" +
    ".sp-float-bc{left:50%;bottom:16px;transform:translateX(-50%)}" +
    ".sp-float-tc{left:50%;top:16px;transform:translateX(-50%)}" +
    ".sp-float-ml{left:16px;top:50%;transform:translateY(-50%)}" +
    ".sp-float-mr{right:16px;top:50%;transform:translateY(-50%)}" +
    ".sp-float-center{left:50%;top:50%;transform:translate(-50%,-50%)}";
  document.head.appendChild(css);

  /* ---------- 挂载（对外 API 与自动初始化共用） ---------- */
  function mount(el, sealStr, opts) {
    opts = opts || {};
    var data = typeof sealStr === "string" ? parse(sealStr) : sealStr;
    if (!data || !el) {
      if (el) el.innerHTML =
        '<div style="color:#b3272d;font:13px/1.8 FangSong,serif">印章数据无法解析</div>';
      return null;
    }
    var host = "host" in opts ? opts.host
      : (location.protocol === "file:" ? null : location.hostname);
    var st = status(data, host);

    /* 位置：仅在显式传入 opts.pos 时接管摆放（inline/top/bottom/float-*） */
    var pos = null;
    if ("pos" in opts) {
      pos = normalizePos(opts.pos);
      if (!pos) {
        pos = "inline";
        if (window.console) console.warn('[seal] 未知摆放位置 "' + opts.pos + '"，已按 inline 处理');
      }
    }
    var size = opts.size || (pos && FLOAT_POS[pos] ? 110 : 160);
    var str = typeof sealStr === "string" ? sealStr : b64e(JSON.stringify(data));

    var wrap = document.createElement("div");
    wrap.className = "sp-seal" + (st === "mismatch" || st === "expired" ? " sp-off" : "");
    wrap.innerHTML = renderSVG(data, st, size);

    var a = document.createElement("a");
    a.className = "sp-seal-link";
    a.target = "_blank";
    a.rel = "noopener";
    a.href = VERIFY + "?d=" + encodeURIComponent(host || String(data.d).split("|")[0]) +
      "&s=" + encodeURIComponent(str);
    a.textContent = "验真";
    wrap.appendChild(a);

    el.innerHTML = "";
    el.appendChild(wrap);
    if (pos) place(el, wrap, pos);
    return { data: data, status: st, el: el };
  }

  /* ---------- 自动初始化：扫描所有 script[data-seal] ---------- */
  function init() {
    var tags = document.querySelectorAll("script[data-seal],script[data-seals]");
    for (var i = 0; i < tags.length; i++) {
      var tag = tags[i];
      if (tag.getAttribute("data-sp-done")) continue;
      tag.setAttribute("data-sp-done", "1");

      var list = [];
      if (tag.dataset.seals) {
        try {
          var arr = JSON.parse(tag.dataset.seals);
          if (Array.isArray(arr)) arr.forEach(function (x) {
            list.push(typeof x === "string" ? x : b64e(JSON.stringify(x)));
          });
        } catch (e) {}
      }
      if (tag.dataset.seal) list.push(tag.dataset.seal);

      var size = parseInt(tag.dataset.size, 10) || 0;   /* 0 = 交给 mount 智能默认 */
      var pos = tag.dataset.pos || "inline";            /* 原始值交给 mount 统一归一化+告警 */
      var target = tag.dataset.target ? document.querySelector(tag.dataset.target) : null;
      /* 通过对外 API 调用，便于外部（如生成页预览）包装扩展 */
      var apiMount = (window.SealPlatform && window.SealPlatform.mount) || mount;

      list.forEach(function (s) {
        if (target) { apiMount(target, s, { size: size }); return; }
        var holder = document.createElement("div");
        var pn = tag.parentNode;
        if (pn && pn.nodeName !== "HEAD" && pn.nodeName !== "HTML") {
          pn.insertBefore(holder, tag.nextSibling);
        } else if (document.body) {
          document.body.appendChild(holder);
        }
        apiMount(holder, s, { size: size, pos: pos });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ---------- 对外 API ---------- */
  window.SealPlatform = {
    version: "1.4",
    base: DEFAULT_BASE,
    src: _script && _script.src ? new URL(_script.src, location.href).href : "",
    verify: VERIFY,
    parse: parse, b64e: b64e, b64d: b64d,
    matchDomain: matchDomain, status: status,
    styleNames: STYLE_NAMES,
    normalizePos: normalizePos,
    mount: mount, renderSVG: renderSVG
  };
})();
