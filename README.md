# mcp-opendota

OpenDota MCP — Dota 2 open stats.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `hero_stats` | Dota 2 hero meta: per-hero pick/win/ban counts in pro play, primary attribute, attack type, and roles. Optionally filter by role (e.g. "Carry", "Support"). OpenDota keyless data. |
| `pro_matches` | Recent professional Dota 2 matches: teams, league, winner, score and duration. OpenDota keyless data. |
| `search_players` | Search Dota 2 players by persona (display) name. Returns matching account IDs and similarity scores. OpenDota keyless data; may be empty if rate-limited. |
| `get_player` | Dota 2 player profile by account ID: name, country, rank tier, leaderboard rank, and win/loss totals. OpenDota keyless data. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "opendota": {
      "url": "https://gateway.pipeworx.io/opendota/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Opendota data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
