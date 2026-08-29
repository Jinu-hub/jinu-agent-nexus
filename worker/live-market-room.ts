// ─────────────────────────────────────────────────────────────────────────
// LiveMarketRoomAgent — Market Pulse, a real-time poll room
// ─────────────────────────────────────────────────────────────────────────
//
// Product role: the lightweight interaction layer that sits under the
// "Today in 30 seconds" brief. Readers answer one market question and see
// everyone else's answer move in real time.
//
// Everything the room needs comes from ONE Agents SDK class:
//
//   state       — { question, options[], closed, … } synced to every tab
//   this.sql    — append-only vote log (option, time, voter city)
//   onConnect   — room-token auth; `?readonly=true` spectators
//   schedule()  — closePoll() fires at closesAt and freezes the tally
//
// We do NOT hand-roll a Durable Object here: `Agent` already owns the
// WebSocket lifecycle, hibernation, state broadcast, and alarms.
// ─────────────────────────────────────────────────────────────────────────

import {
  Agent,
  callable,
  getCurrentAgent,
  type Connection,
  type ConnectionContext,
} from "agents";

import {
  POLL_DURATION_SECONDS,
  UNAUTHORIZED_CLOSE_CODE,
} from "../src/lib/live-room";

export type PollOption = { id: string; label: string; votes: number };

export type PollState = {
  question: string;
  options: PollOption[];
  closed: boolean;
  /** Epoch ms at which closePoll() freezes the tally. */
  closesAt: number | null;
  /** Most recent voter cities, newest first — read from `request.cf`. */
  recentCities: string[];
};

export type RoomActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "readonly"
        | "closed"
        | "unknown_option"
        | "empty_label"
        | "duplicate_option"
        | "too_many_options";
    };

/** Per-connection state captured at upgrade time — `request.cf` is not
 *  available later, when RPC calls arrive over an established socket. */
type VoterState = { city: string | null; country: string | null };

const MAX_OPTIONS = 8;
const RECENT_CITY_LIMIT = 5;

// Fallback so the room works before anyone sets the secret. Set
// LIVE_ROOM_TOKEN in `.dev.vars` / `wrangler secret put` to override.
const DEV_ROOM_TOKEN = "market-pulse";

const INITIAL_POLL_STATE: PollState = {
  question: "Which signal matters most in today's market?",
  options: [
    { id: "ai-infra", label: "AI infrastructure", votes: 0 },
    { id: "semis", label: "Semiconductor supply", votes: 0 },
    { id: "macro", label: "Rates & macro", votes: 0 },
    { id: "biotech", label: "Biotech", votes: 0 },
  ],
  closed: false,
  closesAt: null,
  recentCities: [],
};

export class LiveMarketRoomAgent extends Agent<Env, PollState> {
  initialState: PollState = structuredClone(INITIAL_POLL_STATE);

  override async onStart() {
    void this.sql`CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id TEXT NOT NULL,
      option_label TEXT NOT NULL,
      city TEXT,
      country TEXT,
      connection_id TEXT,
      created_at TEXT NOT NULL
    )`;

    await this.ensureClosePollSchedule();
  }

  // ── Connection gate ─────────────────────────────────────────────────
  // Both hooks below run BEFORE onConnect: a spectator is already flagged
  // readonly by the time any RPC arrives, and an unauthenticated socket
  // never receives the identity / state frames the SDK would otherwise
  // push out ahead of our own check. Readonly connections DO get every
  // state broadcast — they just can't write.
  override shouldConnectionBeReadonly(
    _connection: Connection,
    ctx: ConnectionContext,
  ): boolean {
    return new URL(ctx.request.url).searchParams.get("readonly") === "true";
  }

  override shouldSendProtocolMessages(
    _connection: Connection,
    ctx: ConnectionContext,
  ): boolean {
    return this.hasValidToken(ctx.request);
  }

  override async onConnect(
    connection: Connection<VoterState>,
    ctx: ConnectionContext,
  ) {
    if (!this.hasValidToken(ctx.request)) {
      connection.close(UNAUTHORIZED_CLOSE_CODE, "invalid room token");
      return;
    }

    const cf = ctx.request.cf as
      | { city?: string; country?: string }
      | undefined;
    connection.setState({
      city: typeof cf?.city === "string" ? cf.city : null,
      country: typeof cf?.country === "string" ? cf.country : null,
    });
  }

  // ── Callable RPC surface ────────────────────────────────────────────

