// Ported from apps/api/src/events-db.ts; TypeScript types erased; native runtime imports.
import {
  glyphLength,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_DURATION_MS,
  MAX_EVENT_NAME_LENGTH
} from "../../../packages/domain/src/index.js";
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS event (
		data TEXT NOT NULL,
		id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.PlayerEventId')) VIRTUAL,
		creator_player_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.CreatorPlayerId')) VIRTUAL,
		room_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.RoomId')) VIRTUAL,
		club_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.ClubId')) VIRTUAL,
		start_time TEXT GENERATED ALWAYS AS (json_extract(data, '$.StartTime')) VIRTUAL,
		end_time TEXT GENERATED ALWAYS AS (json_extract(data, '$.EndTime')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_event_id ON event (id)`,
  `CREATE INDEX IF NOT EXISTS idx_event_creator ON event (creator_player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_event_club ON event (club_id)`,
  `CREATE INDEX IF NOT EXISTS idx_event_room ON event (room_id)`,
  `CREATE INDEX IF NOT EXISTS idx_event_start ON event (start_time)`,
  `CREATE TABLE IF NOT EXISTS event_attendee (
		event_id INTEGER NOT NULL,
		player_id INTEGER NOT NULL,
		status INTEGER NOT NULL,
		responded_at TEXT NOT NULL,
		PRIMARY KEY (event_id, player_id)
	)`,
  `CREATE INDEX IF NOT EXISTS idx_event_attendee_player ON event_attendee (player_id)`,
  `CREATE TABLE IF NOT EXISTS event_tag (
		event_id INTEGER NOT NULL,
		tag TEXT NOT NULL,
		type INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (event_id, tag)
	)`,
  `CREATE INDEX IF NOT EXISTS idx_event_tag_tag ON event_tag (tag)`
];
const EVENT_RESPONSE = {
  going: 0,
  interested: 1,
  cantGo: 2
};
const EVENT_RESPONSE_VALUES = Object.values(EVENT_RESPONSE);
function isEventResponseType(value) {
  return EVENT_RESPONSE_VALUES.includes(value);
}
function toEventResponse(row) {
  return {
    PlayerEventResponseId: row.id,
    PlayerEventId: row.event_id,
    PlayerId: row.player_id,
    CreatedAt: row.responded_at,
    Type: row.status
  };
}
function toEventResult(event, tags = [], legacyTags = false) {
  const names = tags.map((t) => t.tag);
  const carried = legacyTags ? tags.map((t) => ({ Tag: t.tag, Type: t.type })) : names;
  return {
    PlayerEvent: { Tags: carried, ...toEventBase(event) },
    Result: 0,
    TagModifyResult: { Result: 0, Tags: names }
  };
}
const EVENT_DELETED_RESULT = {
  PlayerEvent: null,
  Result: 0,
  TagModifyResult: null
};
function toEventBase(event) {
  const { State: _State, ...rest } = event;
  return { ...rest, ImageName: event.ImageName ?? "", BroadcastingRoomInstanceId: null };
}
function toTickPrecision(iso) {
  const match = /^(.*?)(?:\.(\d+))?Z$/.exec(iso);
  if (match === null) return iso;
  return `${match[1]}.${(match[2] ?? "").padEnd(7, "0").slice(0, 7)}Z`;
}
function toEventNotification(event, tags = []) {
  return {
    tags,
    playerEventId: event.PlayerEventId,
    creatorPlayerId: event.CreatorPlayerId,
    roomId: event.RoomId,
    subRoomId: event.SubRoomId,
    clubId: event.ClubId,
    name: event.Name,
    description: event.Description,
    imageName: event.ImageName ?? "",
    startTime: toTickPrecision(event.StartTime),
    endTime: toTickPrecision(event.EndTime),
    attendeeCount: event.AttendeeCount,
    accessibility: event.Accessibility,
    isMultiInstance: event.IsMultiInstance,
    supportMultiInstanceRoomChat: event.SupportMultiInstanceRoomChat,
    defaultBroadcastPermissions: event.DefaultBroadcastPermissions,
    canRequestBroadcastPermissions: event.CanRequestBroadcastPermissions,
    broadcastingRoomInstanceId: null
  };
}
function eventTime(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function parseEventTime(raw) {
  if (typeof raw !== "string") return void 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? void 0 : eventTime(parsed);
}
async function getEventTags(db, eventId) {
  const { results } = await db.prepare("SELECT tag, type FROM event_tag WHERE event_id = ?1 ORDER BY tag").bind(eventId).all();
  return results;
}
async function setEventTags(db, eventId, tags) {
  const statements = [db.prepare("DELETE FROM event_tag WHERE event_id = ?1").bind(eventId)];
  for (const { tag, type } of tags) {
    statements.push(
      db.prepare(
        `INSERT INTO event_tag (event_id, tag, type) VALUES (?1, ?2, ?3)
					 ON CONFLICT (event_id, tag) DO UPDATE SET type = ?3`
      ).bind(eventId, tag, type)
    );
  }
  await db.batch(statements);
}
function asInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }
  return void 0;
}
function resolvedWindow(input, existing, now = Date.now()) {
  const start = Date.parse(input.startTime ?? existing?.StartTime ?? eventTime(now));
  const stored = input.endTime ?? existing?.EndTime;
  return { start, end: stored === void 0 ? start + DEFAULT_DURATION_MS : Date.parse(stored) };
}
function eventInputRejection(input, existing) {
  const name = input.name?.trim();
  if (name !== void 0 && glyphLength(name) > MAX_EVENT_NAME_LENGTH) {
    return `Event names can be at most ${MAX_EVENT_NAME_LENGTH} characters.`;
  }
  if (input.description !== void 0 && glyphLength(input.description) > MAX_EVENT_DESCRIPTION_LENGTH) {
    return `Event descriptions can be at most ${MAX_EVENT_DESCRIPTION_LENGTH} characters.`;
  }
  const { start, end } = resolvedWindow(input, existing);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end < start) return "An event cannot end before it starts.";
  if (end - start > MAX_EVENT_DURATION_MS) {
    return `An event can run for at most ${MAX_EVENT_DURATION_MS / (60 * 60 * 1e3)} hours.`;
  }
  return null;
}
function parseEventTags(raw) {
  if (!Array.isArray(raw)) return void 0;
  const byTag = /* @__PURE__ */ new Map();
  for (const entry of raw) {
    const source = typeof entry === "object" && entry !== null ? entry : {};
    const name = typeof entry === "string" ? entry : source.tag ?? source.Tag;
    if (typeof name !== "string") continue;
    const tag = name.trim().replace(/^#/, "").toLowerCase();
    if (tag === "") continue;
    byTag.set(tag, { tag, type: asInt(source.type ?? source.Type) ?? 0 });
  }
  return [...byTag.values()];
}
function parseEventBody(body) {
  const outer = typeof body === "object" && body !== null ? body : {};
  const nested = outer.PlayerEvent;
  const obj = typeof nested === "object" && nested !== null ? nested : outer;
  const has = (key) => Object.hasOwn(obj, key);
  const nullableInt = (key) => {
    if (!has(key)) return void 0;
    return obj[key] === null ? null : asInt(obj[key]);
  };
  const time = (key) => parseEventTime(obj[key]);
  const bool = (key) => {
    const raw = obj[key];
    if (typeof raw === "boolean") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return void 0;
  };
  const nullableString = (key) => {
    if (!has(key)) return void 0;
    if (obj[key] === null) return null;
    return typeof obj[key] === "string" ? obj[key] : void 0;
  };
  return {
    tags: parseEventTags(obj.Tags ?? obj.tags),
    imageName: nullableString("ImageName"),
    roomId: asInt(obj.RoomId),
    subRoomId: nullableInt("SubRoomId"),
    clubId: nullableInt("ClubId"),
    name: typeof obj.Name === "string" ? obj.Name : void 0,
    description: typeof obj.Description === "string" ? obj.Description : void 0,
    startTime: time("StartTime"),
    endTime: time("EndTime"),
    state: asInt(obj.State),
    accessibility: asInt(obj.Accessibility),
    isMultiInstance: bool("IsMultiInstance"),
    supportMultiInstanceRoomChat: bool("SupportMultiInstanceRoomChat"),
    defaultBroadcastPermissions: asInt(obj.DefaultBroadcastPermissions),
    canRequestBroadcastPermissions: asInt(obj.CanRequestBroadcastPermissions)
  };
}
const DEFAULT_DURATION_MS = 60 * 60 * 1e3;
async function createEvent(db, creatorPlayerId, input) {
  const row = await db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM event").first();
  const now = Date.now();
  const startTime = input.startTime ?? eventTime(now);
  const event = {
    PlayerEventId: row?.next ?? 1,
    CreatorPlayerId: creatorPlayerId,
    ImageName: input.imageName ?? null,
    RoomId: input.roomId ?? 0,
    SubRoomId: input.subRoomId ?? null,
    ClubId: input.clubId ?? null,
    Name: input.name?.trim() || "Untitled Event",
    Description: input.description ?? "",
    StartTime: startTime,
    EndTime: input.endTime ?? eventTime(Date.parse(startTime) + DEFAULT_DURATION_MS),
    AttendeeCount: 1,
    State: input.state ?? 0,
    Accessibility: input.accessibility ?? 1,
    IsMultiInstance: input.isMultiInstance ?? false,
    SupportMultiInstanceRoomChat: input.supportMultiInstanceRoomChat ?? false,
    DefaultBroadcastPermissions: input.defaultBroadcastPermissions ?? 0,
    CanRequestBroadcastPermissions: input.canRequestBroadcastPermissions ?? 0
  };
  await db.batch([
    db.prepare("INSERT INTO event (data) VALUES (?1)").bind(JSON.stringify(event)),
    db.prepare(
      `INSERT INTO event_attendee (event_id, player_id, status, responded_at)
				 VALUES (?1, ?2, ?3, ?4)`
    ).bind(event.PlayerEventId, creatorPlayerId, EVENT_RESPONSE.going, eventTime(now))
  ]);
  if (input.tags !== void 0) await setEventTags(db, event.PlayerEventId, input.tags);
  return event;
}
async function setEventResponse(db, eventId, playerId, status) {
  const event = await getEventById(db, eventId);
  if (event === null) return null;
  await db.prepare(
    `INSERT INTO event_attendee (event_id, player_id, status, responded_at)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT (event_id, player_id) DO UPDATE SET status = ?3, responded_at = ?4`
  ).bind(eventId, playerId, status, eventTime(Date.now())).run();
  const updated = { ...event, AttendeeCount: await countGoing(db, eventId) };
  await writeEvent(db, updated);
  return updated;
}
async function inviteToEvent(db, eventId, playerIds) {
  const event = await getEventById(db, eventId);
  if (event === null) return null;
  if (playerIds.length === 0) return { event, added: [] };
  const at = eventTime(Date.now());
  const inserts = await db.batch(
    playerIds.map(
      (playerId) => db.prepare(
        `INSERT INTO event_attendee (event_id, player_id, status, responded_at)
					 VALUES (?1, ?2, ?3, ?4)
					 ON CONFLICT (event_id, player_id) DO NOTHING
					 RETURNING rowid AS id, *`
      ).bind(eventId, playerId, EVENT_RESPONSE.going, at)
    )
  );
  const added = inserts.flatMap((r) => r.results);
  const updated = { ...event, AttendeeCount: await countGoing(db, eventId) };
  await writeEvent(db, updated);
  return { event: updated, added };
}
async function countGoing(db, eventId) {
  const row = await db.prepare("SELECT COUNT(*) AS going FROM event_attendee WHERE event_id = ?1 AND status = ?2").bind(eventId, EVENT_RESPONSE.going).first();
  return row?.going ?? 0;
}
async function getEventResponse(db, eventId, playerId) {
  return db.prepare("SELECT rowid AS id, * FROM event_attendee WHERE event_id = ?1 AND player_id = ?2").bind(eventId, playerId).first();
}
async function getEventAttendees(db, eventId) {
  const { results } = await db.prepare(
    `SELECT rowid AS id, * FROM event_attendee
			 WHERE event_id = ?1 ORDER BY responded_at, player_id`
  ).bind(eventId).all();
  return results;
}
async function writeEvent(db, event) {
  await db.prepare("UPDATE event SET data = ?1 WHERE id = ?2").bind(JSON.stringify(event), event.PlayerEventId).run();
}
async function updateEvent(db, eventId, input) {
  const event = await getEventById(db, eventId);
  if (event === null) return null;
  const updated = {
    ...event,
    ImageName: input.imageName === void 0 ? event.ImageName : input.imageName,
    RoomId: input.roomId ?? event.RoomId,
    SubRoomId: input.subRoomId === void 0 ? event.SubRoomId : input.subRoomId,
    ClubId: input.clubId === void 0 ? event.ClubId : input.clubId,
    Name: input.name?.trim() || event.Name,
    Description: input.description ?? event.Description,
    StartTime: input.startTime ?? event.StartTime,
    EndTime: input.endTime ?? event.EndTime,
    State: input.state ?? event.State,
    Accessibility: input.accessibility ?? event.Accessibility,
    IsMultiInstance: input.isMultiInstance ?? event.IsMultiInstance,
    SupportMultiInstanceRoomChat: input.supportMultiInstanceRoomChat ?? event.SupportMultiInstanceRoomChat,
    DefaultBroadcastPermissions: input.defaultBroadcastPermissions ?? event.DefaultBroadcastPermissions,
    CanRequestBroadcastPermissions: input.canRequestBroadcastPermissions ?? event.CanRequestBroadcastPermissions
  };
  await writeEvent(db, updated);
  if (input.tags !== void 0) await setEventTags(db, eventId, input.tags);
  return updated;
}
async function deleteEvent(db, eventId) {
  const event = await getEventById(db, eventId);
  if (event === null) return null;
  await db.batch([
    db.prepare("DELETE FROM event_attendee WHERE event_id = ?1").bind(eventId),
    db.prepare("DELETE FROM event_tag WHERE event_id = ?1").bind(eventId),
    db.prepare("DELETE FROM event WHERE id = ?1").bind(eventId)
  ]);
  return event;
}
async function getEventById(db, eventId) {
  const row = await db.prepare("SELECT data FROM event WHERE id = ?1").bind(eventId).first();
  return row ? JSON.parse(row.data) : null;
}
async function getEventsByIds(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT data FROM event WHERE id IN (${placeholders})`).bind(...ids).all();
  const byId = /* @__PURE__ */ new Map();
  for (const r of results) {
    const event = JSON.parse(r.data);
    byId.set(event.PlayerEventId, event);
  }
  return ids.map((id) => byId.get(id)).filter((e) => e !== void 0);
}
async function getEventsByCreator(db, creatorPlayerId) {
  const { results } = await db.prepare("SELECT data FROM event WHERE creator_player_id = ?1").bind(creatorPlayerId).all();
  return results.map((r) => JSON.parse(r.data)).sort(bySoonest);
}
async function getEventsByClubs(db, clubIds) {
  if (clubIds.length === 0) return [];
  const placeholders = clubIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db.prepare(`SELECT data FROM event WHERE club_id IN (${placeholders})`).bind(...clubIds).all();
  return results.map((r) => JSON.parse(r.data)).sort(bySoonest);
}
async function getEventsByRoom(db, roomId, now = Date.now()) {
  const { results } = await db.prepare("SELECT data FROM event WHERE room_id = ?1 AND end_time >= ?2").bind(roomId, eventTime(now)).all();
  return results.map((r) => JSON.parse(r.data)).sort(bySoonest);
}
async function getLiveEvents(db, now = Date.now()) {
  const at = eventTime(now);
  const { results } = await db.prepare("SELECT data FROM event WHERE start_time <= ?1 AND end_time >= ?1").bind(at).all();
  return results.map((r) => JSON.parse(r.data)).sort(bySoonest);
}
function bySoonest(a, b) {
  return a.StartTime.localeCompare(b.StartTime) || a.PlayerEventId - b.PlayerEventId;
}
async function searchEvents(db, query, skip, take) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tags = terms.filter((t) => t.startsWith("#")).map((t) => t.slice(1));
  const textTerms = terms.filter((t) => !t.startsWith("#"));
  const wanted = tags.filter(Boolean);
  const sql = wanted.length === 0 ? "SELECT data FROM event WHERE end_time >= ?1" : `SELECT data FROM event WHERE end_time >= ?1 AND (
					SELECT COUNT(DISTINCT tag) FROM event_tag
					WHERE event_tag.event_id = event.id
					  AND tag IN (${wanted.map((_, i) => `?${i + 2}`).join(", ")})
				) = ${wanted.length}`;
  const { results } = await db.prepare(sql).bind(eventTime(Date.now()), ...wanted).all();
  let events = results.map((r) => JSON.parse(r.data));
  for (const term of textTerms) {
    events = events.filter(
      (e) => e.Name.toLowerCase().includes(term) || e.Description.toLowerCase().includes(term)
    );
  }
  return events.sort(bySoonest).slice(skip, skip + take);
}
export {
  EVENT_DELETED_RESULT,
  EVENT_RESPONSE,
  SCHEMA_DDL,
  countGoing,
  createEvent,
  deleteEvent,
  eventInputRejection,
  getEventAttendees,
  getEventById,
  getEventResponse,
  getEventTags,
  getEventsByClubs,
  getEventsByCreator,
  getEventsByIds,
  getEventsByRoom,
  getLiveEvents,
  inviteToEvent,
  isEventResponseType,
  parseEventBody,
  parseEventTags,
  parseEventTime,
  searchEvents,
  setEventResponse,
  setEventTags,
  toEventBase,
  toEventNotification,
  toEventResponse,
  toEventResult,
  updateEvent
};
