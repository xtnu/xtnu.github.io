
(function () {
  'use strict';

  const C = window.Config;
  const $ = (sel) => document.querySelector(sel);

  // ---------- 运行时状态 ----------
  const state = {
    period: C.DefaultPeriod,
    theme: localStorage.getItem('us-theme') || 'auto',
    monitors: [],     // 计算结果（扁平），每项带 _group 分组信息
    raw: [],          // 原始 monitor
    endpointUsed: '', // 本次实际命中的接口
    loading: false,
    loadFallback: false,   // 仅本次加载内降级；下次加载重新从官方开始
    groupView: C.GroupView !== false && C.Features.group !== false,
    collapsed: new Set(),  // 折叠的分组 id
    groups: [],            // 解析后的分组定义
    nextRefresh: 0,        // 当前缓存窗口过期时间戳（全局，不随操作重置）
    updatedAt: 0,          // 当前展示数据的缓存时间
    pendingHash: '',       // 首屏加载完成后要跳转的锚点
    timer: null,
    tickTimer: null,
  };

  // ---------- 本地缓存（全局固定时间窗，减少账户级限流） ----------
  const CACHE_KEY = 'us-cache-v1';
  function cacheTtlMs() { const v = Number(C.RefreshInterval); return v > 0 ? v * 1000 : 0; }
  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && typeof c.expiresAt === 'number' && c.periods && typeof c.periods === 'object') return c;
    } catch (e) {}
    return null;
  }
  function writeCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {} }
  function freshCache() { return { expiresAt: Date.now() + cacheTtlMs(), periods: {} }; }

  // ---------- 工具 ----------
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? (Math.floor(n * 100) / 100).toString() : '0';
  };
  const fmtDuration = (sec) => {
    let s = parseInt(sec, 10) || 0, m = 0, h = 0;
    if (s >= 60) { m = Math.floor(s / 60); s = s % 60; if (m >= 60) { h = Math.floor(m / 60); m = m % 60; } }
    let t = `${s} 秒`;
    if (m > 0) t = `${m} 分 ${t}`;
    if (h > 0) t = `${h} 小时 ${t}`;
    return t;
  };
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : '#'; } catch (e) { return '#'; } };
  const decodeHash = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

  // 兼容两种 key 写法：'mxxx' 或 { key:'mxxx', group:'api' }
  function normalizeKeys() {
    const raw = Array.isArray(C.ApiKeys) ? C.ApiKeys : (C.ApiKeys ? [C.ApiKeys] : []);
    return raw.map((k) => (typeof k === 'string' ? { key: k, group: '' } : { key: k.key, group: k.group || '' }))
              .filter((k) => k.key);
  }

  // 生成分组定义：显式 Groups 优先，未归类的 key 自动进“未分组”
  function resolveGroups(keys) {
    const defs = (Array.isArray(C.Groups) ? C.Groups : []).map((g) => ({
      id: String(g.id != null ? g.id : (g.name || '')),
      name: String(g.name || g.id || '未命名'),
    }));
    const needUngrouped = keys.some((k) => !k.group || !defs.some((g) => g.id === k.group || g.name === k.group));
    if (needUngrouped && !defs.some((g) => g.id === 'ungrouped')) defs.push({ id: 'ungrouped', name: '未分组' });
    if (!defs.length) defs.push({ id: 'ungrouped', name: '未分组' });
    return defs;
  }
  function groupOf(gid) {
    return state.groups.find((g) => g.id === gid) || { id: 'ungrouped', name: '未分组' };
  }
  function keyGroup(k) {
    return state.groups.find((g) => g.id === k.group || g.name === k.group)
        || state.groups.find((g) => g.id === 'ungrouped')
        || { id: 'ungrouped', name: '未分组' };
  }

  // 北京时间今天 00:00 的 UNIX（秒）
  function beijingTodayStart() {
    const now = Date.now();
    return Math.floor((now + 8 * 3600 * 1000) / 86400000) * 86400000 / 1000 - 8 * 3600;
  }
  // unix(秒) -> 北京时间 YYYY-MM-DD
  function bjDate(unix) {
    const d = new Date((unix + 8 * 3600) * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function bjDateTime(unix) {
    const d = new Date((unix + 8 * 3600) * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  // 把 period 转成天数（24h 视为 1 天，但区间按 24 小时精确到秒）
  function periodDays(p) {
    if (p === '24h') return 1;
    const m = /^(\d+)d$/.exec(p);
    return m ? parseInt(m[1], 10) : 7;
  }

  // ---------- 构造时间分段（左新右旧） ----------
  // 24h -> 24 个小时段；Nd -> N 个自然日段（均为北京时间）
  function buildSegments(period) {
    const segs = [];
    const now = Math.floor(Date.now() / 1000);
    if (period === '24h') {
      for (let i = 0; i < 24; i++) {
        const end = now - i * 3600;
        const start = end - 3600;
        const dt = bjDateTime(start);
        segs.push({ start, end, label: dt.slice(11, 16), date: dt.slice(0, 16) });
      }
    } else {
      const days = periodDays(period);
      const todayStart = beijingTodayStart();
      for (let i = 0; i < days; i++) {
        const start = todayStart - i * 86400;
        const end = start + 86400;
        const date = bjDate(start);
        segs.push({ start, end, label: date.slice(5), date });
      }
    }
    return segs;
  }

  // ---------- 构造请求参数（参考原项目 GetMonitors） ----------
  function buildPostData(apikey, period) {
    const segs = buildSegments(period);
    const ranges = segs.map((s) => `${s.start}_${s.end}`);
    const start = Math.min.apply(null, segs.map((s) => s.start));
    const end = Math.max.apply(null, segs.map((s) => s.end));
    ranges.push(`${start}_${end}`); // 总区间放最后，供平均可用率使用

    return {
      api_key: apikey,
      format: 'json',
      logs: 1,
      log_types: '1-2',
      logs_start_date: start,
      logs_end_date: end,
      custom_uptime_ranges: ranges.join('-'),
      _period: period,
      _segments: segs,
    };
  }

  // ---------- 请求封装：每次先走官方，任意异常自动切反代 ----------
  // 降级只作用于“本次加载”，下次加载（翻页/自动刷新）会重新从官方开始。
  async function postWithFallback(postdata) {
    const isOfficial = (u) => u === C.ApiBase;
    const urls = state.loadFallback ? [C.ApiFallback, C.ApiBase] : [C.ApiBase, C.ApiFallback];
    let lastErr = null;

    for (const url of urls) {
      if (!url) continue;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), C.Timeout || 12000);
        let resp;
        try {
          resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(postdata).toString(),
            signal: ctrl.signal,
          });
        } finally { clearTimeout(t); }
        if (!resp.ok) throw new Error(resp.status === 429 ? 'HTTP 429（接口限流）' : 'HTTP ' + resp.status);
        const data = await resp.json();
        if (!data || data.stat !== 'ok') throw new Error((data && data.error && data.error.message) || '接口返回异常');
        if (isOfficial(url)) state.loadFallback = false; // 官方恢复，立即切回
        return { data, endpoint: url };
      } catch (e) {
        lastErr = e;
        if (isOfficial(url)) state.loadFallback = true; // 本次加载内后续请求走反代
        console.warn('[uptime] 接口请求失败：' + url + ' -> ' + e.message);
      }
    }
    throw lastErr || new Error('无可用接口');
  }

  // ---------- 解析：原始 monitor -> 展示结构 ----------
  function parseMonitor(m, meta) {
    const result = {
      id: m.id,
      name: m.friendly_name || ('Monitor ' + m.id),
      url: m.url || '',
      status: m.status === 2 ? 'ok' : (m.status === 9 ? 'down' : 'unknown'),
      average: '0',
      days: [],
      total: { times: 0, duration: 0 },
    };

    // 逐段可用率：ranges 与分段一一对应，最后一个是总区间
    const ranges = String(m.custom_uptime_ranges || '').split('-');
    result.average = fmtNum(ranges.pop());

    const segs = meta._segments || [];
    segs.forEach((seg, i) => {
      const up = ranges[i];
      result.days.push({
        date: seg.date,
        short: seg.label,
        start: seg.start,
        end: seg.end,
        uptime: (up === undefined || up === null || up === '') ? null : fmtNum(up),
        down: { times: 0, duration: 0 },
      });
    });

    // 日志：type 1 = 故障（down），按发生时间归入对应分段（北京时间）
    (m.logs || []).forEach((log) => {
      if (Number(log.type) !== 1) return;
      const dt = Number(log.datetime);
      const dur = Number(log.duration) || 0;
      result.total.times += 1;
      result.total.duration += dur;
      const bucket = result.days.find((d) => dt >= d.start && dt < d.end);
      if (bucket) { bucket.down.times += 1; bucket.down.duration += dur; }
    });
    return result;
  }

  // ---------- 拉取全部 key（带本地缓存） ----------
  // force=true 仅由页面内“刷新按钮”触发：强制重建缓存窗口并重新请求。
  // 其余情况（首屏 / F5 / 切周期 / 自动续期）：窗口未过期且有该周期缓存则直接用，不请求、不重置窗口。
  async function load(pPeriod, force) {
    if (state.loading) return;
    state.loading = true;
    state.period = pPeriod || state.period;
    state.groups = resolveGroups(normalizeKeys()); // 无论是否命中缓存都要有分组定义
    renderToolbar();

    let cache = readCache();
    const now = Date.now();
    const expired = !cache || now >= cache.expiresAt;
    if (force || expired) {
      cache = freshCache();   // 只有强制刷新或窗口到期才重建全局窗口
      writeCache(cache);
    }

    const cached = cache.periods[state.period];
    if (!force && cached) {
      applyLoaded(cached.monitors, cached.endpoint, cached.updatedAt, cache.expiresAt);
      return;
    }

    showLoading();
    state.loadFallback = false; // 真正发请求时才先从官方开始
    const keys = normalizeKeys();
    const results = await Promise.all(keys.map(async (k) => {
      const g = keyGroup(k);
      try {
        const postdata = buildPostData(k.key, state.period);
        const { data, endpoint } = await postWithFallback(postdata);
        state.endpointUsed = endpoint;
        return (data.monitors || []).map((m) => {
          const parsed = parseMonitor(m, postdata);
          parsed._group = { id: g.id, name: g.name };
          return parsed;
        });
      } catch (e) {
        return [{ error: e.message || '加载失败', _group: { id: g.id, name: g.name } }];
      }
    }));

    const monitors = results.flat();
    const updatedAt = Date.now();
    cache.periods[state.period] = { monitors, endpoint: state.endpointUsed, updatedAt };
    writeCache(cache);
    applyLoaded(monitors, state.endpointUsed, updatedAt, cache.expiresAt);
  }

  // 渲染一批已取得的数据（来自缓存或刚请求），统一收尾
  function applyLoaded(monitors, endpoint, updatedAt, expiresAt) {
    state.monitors = monitors;
    state.endpointUsed = endpoint || '';
    state.updatedAt = updatedAt || Date.now();
    state.nextRefresh = expiresAt || 0;
    state.loading = false;
    hideLoader();
    renderAll();
    $('#updated').textContent = '更新于 ' + bjDateTime(Math.floor(state.updatedAt / 1000)) + '（北京时间）';
    if (state.pendingHash) {
      const h = state.pendingHash; state.pendingHash = '';
      scrollToHash(h);
    }
  }

  // ============================================================
  // UI 渲染
  // ============================================================
  function renderAll() {
    renderBanner();
    renderSummary();
    renderList();
    renderTimeline();
    renderFooter();
    updateThemeBtn();
  }

  function statusText(s) { return { ok: '正常运行', down: '无法访问', unknown: '状态未知' }[s] || '状态未知'; }
  function statusIcon(s) {
    if (s === 'ok') return '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 16.2l-3.5-3.5L4 14.2 9 19 20 8l-1.4-1.4z"/></svg>';
    if (s === 'down') return '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 11 10.2 4.3 3.5l1.4-1.4 6.9 6.9 5.7-5.7z"/></svg>';
    return '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>';
  }

  function renderBanner() {
    const slot = $('#bannerSlot');
    if (!C.Features.banner) { slot.innerHTML = ''; return; }
    const all = state.monitors;
    const failed = all.filter((m) => m.error).length;
    const ms = all.filter((m) => !m.error);
    const down = ms.filter((m) => m.status === 'down').length;
    const unk = ms.filter((m) => m.status === 'unknown').length;
    const total = ms.length;
    let cls, title, sub, dotCls;
    if (failed === all.length && failed > 0) { cls = 'has-down'; title = '状态数据加载失败'; sub = '请检查接口地址或稍后重试'; dotCls = 'dot-unknown'; }
    else if (down === 0 && unk === 0) { cls = 'all-ok'; title = '所有服务运行正常'; sub = `已监控 ${total} 个服务节点`; dotCls = 'dot-ok'; }
    else if (down === 0) { cls = 'has-unknown'; title = '部分服务状态未知'; sub = `${unk} 个服务暂无数据`; dotCls = 'dot-unknown'; }
    else { cls = 'has-down'; title = `${down} 个服务当前异常`; sub = `共监控 ${total} 个服务节点`; dotCls = 'dot-down'; }
    $('#brandDot').className = 'brand-dot ' + dotCls;
    slot.innerHTML = `
      <div class="banner card ${cls}">
        <div class="banner-ico">${statusIcon(down ? 'down' : (unk ? 'unknown' : 'ok'))}</div>
        <div class="banner-txt"><h2>${title}</h2><p>${sub}</p></div>
        <div class="banner-badge">${total} 个监控</div>
      </div>`;
  }

  function renderSummary() {
    const slot = $('#summarySlot');
    if (!C.Features.uptimeCard) { slot.innerHTML = ''; return; }
    const ms = state.monitors.filter((m) => !m.error);
    if (!ms.length) { slot.innerHTML = ''; return; }
    const avgs = ms.map((m) => parseFloat(m.average)).filter(Number.isFinite);
    const avg = avgs.length ? (avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
    const ok = ms.filter((m) => m.status === 'ok').length;
    const periodLabel = (C.Periods.find((p) => p.value === state.period) || {}).label || '';
    slot.innerHTML = `
      <div class="summary-grid">
        <div class="stat card">
          <div class="stat-label">平均可用率</div>
          <div class="stat-value ok-text">${fmtNum(avg)}<small>%</small></div>
          <div class="stat-sub">最近 ${periodLabel}</div>
        </div>
        <div class="stat card">
          <div class="stat-label">运行中</div>
          <div class="stat-value">${ok}<small> / ${ms.length}</small></div>
          <div class="stat-sub">正常服务节点</div>
        </div>
        <div class="stat card">
          <div class="stat-label">故障事件</div>
          <div class="stat-value down-text">${ms.reduce((a, m) => a + m.total.times, 0)}<small> 次</small></div>
          <div class="stat-sub">累计 ${fmtDuration(ms.reduce((a, m) => a + m.total.duration, 0))}</div>
        </div>
      </div>`;
  }

  function monitorCard(m) {
    const days = m.days;
    const bars = days.map((d, i) => {
      const up = d.uptime === null ? null : parseFloat(d.uptime);
      let cls, tip;
      if (up === null) { cls = 'none'; tip = `${d.date} 无数据`; }
      else if (up >= 100 && d.down.times === 0) { cls = 'ok'; tip = `${d.date} · 可用率 ${fmtNum(up)}%`; }
      else if (up <= 0) { cls = 'down'; tip = `${d.date} · 不可用 · 可用率 ${fmtNum(up)}%`; }
      else { cls = 'down'; tip = `${d.date} · 故障 ${d.down.times} 次 · ${fmtDuration(d.down.duration)} · 可用率 ${fmtNum(up)}%`; }
      return `<i class="bar ${cls}" data-tip="${escHtml(tip)}" style="--i:${i}"></i>`;
    }).join('');

    const meta = m.total.times
      ? `故障 ${m.total.times} 次 · 累计 ${fmtDuration(m.total.duration)} · 平均 ${m.average}%`
      : `平均可用率 ${m.average}%`;
    const first = days[0] ? days[0].date : '';
    const last = days[days.length - 1] ? days[days.length - 1].date : '';
    const link = C.ShowLink && m.url
      ? `<a class="site-link" href="${safeUrl(m.url)}" target="_blank" rel="noopener" title="访问站点">
           <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zm5 11v5H5V5h5V3H3v18h18v-6z"/></svg>
         </a>` : '';

    return `<div class="card site" data-status="${m.status}">
      <div class="site-head">
        <div class="site-name">${escHtml(m.name)}</div>
        ${link}
        <div class="site-status status-${m.status}">${statusIcon(m.status)}<span>${statusText(m.status)}</span></div>
      </div>
      <div class="bars" aria-label="每日状态条">${bars}</div>
      <div class="site-foot">
        <span>${first}</span>
        <span class="site-meta">${meta}</span>
        <span>${last}</span>
      </div>
    </div>`;
  }

  function renderList() {
    const slot = $('#listSlot');
    if (state.monitors.some((m) => m.error)) {
      const err = state.monitors.find((m) => m.error).error;
      slot.innerHTML = `<div class="card empty-state">
        <h3>数据加载失败</h3>
        <p>${escHtml(err)}</p>
      </div>`;
      return;
    }
    if (!state.monitors.length) { slot.innerHTML = '<div class="card empty-state"><p>暂无监控数据</p></div>'; return; }

    if (!state.groupView) {
      slot.innerHTML = state.monitors.map(monitorCard).join('');
    } else {
      const byGroup = {};
      state.monitors.forEach((m) => {
        const gid = (m._group && m._group.id) || 'ungrouped';
        (byGroup[gid] = byGroup[gid] || []).push(m);
      });
      slot.innerHTML = state.groups.map((g) => {
        const list = byGroup[g.id] || [];
        if (!list.length) return '';
        const col = state.collapsed.has(g.id);
        const shareUrl = location.origin + location.pathname + '#' + encodeURIComponent(g.id);
        return `<section class="group ${col ? 'collapsed' : ''}" id="${escHtml(g.id)}"
                  data-gid="${escHtml(g.id)}" data-gname="${escHtml(g.name)}">
          <div class="group-head" data-group="${escHtml(g.id)}" aria-expanded="${!col}">
            <button type="button" class="group-toggle" data-group="${escHtml(g.id)}" aria-label="折叠/展开分组">
              <svg class="group-arrow" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
            <span class="group-name">${escHtml(g.name)}</span>
            <span class="group-count">${list.length} 个监控</span>
            <a class="group-share" href="${escHtml(shareUrl)}" data-share="${escHtml(shareUrl)}" title="复制分组直达链接" aria-label="复制分组直达链接">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zm5 11v5H5V5h5V3H3v18h18v-6z"/></svg>
            </a>
          </div>
          <div class="group-body">${list.map(monitorCard).join('')}</div>
        </section>`;
      }).join('');
    }

    bindBarTooltips();
  }

  // ---------- 分组交互 ----------
  function setGroupView(on) {
    state.groupView = !!on;
    localStorage.setItem('us-groupview', state.groupView ? '1' : '0');
    renderToolbar();
    renderList();
  }
  function applyGroupCollapse(gid, collapsed) {
    document.querySelectorAll('.group').forEach((el) => {
      if (el.dataset.gid !== gid) return;
      el.classList.toggle('collapsed', collapsed);
      const head = el.querySelector('.group-head');
      if (head) head.setAttribute('aria-expanded', String(!collapsed));
    });
  }
  function toggleGroup(gid) {
    const next = !state.collapsed.has(gid);
    if (next) state.collapsed.add(gid); else state.collapsed.delete(gid);
    applyGroupCollapse(gid, next);
  }
  // 支持 index.html#分组ID 或 #分组名称（中文需 URL 编码，浏览器会自动处理）
  function scrollToHash(hash) {
    const raw = decodeHash(String(hash != null ? hash : location.hash).replace(/^#/, ''));
    if (!raw) return;
    let target = null;
    document.querySelectorAll('.group').forEach((el) => {
      if (!target && (el.id === raw || el.dataset.gid === raw || el.dataset.gname === raw)) target = el;
    });
    if (!target) return;
    if (state.collapsed.has(target.dataset.gid)) {
      state.collapsed.delete(target.dataset.gid);
      applyGroupCollapse(target.dataset.gid, false);
    }
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }

  function renderTimeline() {
    const slot = $('#timelineSlot');
    if (!C.Features.timeline) { slot.innerHTML = ''; return; }
    const events = [];
    state.monitors.filter((m) => !m.error).forEach((m) => {
      m.days.forEach((d) => {
        if (d.down.times > 0) events.push({ name: m.name, date: d.date, times: d.down.times, duration: d.down.duration, uptime: d.uptime });
      });
    });
    events.sort((a, b) => b.date.localeCompare(a.date));
    const top = events.slice(0, 8);
    if (!top.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="timeline card">
        <h3 class="sec-title">最近故障记录</h3>
        <ul class="timeline-list">
          ${top.map((e) => `<li>
            <span class="tl-dot"></span>
            <span class="tl-name">${escHtml(e.name)}</span>
            <span class="tl-detail">故障 ${e.times} 次 · ${fmtDuration(e.duration)} · 可用率 ${e.uptime}%</span>
            <time class="tl-date">${e.date}</time>
          </li>`).join('')}
        </ul>
      </div>`;
  }

  function renderFooter() {
    const showBadge = C.Features.badge !== false;
    const showJson = C.Features.json !== false;
    [$('#badgeBtn'), $('#mBadgeBtn')].forEach((b) => { if (b) b.style.display = showBadge ? '' : 'none'; });
    [$('#jsonBtn'), $('#mJsonBtn')].forEach((b) => { if (b) b.style.display = showJson ? '' : 'none'; });
    tickCountdown();
  }

  // ---------- 全局缓存倒计时（基于缓存的绝对过期时间，跨刷新持续） ----------
  let autoReloading = false;
  function tickCountdown() {
    const el = $('#refreshHint');
    const iv = Number(C.RefreshInterval) || 0;
    // 窗口到期：页面保持打开时自动重新缓存（不重置其他操作，只此一处触发续期）
    if (iv > 0 && state.nextRefresh > 0 && Date.now() >= state.nextRefresh && !state.loading && !autoReloading) {
      autoReloading = true;
      load(state.period).finally(() => { autoReloading = false; });
    }
    if (!el) return;
    if (C.Features.countdown === false || iv <= 0) { el.textContent = ''; return; }
    const left = Math.max(0, Math.ceil((state.nextRefresh - Date.now()) / 1000));
    const mm = pad(Math.floor(left / 60));
    const ss = pad(left % 60);
    const every = iv % 60 === 0 ? `${iv / 60} 分钟` : `${iv} 秒`;
    const ep = state.endpointUsed === C.ApiFallback ? '反代接口' : (state.endpointUsed ? '官方接口' : '');
    el.textContent = `每 ${every}自动刷新 · ${mm}:${ss} 后刷新${ep ? ' · 当前 ' + ep : ''}`;
  }

  // ---------- 移动端汉堡菜单 ----------
  function closeMenu() {
    const m = $('#mobileMenu');
    m.hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    const m = $('#mobileMenu');
    m.hidden = !m.hidden;
    $('#menuBtn').setAttribute('aria-expanded', String(!m.hidden));
  }

  function renderToolbar() {
    const seg = $('#periodSeg');
    if (!seg.childElementCount) {
      seg.innerHTML = C.Periods.map((p, i) =>
        `<input type="radio" name="period" id="period-${i}" value="${escHtml(p.value)}" ${p.value === state.period ? 'checked' : ''}>` +
        `<label for="period-${i}" data-p="${escHtml(p.value)}">${escHtml(p.label)}</label>`
      ).join('') + '<span class="seg-glider" aria-hidden="true"></span>';
      seg.style.setProperty('--seg-count', C.Periods.length);
      seg.addEventListener('change', (e) => {
        if (e.target && e.target.name === 'period') load(e.target.value);
      });
    }
    const idx = Math.max(0, C.Periods.findIndex((p) => p.value === state.period));
    seg.style.setProperty('--seg-index', idx);

    const gb = $('#groupBtn');
    if (!gb) return;
    if (C.Features.group === false) { gb.style.display = 'none'; return; }
    gb.style.display = '';
    gb.innerHTML = `<span>${state.groupView ? '平铺' : '分组'}</span>`;
    gb.title = state.groupView ? '改为平铺展示' : '改为分组展示';
  }

  function showLoading() {
    $('#listSlot').innerHTML = Array.from({ length: 3 }, () => `
      <div class="card site skeleton">
        <div class="sk-line w40"></div>
        <div class="sk-bars"></div>
        <div class="sk-line w60"></div>
      </div>`).join('');
    showLoader();
  }

  // ---------- 全局加载动画（XTN）----------
  let loaderHideTimer = null;
  function showLoader() {
    const el = $('#globalLoader');
    if (!el) return;
    clearTimeout(loaderHideTimer);
    el.hidden = false;
    // 强制回流后再加 class，确保淡入动画生效
    void el.offsetWidth;
    el.classList.add('show');
  }
  function hideLoader() {
    const el = $('#globalLoader');
    if (!el) return;
    el.classList.remove('show');
    loaderHideTimer = setTimeout(() => { el.hidden = true; }, 240);
  }

  // ---------- tooltip（点击/悬停，始终限制在视口内） ----------
  let tipEl = null;
  let tipHideTimer = null;
  function getTip() {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip-bubble'; document.body.appendChild(tipEl); }
    return tipEl;
  }
  function bindBarTooltips() {
    document.querySelectorAll('.bar[data-tip]').forEach((bar) => {
      bar.addEventListener('mouseenter', (e) => showTip(bar, e.clientX, e.clientY));
      bar.addEventListener('mousemove', (e) => positionTip(getTip(), e.clientX, e.clientY));
      bar.addEventListener('mouseleave', hideTip);
      // 触屏：点击数据条显示，点空白处隐藏
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        showTip(bar, e.clientX, e.clientY);
        clearTimeout(tipHideTimer);
        tipHideTimer = setTimeout(hideTip, 3200);
      });
    });
  }
  function showTip(bar, x, y) {
    const tip = getTip();
    tip.textContent = bar.dataset.tip;
    tip.style.opacity = '1';
    positionTip(tip, x, y);
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = '0'; }
  function positionTip(tip, clientX, clientY) {
    const gap = 10;
    const r = tip.getBoundingClientRect();
    let x = clientX - r.width / 2;
    let y = clientY - r.height - gap;
    // 夹在视口内，四周留 gap
    x = Math.max(gap, Math.min(x, innerWidth - r.width - gap));
    if (y < gap) y = clientY + 18; // 上方放不下，改到指针下方
    y = Math.max(gap, Math.min(y, innerHeight - r.height - gap));
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  // ---------- 主题 ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeBtn();
  }
  function updateThemeBtn() {
    const btn = $('#themeBtn');
    const sun = '<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const moon = '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const auto = '<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>';
    btn.innerHTML = { auto, light: sun, dark: moon }[state.theme] || auto;
    btn.title = '主题：' + { auto: '跟随系统', light: '浅色', dark: '深色' }[state.theme] + '（点击切换）';
  }
  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
    localStorage.setItem('us-theme', state.theme);
    applyTheme();
  }

  // ---------- 徽章 / JSON ----------
  function overallStatus() {
    const ms = state.monitors.filter((m) => !m.error);
    const down = ms.filter((m) => m.status === 'down').length;
    return down ? { label: `${down} SERVICES DOWN`, color: '#ef4444', key: 'down' }
                : { label: 'ALL SYSTEMS NORMAL', color: '#10b981', key: 'ok' };
  }
  function badgeSvg() {
    const s = overallStatus();
    const w = 220, h = 40;
    const color = s.key === 'down' ? '#e5484d' : '#4cc38a';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${s.label}">
  <rect width="${w}" height="${h}" rx="8" fill="#191c22"/>
  <circle cx="24" cy="20" r="7" fill="${color}"/>
  <text x="42" y="25" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="500" fill="#e8eaf0">${s.label}</text>
</svg>`;
  }
  function showModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modalMask').hidden = false;
  }
  function closeModal() { $('#modalMask').hidden = true; }

  // ---------- 徽章 / JSON ----------
  function openBadge() {
    const svg = badgeSvg();
    showModal('状态徽章', `<textarea class="code-box" readonly rows="7">${escHtml(svg)}</textarea>
      <button class="primary-btn copy-btn" data-copy="${escHtml(svg)}" type="button">复制代码</button>`);
    bindCopy();
  }
  function openJson() {
    const payload = {
      site: C.SiteName,
      updated_at: new Date().toISOString(),
      endpoint: state.endpointUsed,
      period: state.period,
      overall: overallStatus().key,
      monitors: state.monitors.filter((m) => !m.error).map((m) => ({
        name: m.name, url: m.url, status: m.status, average: m.average,
        incidents: m.total.times, downtime_seconds: m.total.duration,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    showModal('View JSON', `<textarea class="code-box" readonly rows="12">${escHtml(JSON.stringify(payload, null, 2))}</textarea>
      <a class="primary-btn" href="${url}" download="status.json" onclick="setTimeout(()=>URL.revokeObjectURL('${url}'),1000)">下载 status.json</a>`);
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $('#themeBtn').addEventListener('click', cycleTheme);
    $('#refreshBtn').addEventListener('click', () => load(state.period, true)); // 页面内刷新按钮：强制重建缓存
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalMask').addEventListener('click', (e) => { if (e.target === $('#modalMask')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeMenu(); } });
    document.addEventListener('click', () => hideTip());

    ['#badgeBtn', '#mBadgeBtn'].forEach((s) => { const el = $(s); if (el) el.addEventListener('click', () => { closeMenu(); openBadge(); }); });
    ['#jsonBtn', '#mJsonBtn'].forEach((s) => { const el = $(s); if (el) el.addEventListener('click', () => { closeMenu(); openJson(); }); });

    $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#mobileMenu') && !e.target.closest('#menuBtn')) closeMenu();
    });
    $('#mobileNavi').addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });

    const gb = $('#groupBtn');
    if (gb) gb.addEventListener('click', () => setGroupView(!state.groupView));
    $('#listSlot').addEventListener('click', (e) => {
      const share = e.target.closest('.group-share');
      if (share) { copyText(share.dataset.share).then((ok) => toast(ok ? '已复制分组直达链接' : '复制失败，请手动复制地址栏')); return; }
      const head = e.target.closest('.group-head');
      if (head) toggleGroup(head.dataset.group);
    });
    window.addEventListener('hashchange', () => {
      const raw = decodeHash(location.hash.replace(/^#/, ''));
      if (!raw || !state.groups.some((g) => g.id === raw || g.name === raw)) return;
      if (!state.groupView) setGroupView(true);
      scrollToHash();
    });
  }
  // 复制文本：优先 Clipboard API，失败回退到临时 textarea + execCommand
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function bindCopy() {
    document.querySelectorAll('.copy-btn').forEach((b) => {
      b.addEventListener('click', async () => {
        const ok = await copyText(b.dataset.copy);
        toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择');
      });
    });
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- 初始化 ----------
  function init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    $('#siteName').textContent = C.SiteName || '服务状态';
    document.title = (C.SiteName || '服务状态') + ' · Status';
    const navHtml = (C.Navi || []).map((n) => `<a href="${safeUrl(n.url)}" target="_blank" rel="noopener">${escHtml(n.text)}</a>`).join('');
    $('#navi').innerHTML = navHtml;
    $('#mobileNavi').innerHTML = navHtml;
    if (!C.Features.theme) $('#themeBtn').style.display = 'none';
    const savedGroup = localStorage.getItem('us-groupview');
    if (savedGroup !== null) state.groupView = savedGroup === '1';
    state.pendingHash = location.hash || '';
    applyTheme();
    renderToolbar();
    bind();
    // 首屏从缓存读过期时间，倒计时立即按全局窗口显示（F5 不重置）
    state.groups = resolveGroups(normalizeKeys());
    const c = readCache();
    const cacheAlive = c && Date.now() < c.expiresAt;
    state.nextRefresh = c ? c.expiresAt : 0;
    if (cacheAlive && c.periods[state.period]) {
      applyLoaded(c.periods[state.period].monitors, c.periods[state.period].endpoint,
                  c.periods[state.period].updatedAt, c.expiresAt);
    }
    tickCountdown();
    state.tickTimer = setInterval(tickCountdown, 1000);
    load(); // 无缓存或已过期才会真正请求；否则命中缓存直接返回
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