  @callable()
  async vote(optionId: string): Promise<RoomActionResult> {
    const connection = this.callerConnection();
    if (connection && this.isConnectionReadonly(connection)) {
      return { ok: false, reason: "readonly" };
    }
    if (this.state.closed) return { ok: false, reason: "closed" };

    const option = this.state.options.find((o) => o.id === optionId);
    if (!option) return { ok: false, reason: "unknown_option" };

    const voter = connection?.state ?? null;
    void this.sql`INSERT INTO votes
      (option_id, option_label, city, country, connection_id, created_at)
      VALUES (
        ${option.id},
        ${option.label},
        ${voter?.city ?? null},
        ${voter?.country ?? null},
        ${connection?.id ?? null},
        ${new Date().toISOString()}
      )`;

    this.setState({
      ...this.state,
      options: this.state.options.map((o) =>
        o.id === option.id ? { ...o, votes: o.votes + 1 } : o,
      ),
      recentCities: withRecentCity(this.state.recentCities, voter?.city ?? null),
    });

    return { ok: true };
  }

  @callable()
  async addOption(label: string): Promise<RoomActionResult> {
    const connection = this.callerConnection();
    if (connection && this.isConnectionReadonly(connection)) {
      return { ok: false, reason: "readonly" };
    }
    if (this.state.closed) return { ok: false, reason: "closed" };

    const text = label.trim().slice(0, 60);
    if (!text) return { ok: false, reason: "empty_label" };
    if (this.state.options.length >= MAX_OPTIONS) {
      return { ok: false, reason: "too_many_options" };
    }
    const exists = this.state.options.some(
      (o) => o.label.toLowerCase() === text.toLowerCase(),
    );
    if (exists) return { ok: false, reason: "duplicate_option" };

    this.setState({
      ...this.state,
      options: [
        ...this.state.options,
        { id: crypto.randomUUID(), label: text, votes: 0 },
      ],
    });

    return { ok: true };
  }

  @callable()
  async reset(): Promise<RoomActionResult> {
    const connection = this.callerConnection();
    if (connection && this.isConnectionReadonly(connection)) {
      return { ok: false, reason: "readonly" };
    }

    void this.sql`DELETE FROM votes`;
    await this.cancelClosePollSchedules();

    const closesAt = Date.now() + POLL_DURATION_SECONDS * 1000;
    this.setState({ ...structuredClone(INITIAL_POLL_STATE), closesAt });
    await this.schedule(new Date(closesAt), "closePoll");

    return { ok: true };
  }

  // ── Scheduled callback ──────────────────────────────────────────────

  /** Fired by the DO alarm at `closesAt`. Later votes are rejected. */
  async closePoll(): Promise<void> {
    if (this.state.closed) return;
    this.setState({ ...this.state, closed: true });
  }

  // ── Internals ───────────────────────────────────────────────────────

  private hasValidToken(request: Request): boolean {
    const configured = this.env.LIVE_ROOM_TOKEN?.trim();
    const expected = configured || DEV_ROOM_TOKEN;
    return new URL(request.url).searchParams.get("token") === expected;
  }

  /** The connection that issued the current RPC, if any. `request` is
   *  undefined in this context — only the connection is carried over. */
  private callerConnection(): Connection<VoterState> | undefined {
    return getCurrentAgent().connection as Connection<VoterState> | undefined;
  }

  /**
   * Runs on every DO wake. Opens the poll on first start, re-arms the
   * alarm if the instance hibernated with time left, and closes straight
   * away if the deadline passed while nobody was connected.
   */
  private async ensureClosePollSchedule(): Promise<void> {
    if (this.state.closed) return;

    const closesAt =
      this.state.closesAt ?? Date.now() + POLL_DURATION_SECONDS * 1000;

    if (closesAt <= Date.now()) {
      await this.closePoll();
      return;
    }
    if (this.state.closesAt !== closesAt) {
      this.setState({ ...this.state, closesAt });
    }

    // Idempotent: onStart runs on every wake, but the deadline is stable,
    // so this re-arms the alarm without stacking duplicate rows.
    await this.schedule(new Date(closesAt), "closePoll", undefined, {
      idempotent: true,
    });
  }

  private async cancelClosePollSchedules(): Promise<void> {
    for (const schedule of await this.listSchedules()) {
      if (schedule.callback === "closePoll") {
        await this.cancelSchedule(schedule.id);
      }
    }
  }
}

function withRecentCity(current: string[], city: string | null): string[] {
  if (!city) return current;
  return [city, ...current.filter((c) => c !== city)].slice(
    0,
    RECENT_CITY_LIMIT,
  );
}
