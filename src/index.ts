interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * OpenDota MCP — Dota 2 open stats.
 *
 * Hero meta (pick/win rates), recent professional matches, player search and
 * profiles (rank, win/loss). Keyless; free tier rate-limited (~60 req/min).
 */


const BASE = 'https://api.opendota.com/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'hero_stats',
    description:
      'Dota 2 hero meta: per-hero pick/win/ban counts in pro play, primary attribute, attack type, and roles. Optionally filter by role (e.g. "Carry", "Support"). OpenDota keyless data.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Optional role filter, e.g. "Carry", "Support", "Initiator".' },
        limit: { type: 'number', description: 'Max heroes to return (default 30).' },
      },
    },
  },
  {
    name: 'pro_matches',
    description:
      'Recent professional Dota 2 matches: teams, league, winner, score and duration. OpenDota keyless data.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max matches to return (default 20, max 100).' },
      },
    },
  },
  {
    name: 'search_players',
    description:
      'Search Dota 2 players by persona (display) name. Returns matching account IDs and similarity scores. OpenDota keyless data; may be empty if rate-limited.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Persona / display name to search for.' },
        limit: { type: 'number', description: 'Max players to return (default 10).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_player',
    description:
      'Dota 2 player profile by account ID: name, country, rank tier, leaderboard rank, and win/loss totals. OpenDota keyless data.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: ['number', 'string'], description: 'Steam32 account ID.' },
      },
      required: ['account_id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'hero_stats':
        return await heroStats(args);
      case 'pro_matches':
        return await proMatches(args);
      case 'search_players':
        return await searchPlayers(args);
      case 'get_player':
        return await getPlayer(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

class RateLimited extends Error {}

async function odGet(path: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (res.status === 429) throw new RateLimited('OpenDota rate limit; try again shortly');
  if (!res.ok) throw new Error(`OpenDota: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function heroStats(args: Record<string, unknown>): Promise<unknown> {
  try {
    const limit = numArg(args.limit, 30);
    const role = typeof args.role === 'string' && args.role.trim() ? args.role.trim().toLowerCase() : null;
    const res = await odGet('/heroStats');
    const data = (await res.json()) as Array<Record<string, unknown>>;
    let heroes = Array.isArray(data) ? data : [];
    if (role) {
      heroes = heroes.filter((h) => {
        const roles = Array.isArray(h.roles) ? (h.roles as unknown[]) : [];
        return roles.some((r) => typeof r === 'string' && r.toLowerCase() === role);
      });
    }
    const out = heroes.slice(0, limit).map((h) => ({
      id: h.id,
      name: h.localized_name,
      primary_attr: h.primary_attr,
      attack_type: h.attack_type,
      roles: h.roles,
      pro_pick: h.pro_pick,
      pro_win: h.pro_win,
      pro_ban: h.pro_ban,
    }));
    return { count: out.length, heroes: out };
  } catch (e) {
    if (e instanceof RateLimited) return { error: 'OpenDota rate limit; try again shortly' };
    throw e;
  }
}

async function proMatches(args: Record<string, unknown>): Promise<unknown> {
  try {
    const limit = Math.min(numArg(args.limit, 20), 100);
    const res = await odGet('/proMatches');
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const matches = Array.isArray(data) ? data : [];
    const out = matches.slice(0, limit).map((m) => ({
      match_id: m.match_id,
      league: m.league_name,
      radiant: m.radiant_name,
      dire: m.dire_name,
      radiant_win: m.radiant_win,
      score: `${m.radiant_score}-${m.dire_score}`,
      duration_min: Math.round(Number(m.duration) / 60),
    }));
    return { count: out.length, matches: out };
  } catch (e) {
    if (e instanceof RateLimited) return { error: 'OpenDota rate limit; try again shortly' };
    throw e;
  }
}

async function searchPlayers(args: Record<string, unknown>): Promise<unknown> {
  try {
    const name = reqStr(args, 'name');
    const limit = numArg(args.limit, 10);
    const res = await odGet(`/search?q=${encodeURIComponent(name)}`);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { count: 0, players: [], note: 'no results or rate-limited' };
    }
    if (!Array.isArray(data)) return { count: 0, players: [], note: 'no results or rate-limited' };
    const out = (data as Array<Record<string, unknown>>).slice(0, limit).map((p) => ({
      account_id: p.account_id,
      name: p.personaname,
      similarity: p.similarity,
    }));
    return { count: out.length, players: out };
  } catch (e) {
    if (e instanceof RateLimited) return { error: 'OpenDota rate limit; try again shortly' };
    throw e;
  }
}

async function getPlayer(args: Record<string, unknown>): Promise<unknown> {
  try {
    const id = reqStr(args, 'account_id');
    const enc = encodeURIComponent(id);
    const [pRes, wlRes] = await Promise.all([odGet(`/players/${enc}`), odGet(`/players/${enc}/wl`)]);
    const player = (await pRes.json()) as Record<string, unknown>;
    const wl = (await wlRes.json()) as Record<string, unknown>;
    const profile = player.profile as Record<string, unknown> | null | undefined;
    if (!profile) return { error: 'player not found', account_id: id };
    return {
      account_id: id,
      name: profile.personaname,
      country: profile.country_code,
      rank_tier: player.rank_tier,
      leaderboard_rank: player.leaderboard_rank,
      wins: wl?.win,
      losses: wl?.lose,
    };
  } catch (e) {
    if (e instanceof RateLimited) return { error: 'OpenDota rate limit; try again shortly' };
    throw e;
  }
}

function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing.`);
  return v.trim();
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
