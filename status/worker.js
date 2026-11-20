/**
 * UptimeRobot API 透明反代（方案 A）
 * 目标：https://api.uptimerobot.com/
 * 用法：POST https://你的worker域名/v2/getMonitors
 *       Content-Type: application/x-www-form-urlencoded
 *       body 原样转发（含 api_key）
 * 兼容：/uptimerobot/v2/getMonitors 会自动去掉前缀
 *
 * 可选环境变量 ALLOWED_ORIGIN：限制来源，留空则允许 *。
 */
const UPSTREAM = 'https://api.uptimerobot.com';

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env),
      });
    }

    const url = new URL(request.url);
    let path = url.pathname;
    if (path.startsWith('/uptimerobot/')) path = path.slice('/uptimerobot'.length);
    const target = UPSTREAM + path + url.search;

    const headers = new Headers(request.headers);
    headers.delete('Host'); // 交给 CF 重新设置

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });
    } catch (e) {
      return new Response(JSON.stringify({ stat: 'fail', error: { message: String(e) } }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
      });
    }

    // 回传响应 + CORS
    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(env))) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
