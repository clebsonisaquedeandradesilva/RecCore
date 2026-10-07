// Ported from apps/notify/src/notifications-hub.ts; TypeScript types erased; native runtime imports.
import { DurableObject } from "../../../../runtime/cloudflare.js";
import { NotificationType } from "./notification-types.js";
const RS = "";
const OWNER_HEADER = "x-recflare-connection-owner";
function parsePlayerIds(args) {
  if (args === void 0 || args.length === 0) return [];
  const first = args[0];
  const candidate = typeof first === "object" && first !== null && !Array.isArray(first) ? first.playerIds : Array.isArray(first) ? first : args;
  if (!Array.isArray(candidate)) return null;
  const ids = candidate.map(
    (value) => typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  ).filter((value) => Number.isInteger(value));
  return ids.length === 0 && candidate.length > 0 ? null : ids;
}
const MAX_PENDING_PER_PLAYER = 500;
const COACH_PLAYER_ID = 1;
const COACH_MESSAGE_TYPE = 100;
class NotificationsHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS subscriptions (
					connectionId TEXT NOT NULL,
					playerId INTEGER NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_sub_conn ON subscriptions(connectionId);
				CREATE INDEX IF NOT EXISTS idx_sub_player ON subscriptions(playerId);
				CREATE TABLE IF NOT EXISTS pending (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					playerId INTEGER NOT NULL,
					payload TEXT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_pending_player ON pending(playerId);
				CREATE TABLE IF NOT EXISTS connection_owner (
					connectionId TEXT PRIMARY KEY,
					playerId INTEGER NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_owner_player ON connection_owner(playerId);
			`);
      this.pruneDeadConnections();
    }).catch((err) => {
      console.error("hub: storage init failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }
  /**
   * Drop connection rows with no socket behind them.
   *
   * A row is written when a socket is accepted and removed when it closes, so the two
   * only diverge when sockets die without `webSocketClose` running — which is exactly
   * what a Durable Object RESET does: the object is rebuilt, every socket is gone, and
   * `connection_owner` / `subscriptions` still name all of them.
   *
   * Left alone those rows are worse than useless. `deliverToPlayer` finds connection ids
   * for a player, sends to no sockets, and reports 0 delivered — so `notifyPlayer` QUEUES
   * for players who are online and reconnected long ago, and `pending` grows on every
   * notification the server sends. One reset then degrades delivery indefinitely.
   *
   * Safe at construction because hibernation does NOT lose sockets: `getWebSockets()`
   * returns them on wake, so anything missing from it is genuinely gone. And a row whose
   * socket has gone can never deliver anything anyway — dropping it costs nothing.
   */
  pruneDeadConnections() {
    const live = /* @__PURE__ */ new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment();
      if (state) live.add(state.connectionId);
    }
    const known = this.ctx.storage.sql.exec(
      `SELECT connectionId FROM connection_owner
				 UNION
				 SELECT connectionId FROM subscriptions`
    ).toArray().map((r) => r.connectionId);
    const dead = known.filter((connectionId) => !live.has(connectionId));
    if (dead.length === 0) return;
    for (const connectionId of dead) this.forgetConnection(connectionId);
    console.warn("hub: pruned connections with no live socket", {
      pruned: dead.length,
      live: live.size
    });
  }
  /** Forget one connection: its ownership row and everything it subscribed to. */
  forgetConnection(connectionId) {
    this.ctx.storage.sql.exec("DELETE FROM subscriptions WHERE connectionId = ?", connectionId);
    this.ctx.storage.sql.exec("DELETE FROM connection_owner WHERE connectionId = ?", connectionId);
  }
  /** WebSocket upgrade entrypoint — the worker forwards `/hub/v1` here. */
  async fetch(request) {
    if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade request", { status: 426 });
    }
    const url = new URL(request.url);
    const connectionId = url.searchParams.get("id") || crypto.randomUUID();
    const playerId = Number.parseInt(request.headers.get(OWNER_HEADER) ?? "", 10);
    if (!Number.isInteger(playerId)) {
      return new Response("Unidentified connection", { status: 401 });
    }
    const pair = new WebSocketPair();
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [connectionId]);
    server.serializeAttachment({
      connectionId,
      handshakeDone: false,
      playerId
    });
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO connection_owner (connectionId, playerId) VALUES (?, ?)",
      connectionId,
      playerId
    );
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws, message) {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const state = ws.deserializeAttachment();
    if (!state) return;
    for (const record of text.split(RS)) {
      if (record.length === 0) continue;
      if (!state.handshakeDone) {
        this.completeHandshake(ws, record, state);
        continue;
      }
      let msg;
      try {
        msg = JSON.parse(record);
      } catch {
        continue;
      }
      this.handleMessage(ws, state.connectionId, msg);
    }
  }
  async webSocketClose(ws) {
    const state = ws.deserializeAttachment();
    if (state) {
      this.forgetConnection(state.connectionId);
    }
    try {
      ws.close();
    } catch {
    }
  }
  // ---- SignalR protocol ----------------------------------------------------
  completeHandshake(ws, record, state) {
    let protocol = "json";
    try {
      protocol = JSON.parse(record).protocol ?? "json";
    } catch {
    }
    if (protocol !== "json") {
      ws.send(JSON.stringify({ error: `Unsupported protocol '${protocol}'` }) + RS);
      ws.close(1002, "unsupported protocol");
      return;
    }
    ws.send("{}" + RS);
    state.handshakeDone = true;
    ws.serializeAttachment(state);
    ws.send(this.invocation("OnConnect", []));
    if (state.playerId !== void 0) this.flushPending(ws, state.playerId);
  }
  /** Send and clear a player's queued notifications on `ws`. */
  flushPending(ws, playerId) {
    const pending = this.ctx.storage.sql.exec("SELECT payload FROM pending WHERE playerId = ? ORDER BY id", playerId).toArray();
    if (pending.length === 0) return;
    for (const row of pending) ws.send(this.invocation("Notification", [row.payload]));
    this.ctx.storage.sql.exec("DELETE FROM pending WHERE playerId = ?", playerId);
  }
  handleMessage(ws, connectionId, msg) {
    switch (msg.type) {
      case 1:
        this.handleInvocation(ws, connectionId, msg);
        break;
      case 6:
        ws.send(JSON.stringify({ type: 6 }) + RS);
        break;
      case 7:
        ws.close();
        break;
      default:
        break;
    }
  }
  handleInvocation(ws, connectionId, msg) {
    switch (msg.target) {
      case "SubscribeToPlayers": {
        const playerIds = parsePlayerIds(msg.arguments);
        if (playerIds === null) {
          console.warn("hub: unreadable SubscribeToPlayers argument", {
            connectionId,
            arguments: JSON.stringify(msg.arguments)
          });
        } else {
          this.subscribeToPlayers(ws, connectionId, playerIds);
        }
        if (msg.invocationId) ws.send(this.completion(msg.invocationId, null));
        break;
      }
      case "GetSubscriptions": {
        const players = this.getSubscribedPlayers(connectionId);
        if (msg.invocationId) ws.send(this.completion(msg.invocationId, players));
        break;
      }
      default:
        console.warn("hub: unknown invocation target", {
          connectionId,
          target: msg.target,
          arguments: JSON.stringify(msg.arguments)
        });
        if (msg.invocationId) {
          ws.send(this.completionError(msg.invocationId, `Unknown method '${msg.target}'`));
        }
        break;
    }
  }
  subscribeToPlayers(ws, connectionId, playerIds) {
    const unique = [...new Set(playerIds)];
    this.ctx.storage.sql.exec("DELETE FROM subscriptions WHERE connectionId = ?", connectionId);
    for (const playerId of unique) {
      this.ctx.storage.sql.exec(
        "INSERT INTO subscriptions (connectionId, playerId) VALUES (?, ?)",
        connectionId,
        playerId
      );
    }
    for (const playerId of unique) this.flushPending(ws, playerId);
  }
  /**
   * Every connection that receives notifications for a player. Two ways to qualify: the
   * connection *is* that player (established from the token at connect), or it
   * subscribed to them. The client only ever uses the first — it never calls
   * SubscribeToPlayers — so a player's own notifications reach them through
   * connection_owner, and subscriptions carry other players' updates.
   */
  connectionIdsFor(playerId) {
    return this.ctx.storage.sql.exec(
      `SELECT connectionId FROM connection_owner WHERE playerId = ?1
				UNION
				SELECT connectionId FROM subscriptions WHERE playerId = ?1`,
      playerId
    ).toArray().map((r) => r.connectionId);
  }
  getSubscribedPlayers(connectionId) {
    return this.ctx.storage.sql.exec(
      "SELECT DISTINCT playerId FROM subscriptions WHERE connectionId = ?",
      connectionId
    ).toArray().map((r) => r.playerId);
  }
  // ---- Server → client RPC (callable from other workers) -------------------
  /**
   * Send a notification to a player's connections, queueing it if the player
   * isn't currently connected (mirrors `SendNotificationToPlayer`).
   */
  async notifyPlayer(playerId, notificationType, data) {
    const payload = this.buildNotificationPayload(notificationType, data);
    const delivered = this.deliverToPlayer(playerId, payload);
    if (delivered === 0) {
      console.warn("hub: notification queued, nobody to deliver to", {
        playerId,
        notificationType,
        connectionIds: this.connectionIdsFor(playerId),
        liveSockets: this.ctx.getWebSockets().length
      });
    }
    if (delivered === 0) {
      this.queuePending(playerId, payload);
      return { delivered: 0, queued: true };
    }
    return { delivered, queued: false };
  }
  /**
   * Queue a notification for a player who wasn't reachable, keeping the queue to
   * {@link MAX_PENDING_PER_PLAYER}. Trimming is oldest-first and happens on the write, so
   * the bound holds no matter how the queue got long.
   */
  queuePending(playerId, payload) {
    this.ctx.storage.sql.exec(
      "INSERT INTO pending (playerId, payload) VALUES (?, ?)",
      playerId,
      payload
    );
    const trimmed = this.ctx.storage.sql.exec(
      `DELETE FROM pending
				 WHERE playerId = ?1 AND id NOT IN (
				   SELECT id FROM pending WHERE playerId = ?1 ORDER BY id DESC LIMIT ?2
				 )
				 RETURNING id`,
      playerId,
      MAX_PENDING_PER_PLAYER
    ).toArray().length;
    if (trimmed > 0) {
      console.warn("hub: pending queue full, dropped oldest notifications", {
        playerId,
        dropped: trimmed,
        cap: MAX_PENDING_PER_PLAYER
      });
    }
  }
  /**
   * Send a notification to a player's live sockets and, unlike {@link notifyPlayer},
   * NEVER queue it when they're offline — the ephemeral "SendWebsocket" send. For
   * high-frequency, transient frames whose value is gone by the next reconnect (the
   * presence heartbeat response, sent on every beat): queueing those would pile up
   * unbounded in `pending` and then deliver a burst of stale frames when the player
   * next connects. Returns how many live sockets received it (0 = nobody was
   * connected, and it was dropped rather than stored).
   */
  async notifyPlayerEphemeral(playerId, notificationType, data) {
    const payload = this.buildNotificationPayload(notificationType, data);
    return { delivered: this.deliverToPlayer(playerId, payload) };
  }
  /**
   * Ephemeral send (see {@link notifyPlayerEphemeral}) to many players at once — the
   * batch the presence fan-out needs. When a player changes rooms, every online friend
   * gets one SubscriptionUpdatePresence and an offline friend gets nothing (a SignalR
   * group send reaches only connected clients), so the same identical payload is built
   * once and delivered to each in a single RPC round-trip rather than one call per
   * friend. Returns the total live sockets reached across all of them.
   */
  async notifyPlayersEphemeral(playerIds, notificationType, data) {
    const payload = this.buildNotificationPayload(notificationType, data);
    let delivered = 0;
    for (const playerId of playerIds) delivered += this.deliverToPlayer(playerId, payload);
    return { delivered };
  }
  /**
   * Send a "coach" message to every connected client (mirrors the reference
   * `SendCoachMessageAll`, using the hub's live connections as the online set): each
   * handshaken socket gets a `MessageReceived` notification carrying a Message from
   * the Coach account (player 1). Online-only — nothing is queued or persisted, and
   * it's a broadcast, so the Message has no per-recipient `ToPlayerId`. Returns how
   * many connected clients were messaged.
   */
  async coachMessageAll(content) {
    const payload = this.buildNotificationPayload(NotificationType.MessageReceived, {
      FromPlayerId: COACH_PLAYER_ID,
      Type: COACH_MESSAGE_TYPE,
      Data: content
    });
    return { sent: this.broadcastToConnected(payload) };
  }
  /**
   * The targeted form of {@link coachMessageAll}: the same `MessageReceived` frame from
   * the Coach account (player 1), addressed to one player with a `ToPlayerId` — the shape
   * `api`'s player-to-player send uses.
   *
   * Takes the ALREADY-STORED message rather than building one, so the frame carries the
   * row's `Id` and `SentTime` and the player can read the same message back from
   * `GET /api/messages/v2/get`. The worker route writes the row (the DO has no business
   * doing D1 writes — every hub call funnels through this one global instance).
   *
   * Unlike the broadcast this one QUEUES when the recipient is offline (see
   * {@link notifyPlayer}). The broadcast is online-only because it has no recipient to
   * hold anything for — and, for the same reason, nothing to store: a message written to
   * a named player is worth keeping until they next connect.
   */
  async coachMessage(message) {
    return this.notifyPlayer(message.ToPlayerId, NotificationType.MessageReceived, {
      ...message
    });
  }
  /** Broadcast a notification to every connected (handshaken) client. */
  async broadcast(notificationType, data) {
    return {
      delivered: this.broadcastToConnected(this.buildNotificationPayload(notificationType, data))
    };
  }
  /**
   * Dump the hub's routing state for debugging delivery. A notification only reaches a
   * player through a `subscriptions` row (see {@link deliverToPlayer}), so when a push
   * doesn't arrive this answers the two questions that matter: is the player subscribed
   * on a live connection, and is the frame sitting in `pending` instead?
   *
   * Connections are listed even when one side is missing — a socket that has yet to
   * subscribe (`playerIds: []`) and a subscription set whose socket is gone
   * (`live: false`, a close we never saw) are both delivery failures worth seeing.
   */
  async inspect() {
    const live = /* @__PURE__ */ new Map();
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment();
      if (state) live.set(state.connectionId, state.handshakeDone);
    }
    const subscribed = /* @__PURE__ */ new Map();
    const rows = this.ctx.storage.sql.exec("SELECT connectionId, playerId FROM subscriptions ORDER BY connectionId, playerId").toArray();
    for (const row of rows) {
      const players = subscribed.get(row.connectionId) ?? [];
      players.push(row.playerId);
      subscribed.set(row.connectionId, players);
    }
    const owners = new Map(
      this.ctx.storage.sql.exec("SELECT connectionId, playerId FROM connection_owner").toArray().map((row) => [row.connectionId, row.playerId])
    );
    const connections = [.../* @__PURE__ */ new Set([...live.keys(), ...subscribed.keys(), ...owners.keys()])].map(
      (connectionId) => ({
        connectionId,
        live: live.has(connectionId),
        handshakeDone: live.get(connectionId) ?? false,
        playerId: owners.get(connectionId) ?? null,
        playerIds: subscribed.get(connectionId) ?? []
      })
    );
    const pending = this.ctx.storage.sql.exec(
      `SELECT playerId, COUNT(*) AS count,
					(SELECT payload FROM pending AS newest WHERE newest.playerId = pending.playerId
						ORDER BY id DESC LIMIT 1) AS latest
				FROM pending GROUP BY playerId ORDER BY playerId`
    ).toArray();
    return { connections, pending };
  }
  /**
   * Drop queued notifications — for one player, or (`playerId` omitted) the whole
   * queue. Anything pending is delivered the moment that player next subscribes, so a
   * frame queued by a bug that has since been fixed would otherwise arrive, out of
   * context, at the next reconnect. Returns how many were discarded.
   */
  async clearPending(playerId) {
    const [counted] = playerId === void 0 ? this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM pending").toArray() : this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM pending WHERE playerId = ?", playerId).toArray();
    if (playerId === void 0) this.ctx.storage.sql.exec("DELETE FROM pending");
    else this.ctx.storage.sql.exec("DELETE FROM pending WHERE playerId = ?", playerId);
    return { cleared: counted?.count ?? 0 };
  }
  // ---- Helpers -------------------------------------------------------------
  /**
   * Send an already-built `Notification` payload to every live socket of a player's
   * subscribed connections; returns how many sockets received it (0 = offline). The
   * shared send path for {@link notifyPlayer} and {@link coachMessageAll}.
   */
  deliverToPlayer(playerId, payload) {
    const connectionIds = this.connectionIdsFor(playerId);
    let delivered = 0;
    for (const connectionId of connectionIds) {
      const sockets = this.ctx.getWebSockets(connectionId);
      if (sockets.length === 0) {
        this.forgetConnection(connectionId);
        continue;
      }
      for (const ws of sockets) {
        ws.send(this.invocation("Notification", [payload]));
        delivered++;
      }
    }
    return delivered;
  }
  /**
   * Send an already-built `Notification` payload to every connected (handshaken)
   * socket; returns how many received it. Shared by {@link broadcast} and
   * {@link coachMessageAll}.
   */
  broadcastToConnected(payload) {
    let delivered = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment();
      if (!state?.handshakeDone) continue;
      ws.send(this.invocation("Notification", [payload]));
      delivered++;
    }
    return delivered;
  }
  /**
   * Build the `Notification` argument: a JSON string `{ Id, Msg }`
   * (null values are dropped from `Msg`). `Id` is a client-defined tag — a
   * string name (e.g. "AccountUpdate") or a numeric code. It is always emitted
   * as a string: the client dispatches on a string `Id`, so a numeric frame
   * (e.g. the `NotificationType` enum values sent by `econ`) would otherwise be
   * silently dropped.
   */
  buildNotificationPayload(notificationType, data) {
    const msg = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (value === null || value === void 0) continue;
        msg[key] = value;
      }
    }
    return JSON.stringify({ Id: String(notificationType), Msg: msg });
  }
  invocation(target, args) {
    return JSON.stringify({ type: 1, target, arguments: args }) + RS;
  }
  completion(invocationId, result) {
    return JSON.stringify({ type: 3, invocationId, result }) + RS;
  }
  completionError(invocationId, error) {
    return JSON.stringify({ type: 3, invocationId, error }) + RS;
  }
}
export {
  COACH_MESSAGE_TYPE,
  COACH_PLAYER_ID,
  MAX_PENDING_PER_PLAYER,
  NotificationsHub,
  OWNER_HEADER
};
