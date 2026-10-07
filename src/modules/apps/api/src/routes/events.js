// Ported from apps/api/src/routes/events.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import { Accessibility, GAME_VERSION } from "../../../../packages/domain/src/index.js";
import { logger } from "../../../../packages/hono-helpers/src/index.js";
import { validateAndGetVersion } from "../../../../packages/jwt/src/index.js";
import { NotificationType } from "../../../notify/src/notification-types.js";
import {
  createEvent,
  deleteEvent,
  EVENT_DELETED_RESULT,
  eventInputRejection,
  getEventAttendees,
  getEventById,
  getEventResponse,
  getEventsByClubs,
  getEventsByCreator,
  getEventsByIds,
  getEventsByRoom,
  getEventTags,
  getLiveEvents,
  inviteToEvent,
  isEventResponseType,
  parseEventBody,
  parseEventTags,
  parseEventTime,
  searchEvents,
  setEventResponse,
  toEventBase,
  toEventNotification,
  toEventResponse,
  toEventResult,
  updateEvent
} from "../events-db.js";
import { authedId, parseFormIds, queryIds, unauthorized } from "../http.js";
import {
  AUTHED,
  BulkIdsRequest,
  form,
  idParam,
  intQuery,
  json,
  jsonBody,
  pageParams,
  PlayerEventAccessibilityRequest,
  PlayerEventBaseDto,
  PlayerEventBulkInviteRequest,
  PlayerEventDeletedDto,
  PlayerEventDescriptionRequest,
  PlayerEventDetailsDto,
  PlayerEventDto,
  PlayerEventNameRequest,
  PlayerEventReportRequest,
  PlayerEventRequest,
  PlayerEventRespondRequest,
  PlayerEventResponseDto,
  PlayerEventResultDto,
  PlayerEventsAll,
  PlayerEventsPage,
  PlayerEventTagsRequest,
  PlayerEventTimeRequest,
  stringQuery,
  SuccessErrorEnvelope,
  TagFilters,
  UNAUTHORIZED_RESPONSE
} from "../openapi.js";
import { createReport } from "../reports-db.js";
const HUB_INSTANCE = "global";
async function notifyEventCreated(c, event, tags) {
  try {
    await c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE).notifyPlayer(
      event.CreatorPlayerId,
      NotificationType.PlayerEventCreated,
      { ...toEventNotification(event, tags) }
    );
  } catch (err) {
    logger.error("failed to push PlayerEventCreated notification", {
      playerEventId: event.PlayerEventId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
async function notifyInvited(c, event, added) {
  const hub = c.env.RECFLARE_NOTIFICATIONS_HUB.getByName(HUB_INSTANCE);
  const PlayerEvent = { ...toEventNotification(event) };
  for (const row of added) {
    const payload = {
      PlayerEvent,
      PlayerEventResponse: { ...toEventResponse(row) }
    };
    try {
      await hub.notifyPlayer(row.player_id, NotificationType.PlayerEventResponseChanged, payload);
    } catch (err) {
      logger.error("failed to push PlayerEventResponseChanged notification", {
        playerEventId: event.PlayerEventId,
        playerId: row.player_id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
async function eventResult(c, event, tags) {
  const version = await validateAndGetVersion(c.req.raw, await c.env.JWT_SECRET.get());
  const isModernBuild = version !== null && version > GAME_VERSION;
  return toEventResult(event, tags, !isModernBuild);
}
function editEventField(parse) {
  return async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const eventId = Number.parseInt(c.req.param("eventId") ?? "", 10);
    const existing = await getEventById(c.env.DB, eventId);
    if (existing === null) return c.body(null, 404);
    if (existing.CreatorPlayerId !== id) return c.body(null, 403);
    const input = await parse(c, existing);
    if (input === null) return c.body(null, 400);
    const updated = await updateEvent(c.env.DB, eventId, input);
    return c.json(await eventResult(c, updated, await getEventTags(c.env.DB, eventId)));
  };
}
async function formBody(c) {
  return await c.req.parseBody().catch(() => ({}));
}
function parseEventAccessibility(value) {
  if (typeof value !== "string") return void 0;
  const raw = value.trim();
  const named = Object.entries(Accessibility).find(
    ([name, ordinal2]) => typeof ordinal2 === "number" && name.toLowerCase() === raw.toLowerCase()
  );
  if (named) return named[1];
  if (!/^\d+$/.test(raw)) return void 0;
  const ordinal = Number.parseInt(raw, 10);
  return ordinal in Accessibility ? ordinal : void 0;
}
const eventRoutes = new Hono({ strict: false }).get(
  "/api/playerevents/v1",
  describeRoute({
    tags: ["Events"],
    summary: "The player-events browse feed",
    description: 'The default feed on the player-events screen: every event that has not finished yet \u2014 upcoming and running \u2014 soonest first, paginated via skip/take. A bare array.\n\nEach entry is the client\u2019s BASE event \u2014 the v2 envelope\u2019s event minus `Tags`, 17 keys \u2014 not the stored record the by-id, bulk and search reads serve: it drops `State`, serves `ImageName` as `""` rather than null, and carries `BroadcastingRoomInstanceId` (always null \u2014 nothing broadcasts an event yet). That is the shape observed on this endpoint; keep the two projections apart.',
    parameters: pageParams(50),
    responses: { 200: json(PlayerEventBaseDto.array(), "The events that have not ended") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "", 10) || 50;
    const events = await searchEvents(c.env.DB, "", skip, take);
    return c.json(events.map(toEventBase));
  }
).get(
  "/api/playerevents/v1/all",
  describeRoute({
    tags: ["Events"],
    summary: "The caller\u2019s player events",
    description: "Events the player created and events they have RSVP\u2019d to. `Created` is served from the event table, soonest first.\n\n`Responses` is still always empty. RSVPs ARE stored now (see `/api/playerevents/v1/respond` and the `event_attendee` table) \u2014 what isn\u2019t known is the shape this field wants: whether an entry is a bare event like `Created`, or the event plus the answer, which is the useful thing to render. Serving the wrong one renders nothing rather than erroring, so it stays empty until a real response is observed.",
    security: AUTHED,
    responses: {
      200: json(PlayerEventsAll, "The caller\u2019s created events, and an empty RSVP list"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ Created: await getEventsByCreator(c.env.DB, id), Responses: [] });
  }
).get(
  "/api/playerevents/v1/tagfilters",
  describeRoute({
    tags: ["Events"],
    summary: "Player-event filter chips",
    description: "The filter chips on the player-events browse screen \u2014 the event categories the client offers. Static: the same set regardless of what is stored. `TrendingFilters` is null even in the reference (it needs recent-activity data), and the client renders no trending row for null.",
    security: AUTHED,
    responses: { 200: json(TagFilters, "The filter chips"), 401: UNAUTHORIZED_RESPONSE }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({
      PinnedFilters: [
        "workshops",
        "celebration",
        "game",
        "meetup",
        "performance",
        "coop",
        "grandopening",
        "class",
        "competition"
      ],
      PopularFilters: [
        "workshops",
        "celebration",
        "class",
        "coop",
        "competition",
        "game",
        "grandopening",
        "meetup",
        "performance"
      ],
      TrendingFilters: null
    });
  }
).get(
  "/api/playerevents/v1/clubs",
  describeRoute({
    tags: ["Events"],
    summary: "Player events across several clubs",
    description: "The events shelf for a set of clubs (`?id=1&id=2`), soonest first. This form returns a BARE ARRAY \u2014 the client deserializes it as a list and chokes on the paged envelope the single-club form below uses. Do not unify the two. No ids means an empty shelf, not every event.",
    parameters: [intQuery("id", "Repeatable club id")],
    responses: { 200: json(PlayerEventDto.array(), "The clubs\u2019 events") }
  }),
  async (c) => c.json(await getEventsByClubs(c.env.DB, queryIds(c)))
).get(
  "/api/playerevents/v1/club/:clubId{[0-9]+}",
  describeRoute({
    tags: ["Events"],
    summary: "Player events for one club",
    description: "The same feed for a single club \u2014 and this form DOES wrap the events with a paging cursor, matching the reference. The cursor is always empty: a club\u2019s event list is small enough to serve in one page.",
    parameters: [idParam("clubId", "Club id")],
    responses: { 200: json(PlayerEventsPage, "The club\u2019s events, in a single page") }
  }),
  async (c) => {
    const clubId = Number.parseInt(c.req.param("clubId"), 10);
    const events = await getEventsByClubs(c.env.DB, [clubId]);
    return c.json({ ContinuationToken: "", Events: events });
  }
).get(
  "/api/playerevents/v1/room/:roomId{[0-9]+}",
  describeRoute({
    tags: ["Events"],
    summary: "Player events in one room",
    description: 'The events scheduled in a room \u2014 the shelf on the room\u2019s page \u2014 soonest first. A bare array of the client\u2019s BASE event (17 keys \u2014 no `State`, `ImageName` as `""` rather than null, plus `BroadcastingRoomInstanceId`), the same projection the browse feed and the bulk read serve: the client decodes all three through one generic helper and one element type. `/searchlive` and the club shelves serve the stored record instead.\n\nCURRENT and UPCOMING only: the filter is on the END time, so a running event stays listed until it is over rather than vanishing the moment it starts, and an event that has finished is dropped \u2014 this answers what someone can still turn up to. A room with nothing scheduled, and a room id that does not exist, both answer an empty array; the shelf is about events, not about whether the room is real.',
    parameters: [idParam("roomId", "Room id")],
    responses: {
      200: json(PlayerEventBaseDto.array(), "The room\u2019s current and upcoming events")
    }
  }),
  async (c) => {
    const events = await getEventsByRoom(c.env.DB, Number.parseInt(c.req.param("roomId"), 10));
    return c.json(events.map(toEventBase));
  }
).get(
  "/api/playerevents/v1/searchlive",
  describeRoute({
    tags: ["Events"],
    summary: "Live player events",
    description: 'The "happening now" row on the player-events browse screen: events that have started and not yet ended, soonest first. A bare array.',
    responses: { 200: json(PlayerEventDto.array(), "The events running right now") }
  }),
  async (c) => c.json(await getLiveEvents(c.env.DB))
).get(
  "/api/playerevents/v1/search",
  describeRoute({
    tags: ["Events"],
    summary: "Search player events",
    description: "The browse query on the player-events screen, term by term; an empty query browses everything upcoming. A `#` decides how a term is matched: `#workshops` is a TAG term, matching only events tagged `workshops` and never the word in a name or description, which is what the filter chips send; a bare `workshops` is TEXT, matched case-insensitively against the name and description. Every term must match and the two kinds combine, so `#workshops trigonometry` is the workshops-tagged events whose text also mentions trigonometry.\n\nEvents that have already finished are left out \u2014 a name match on something that ended last month is noise on a browse screen. Soonest first, paginated via skip/take. A bare array.",
    parameters: [
      stringQuery("query", "Search terms; `#tag` matches a tag, anything else the text"),
      stringQuery(
        "sort",
        "Accepted and echoed by the client as `StartTime`, which is the only order served (soonest first); any other value sorts the same way"
      ),
      ...pageParams(50)
    ],
    responses: { 200: json(PlayerEventDto.array(), "The matching events") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "", 10) || 50;
    return c.json(await searchEvents(c.env.DB, c.req.query("query") ?? "", skip, take));
  }
).post(
  "/api/playerevents/v1/bulk",
  describeRoute({
    tags: ["Events"],
    summary: "Several player events by id",
    description: "The events behind a list of ids the client already holds, as a form body: `Ids` repeated once per id (`Ids=101&Ids=102&Ids=103`), or one comma-separated `Ids=1,2,3`. A bare array of the client\u2019s BASE event \u2014 the same projection the browse feed and the room shelf serve, this one filtered to the requested ids.\n\nAnswers in the order the ids were asked for and skips ids with no event rather than leaving a hole, so the result may be shorter than the request. No ids at all is an empty array, not a 400.",
    requestBody: form(BulkIdsRequest, "The event ids to look up"),
    responses: {
      200: json(PlayerEventBaseDto.array(), "The events that exist, in request order")
    }
  }),
  async (c) => {
    const events = await getEventsByIds(c.env.DB, await parseFormIds(c));
    return c.json(events.map(toEventBase));
  }
).get(
  "/api/playerevents/v1/bulk",
  describeRoute({
    tags: ["Events"],
    summary: "Several player events by id (query form)",
    description: "The same read as the POST on this path, with the ids in the query (`?id=1&id=2`) rather than a form body \u2014 the client sends the POST. Identical response: a bare array of the BASE event, in request order, skipping ids with no event.",
    parameters: [intQuery("id", "Repeatable event id")],
    responses: {
      200: json(PlayerEventBaseDto.array(), "The events that exist, in request order")
    }
  }),
  async (c) => {
    const events = await getEventsByIds(c.env.DB, queryIds(c));
    return c.json(events.map(toEventBase));
  }
).post(
  "/api/playerevents/v1/respond",
  describeRoute({
    tags: ["Events"],
    summary: "Answer a player event",
    description: "Records how the caller is answering an event \u2014 `Type` is 0 Going, 1 Interested, 2 Can\u2019t go. Responding again replaces the previous answer; there is one row per player per event, and a decline is recorded rather than deleted so the client can show a player what they said.\n\nOnly Going counts toward the event\u2019s `AttendeeCount`, which is recomputed from the RSVP table on every response. Anyone may respond, the creator included \u2014 they are already Going from create, and nothing stops them declining their own event. Answers the same `{ Result, TagModifyResult, PlayerEvent }` envelope the v2 writes do, carrying the event with its updated count, so the client can re-render from the response.\n\nA body with no usable `PlayerEventId`, or a `Type` outside 0\u20132, is a 400; an unknown event is a 404.",
    security: AUTHED,
    requestBody: jsonBody(PlayerEventRespondRequest, "The event and the answer"),
    responses: {
      200: json(PlayerEventResultDto, "The event, with its updated attendee count"),
      400: { description: "Missing `PlayerEventId` or an unknown `Type` (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      404: { description: "No such event (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const eventId = Number(body.PlayerEventId);
    const type = Number(body.Type);
    if (!Number.isInteger(eventId) || !isEventResponseType(type)) return c.body(null, 400);
    const updated = await setEventResponse(c.env.DB, eventId, id, type);
    if (updated === null) return c.body(null, 404);
    return c.json(await eventResult(c, updated, await getEventTags(c.env.DB, eventId)));
  }
).post(
  "/api/playerevents/v1/report",
  describeRoute({
    tags: ["Events", "Moderation"],
    summary: "Report a player event",
    description: "Files a report against an event. Stored as a row in the same `report` table a player report goes to (`POST /api/PlayerReporting/v3/create`) \u2014 it is the same submission with the same moderation life, and a moderator converts either into a ban the same way. What marks it as an event report is `event_id`; the row\u2019s `reported_player_id` is the event\u2019s CREATOR (who a moderator would act against) and its `room_id` the room the event runs in, both read from the event rather than sent by the client.\n\nThe reporter is the caller (from the bearer token), never a body field. Note this body is JSON, where the player report\u2019s is form-encoded. `ReportCategory` is stored verbatim \u2014 the enum is not mapped here. Nothing dedupes the rows: reporting the same event twice files two reports.\n\nAnswers the same `{ success, error }` envelope as the player report, `error` being an empty string rather than null, on the rejected branches too so there is only one shape to parse.",
    security: AUTHED,
    requestBody: jsonBody(PlayerEventReportRequest, "The report"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No usable `PlayerEventId` in the body"),
      401: UNAUTHORIZED_RESPONSE,
      404: json(SuccessErrorEnvelope, "No such event")
    }
  }),
  async (c) => {
    const reporterId = await authedId(c);
    if (reporterId === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const eventId = Number(body.PlayerEventId);
    if (!Number.isInteger(eventId)) {
      return c.json({ success: false, error: "PlayerEventId is required" }, 400);
    }
    const event = await getEventById(c.env.DB, eventId);
    if (event === null) return c.json({ success: false, error: "No such event" }, 404);
    const category = Number(body.ReportCategory);
    await createReport(c.env.DB, {
      reporterPlayerId: reporterId,
      reportedPlayerId: event.CreatorPlayerId,
      reportCategory: Number.isInteger(category) ? category : 0,
      details: typeof body.Details === "string" ? body.Details : null,
      roomId: event.RoomId > 0 ? event.RoomId : null,
      eventId
    });
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/playerevents/v1/bulkInvite",
  describeRoute({
    tags: ["Events"],
    summary: "Invite players to an event",
    description: "Adds the invited players to the event as Going \u2014 the same `event_attendee` rows an RSVP writes, so an invited player shows up in `\u2026/responses` and counts toward `AttendeeCount` immediately, without having answered.\n\nAn invite never overwrites an answer: a player who already responded keeps what they said, so inviting someone who declined does not flip them back to Going, and re-inviting is a no-op. The caller is skipped (they are already on the list), as are duplicate ids.\n\nThe caller must be on the event themselves \u2014 its creator, or a player with a response row of any kind. Anyone else gets 403: an invite adds attendees, so it is not something a passer-by can do. Answers the same `{ Result, TagModifyResult, PlayerEvent }` envelope the other event writes do, carrying the updated attendee count.",
    security: AUTHED,
    requestBody: jsonBody(PlayerEventBulkInviteRequest, "The event and who to invite"),
    responses: {
      200: json(PlayerEventResultDto, "The event, with its updated attendee count"),
      400: { description: "Missing `PlayerEventId` or `InvitedPlayerIds` (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "The caller is not on the event (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const eventId = Number(body.PlayerEventId);
    if (!Number.isInteger(eventId) || !Array.isArray(body.InvitedPlayerIds)) {
      return c.body(null, 400);
    }
    const event = await getEventById(c.env.DB, eventId);
    if (event === null) return c.body(null, 404);
    if (event.CreatorPlayerId !== id && await getEventResponse(c.env.DB, eventId, id) === null) {
      return c.body(null, 403);
    }
    const invited = [
      ...new Set(
        body.InvitedPlayerIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v !== id)
      )
    ];
    const result = await inviteToEvent(c.env.DB, eventId, invited);
    await notifyInvited(c, result.event, result.added);
    return c.json(await eventResult(c, result.event, await getEventTags(c.env.DB, eventId)));
  }
).post(
  "/api/playerevents/v2",
  describeRoute({
    tags: ["Events"],
    summary: "Create a player event",
    description: "Schedules a new event. The creator is taken from the bearer token, never the body; the id is assigned here. Lenient about the rest, like the other writes here \u2014 a missing name becomes \u201CUntitled Event\u201D and a missing time window becomes an hour from now, rather than an error the client can\u2019t render.\n\n`State` starts at 0, and the creator is recorded as Going in the RSVP table \u2014 which is what makes `AttendeeCount` start at 1, since that count is derived from the table. Answers the `{ Result, TagModifyResult, PlayerEvent }` envelope \u2014 NOT the bare event the read endpoints serve.\n\nThe window is capped at 24 hours and must end after it starts \u2014 an event is a scheduled get-together, not a season. Since a missing end defaults to an hour after the start, only a body naming both bounds (or an end alone, which is measured from now) can fail this.\n\nAlso pushes a `PlayerEventCreated` (80) hub notification to the creator, carrying the event in its camelCase notification projection. A hub failure is logged and swallowed \u2014 the event is already stored by then.",
    security: AUTHED,
    requestBody: jsonBody(PlayerEventRequest, "The event to schedule"),
    responses: {
      200: json(PlayerEventResultDto, "The created event"),
      400: {
        description: "Name over 64 or description over 512 characters, or a window that is backwards or longer than 24 hours (empty body)"
      },
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const input = parseEventBody(body);
    if (eventInputRejection(input) !== null) return c.body(null, 400);
    const event = await createEvent(c.env.DB, id, input);
    await notifyEventCreated(c, event, input.tags ?? []);
    return c.json(await eventResult(c, event, await getEventTags(c.env.DB, event.PlayerEventId)));
  }
).on(
  ["POST", "DELETE"],
  "/api/playerevents/v2/delete/:eventId{[0-9]+}",
  describeRoute({
    tags: ["Events"],
    summary: "Delete a player event",
    description: "Deletes an event the caller created, along with its RSVPs and its tags \u2014 an event whose attendee rows outlived it would still be counted, and its tags would still answer `#tag` searches.\n\nCreator only: anyone else gets 403, and an unknown event 404. Answers the v2 envelope with `PlayerEvent` and `TagModifyResult` both null \u2014 the event is gone, so there is nothing for the client to redraw from, and it reads only `Result`. Both POST and DELETE reach it \u2014 the path names the verb, which is the form the client uses.",
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    responses: {
      200: json(PlayerEventDeletedDto, "The nulled envelope a delete answers with"),
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const eventId = Number.parseInt(c.req.param("eventId"), 10);
    const existing = await getEventById(c.env.DB, eventId);
    if (existing === null) return c.body(null, 404);
    if (existing.CreatorPlayerId !== id) return c.body(null, 403);
    await deleteEvent(c.env.DB, eventId);
    return c.json(EVENT_DELETED_RESULT);
  }
).get(
  "/api/playerevents/v2/:eventId{[0-9]+}",
  describeRoute({
    tags: ["Events"],
    summary: "One player event (v2 envelope)",
    description: "A single event wrapped in the same `{ PlayerEvent, Result, TagModifyResult }` envelope the v2 writes answer with \u2014 `Tags` inline, `BroadcastingRoomInstanceId` present, no `State`. 404 when there is no such event.\n\n`TagModifyResult` carries the event\u2019s tags here too, even though a read edits nothing: the client reads its chips out of that field either way.",
    parameters: [idParam("eventId", "Event id")],
    responses: {
      200: json(PlayerEventResultDto, "The event in the v2 envelope"),
      404: { description: "No such event (empty body)" }
    }
  }),
  async (c) => {
    const eventId = Number.parseInt(c.req.param("eventId"), 10);
    const event = await getEventById(c.env.DB, eventId);
    if (event === null) return c.body(null, 404);
    return c.json(await eventResult(c, event, await getEventTags(c.env.DB, eventId)));
  }
).post(
  "/api/playerevents/v2/:eventId{[0-9]+}",
  describeRoute({
    tags: ["Events"],
    summary: "Update a player event",
    description: "Edits an event the caller created. Only the fields the body carries change; everything else keeps its stored value, so a partial post can\u2019t blank out the rest of the event. A posted `null` on `ImageName` / `SubRoomId` / `ClubId` does clear it.\n\nThe id, the creator and the attendee count are not editable: ownership doesn\u2019t transfer and RSVPs aren\u2019t set by hand. Creator only \u2014 anyone else gets 403, and an unknown event is 404. Answers the same envelope as create.\n\nThe 24-hour window cap applies to what the post RESOLVES to, not to what it carries: moving the start alone still has to leave a window that ends after it and runs no longer than a day against the STORED end.",
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    requestBody: jsonBody(PlayerEventRequest, "The fields to change"),
    responses: {
      200: json(PlayerEventResultDto, "The updated event"),
      400: {
        description: "Name over 64 or description over 512 characters, or a resolved window that is backwards or longer than 24 hours (empty body)"
      },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const eventId = Number.parseInt(c.req.param("eventId"), 10);
    const existing = await getEventById(c.env.DB, eventId);
    if (existing === null) return c.body(null, 404);
    if (existing.CreatorPlayerId !== id) return c.body(null, 403);
    const body = await c.req.json().catch(() => ({}));
    const input = parseEventBody(body);
    if (eventInputRejection(input, existing) !== null) return c.body(null, 400);
    const updated = await updateEvent(c.env.DB, eventId, input);
    return c.json(await eventResult(c, updated, await getEventTags(c.env.DB, eventId)));
  }
).put(
  "/api/playerevents/v2/:eventId{[0-9]+}/time",
  describeRoute({
    tags: ["Events"],
    summary: "Reschedule a player event",
    description: "Moves an event\u2019s window. `startTime` and `endTime` are both optional and both independent: an absent bound keeps the stored one, so the start can be nudged without restating the end. Any parseable ISO 8601 is accepted \u2014 the client sends .NET tick precision (`2026-08-31T17:30:00.0000000Z`) \u2014 and stored trimmed to seconds, the form every read serves.\n\nA bound that is present but unparseable is a 400 rather than being dropped: a reschedule that silently did nothing is worse than a refusal. So is a window that ends before it starts, or one running longer than 24 HOURS \u2014 an event lasts at most a day. Both are checked against the RESOLVED window, so sending one bound is measured against the stored other one.\n\nCreator only, like the whole-event update; answers the same v2 envelope.",
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    requestBody: form(PlayerEventTimeRequest, "The new window"),
    responses: {
      200: json(PlayerEventResultDto, "The rescheduled event"),
      400: {
        description: "An unparseable time, an end before the start, or a window over 24 hours (empty body)"
      },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  editEventField(async (c, event) => {
    const body = await formBody(c);
    const startTime = parseEventTime(body.startTime);
    const endTime = parseEventTime(body.endTime);
    if (body.startTime !== void 0 && startTime === void 0) return null;
    if (body.endTime !== void 0 && endTime === void 0) return null;
    const input = { startTime, endTime };
    return eventInputRejection(input, event) === null ? input : null;
  })
).put(
  "/api/playerevents/v2/:eventId{[0-9]+}/accessibility",
  describeRoute({
    tags: ["Events"],
    summary: "Set a player event\u2019s accessibility",
    description: "Sets an event\u2019s visibility. The client sends the `RoomAccessibility` NAME here (`accessibility=Unlisted`), the way it does on the subroom route in `rooms` \u2014 not the ordinal the event\u2019s JSON writes carry, though the ordinal is accepted too.\n\nA value naming nothing in the enum is a 400 rather than being defaulted or stored verbatim: guessing a visibility wrong is what shows a private event to everyone. Creator only; answers the same v2 envelope.",
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    requestBody: form(PlayerEventAccessibilityRequest, "The new visibility"),
    responses: {
      200: json(PlayerEventResultDto, "The updated event"),
      400: { description: "Missing or unrecognized `accessibility` (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  editEventField(async (c) => {
    const accessibility = parseEventAccessibility((await formBody(c)).accessibility);
    return accessibility === void 0 ? null : { accessibility };
  })
).put(
  "/api/playerevents/v2/:eventId{[0-9]+}/tags",
  describeRoute({
    tags: ["Events"],
    summary: "Set a player event\u2019s tags",
    description: 'Replaces an event\u2019s whole tag set. The body is a BARE JSON ARRAY of names \u2014 `["tag1","class"]` \u2014 not the form encoding the other single-field edits use, and not an object; the `{ tag, type }` pairs the create/update bodies accept work too. A replace, not a merge: untagging is a PUT with the tag left out, and `[]` clears them all.\n\nNames are lowercased and a leading `#` stripped, matching what the `#tag` search looks for. A body that is not an array is a 400. Creator only; answers the same v2 envelope, whose `TagModifyResult` carries the set the event now has.',
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    requestBody: jsonBody(PlayerEventTagsRequest, "The whole tag set"),
    responses: {
      200: json(PlayerEventResultDto, "The updated event, with its new tags"),
      400: { description: "The body is not a JSON array (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  editEventField(async (c) => {
    const body = await c.req.json().catch(() => void 0);
    const tags = parseEventTags(body);
    return tags === void 0 ? null : { tags };
  })
).put(
  "/api/playerevents/v2/:eventId{[0-9]+}/description",
  describeRoute({
    tags: ["Events"],
    summary: "Set a player event\u2019s description",
    description: "Rewrites an event\u2019s blurb. An absent `description` CLEARS it \u2014 an emptied text box sends no field, the same way the room description route in `rooms` behaves \u2014 so this is the one edit here that can\u2019t be a no-op.\n\nCapped at 512 characters, the stored length, and refused rather than truncated: silently cutting a player\u2019s text off is worse than telling them. Creator only; answers the same v2 envelope.",
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    requestBody: form(PlayerEventDescriptionRequest, "The new description"),
    responses: {
      200: json(PlayerEventResultDto, "The updated event"),
      400: { description: "Description over 512 characters (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  editEventField(async (c) => {
    const raw = (await formBody(c)).description;
    const description = typeof raw === "string" ? raw : "";
    return eventInputRejection({ description }) === null ? { description } : null;
  })
).put(
  "/api/playerevents/v2/:eventId{[0-9]+}/name",
  describeRoute({
    tags: ["Events"],
    summary: "Rename a player event",
    description: "Retitles an event. Capped at 64 characters, the stored length, and refused rather than truncated. A blank name is refused too \u2014 an event with no title renders as a blank row, and the whole-event update reads an empty name as \u201Cleave it alone\u201D, so there is no way to store one regardless. The name is stored trimmed.\n\nNo uniqueness rule: two events may share a title, unlike a room name. Creator only; answers the same v2 envelope.",
    security: AUTHED,
    parameters: [idParam("eventId", "Event id")],
    requestBody: form(PlayerEventNameRequest, "The new title"),
    responses: {
      200: json(PlayerEventResultDto, "The renamed event"),
      400: { description: "A blank name, or one over 64 characters (empty body)" },
      401: UNAUTHORIZED_RESPONSE,
      403: { description: "Not the event\u2019s creator (empty body)" },
      404: { description: "No such event (empty body)" }
    }
  }),
  editEventField(async (c) => {
    const raw = (await formBody(c)).name;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name === "" || eventInputRejection({ name }) !== null) return null;
    return { name };
  })
).get(
  "/api/playerevents/v1/:eventId{[0-9]+}/responses",
  describeRoute({
    tags: ["Events"],
    summary: "An event\u2019s RSVPs",
    description: "Every answer given to an event, in the order they were given \u2014 declines and maybes included, not just the Going rows `AttendeeCount` counts. One entry per player: a player who changed their mind has one row carrying the answer that stands, and `CreatedAt` moves with it.\n\nA bare array, and an unknown event is an empty one rather than a 404 \u2014 like the other list reads here. An event always has at least its creator\u2019s Going row.",
    parameters: [idParam("eventId", "Event id")],
    responses: { 200: json(PlayerEventResponseDto.array(), "The event\u2019s RSVPs") }
  }),
  async (c) => {
    const eventId = Number.parseInt(c.req.param("eventId"), 10);
    const attendees = await getEventAttendees(c.env.DB, eventId);
    return c.json(attendees.map(toEventResponse));
  }
).get(
  "/api/playerevents/v1/:eventId{[0-9]+}",
  describeRoute({
    tags: ["Events"],
    summary: "One player event",
    description: "A single event by id, served as the bare record \u2014 no envelope, unlike the create/update writes. 404 when there is no such event.\n\n`includeDetails=True` adds exactly one field, the lowercase `tags` \u2014 that is the whole of what the flag does. It is always an empty array here: no event tags are stored (see the tag-filter chips, which are static, and `TagModifyResult`, which is always null). Without the flag the key is ABSENT rather than empty, since a caller that didn\u2019t ask for details shouldn\u2019t be told the event has no tags.",
    parameters: [
      idParam("eventId", "Event id"),
      stringQuery("includeDetails", "Pass `True` to add the `tags` array")
    ],
    responses: {
      200: json(PlayerEventDetailsDto, "The event, with `tags` when details were asked for"),
      404: { description: "No such event (empty body)" }
    }
  }),
  async (c) => {
    const eventId = Number.parseInt(c.req.param("eventId"), 10);
    const event = await getEventById(c.env.DB, eventId);
    if (event === null) return c.body(null, 404);
    const details = /^(true|1)$/i.test(c.req.query("includeDetails") ?? "");
    if (!details) return c.json(event);
    return c.json({ ...event, tags: await getEventTags(c.env.DB, eventId) });
  }
);
export {
  eventRoutes
};
