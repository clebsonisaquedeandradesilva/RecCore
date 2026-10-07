// Ported from apps/lists/src/lists.app.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../runtime/router.js";
import { describeRoute, openAPIRouteHandler } from "../../../../runtime/openapi.js";
import { useWorkersLogger } from "../../../../runtime/logger.js";
import {
  Accessibility,
  addPlayerListItem,
  getHotRooms,
  getNewRooms,
  getPlayerList,
  getRecentlyUpdatedRooms,
  getVisitedRooms
} from "../../../packages/domain/src/index.js";
import { withCleanSpec, withNotFound, withOnError } from "../../../packages/hono-helpers/src/index.js";
import { validateAndGetAccountId } from "../../../packages/jwt/src/index.js";
import { CatalogKind, UNSELLABLE_RARITIES } from "../../econ/src/catalog-load.js";
import { placeholderCuratedList, resolveCuratedList, serializeCuratedList } from "./curated-lists.js";
import {
  ALGORITHMIC_LIST_PARAM,
  ALGORITHMIC_TYPE_PARAM,
  AlgorithmicList,
  AUTHED,
  ContextualFeaturesAck,
  CREATOR_ACCOUNT_ID_PARAM,
  CuratedListRead,
  CuratedListSaved,
  CuratedListsBulk,
  form,
  ITEM_ID_PARAM,
  json,
  LIST_IDS_PARAM,
  LIST_NAME_PARAM,
  LIST_TYPE_PARAM,
  SAVE_LIST_NAME_PARAM,
  SaveItemBody,
  UNAUTHORIZED_RESPONSE
} from "./openapi.js";
async function authedId(c) {
  return validateAndGetAccountId(c.req.raw, await c.env.JWT_SECRET.get());
}
function unauthorized(c) {
  return c.body(null, 401);
}
const ListEntityType = {
  Accounts: 0,
  Rooms: 1,
  Inventions: 2,
  CustomAvatarItems: 3,
  PurchasableItems: 4,
  Generic: 5,
  ChipAndPort: 6,
  DiscoverySection: 7,
  DiscoverySectionSubType: 8
};
const MAX_LIST_ENTITY_TYPE = 255;
function entities(ids) {
  return ids.map((Id) => ({ Id, Context: null }));
}
const ALGORITHMIC_LIST_ENTITIES = [];
const LIST_SIZE = 20;
function toEntities(rooms) {
  return entities(rooms.map((room) => String(room.RoomId)));
}
const HOT_LIST_FEED = "community";
const ranked = (feed) => async (db) => (await feed(db)).Results;
const tagRow = (tag) => ranked((db) => getHotRooms(db, tag, 0, LIST_SIZE));
const ROW_FEEDS = {
  // The same ranking the rooms worker's `/rooms/hot` serves — live player count first,
  // then engagement — so the Hot row shows the rooms people are actually in.
  hotlist: ranked((db) => getHotRooms(db, HOT_LIST_FEED, 0, LIST_SIZE)),
  // Ordered by when each room's live scene was last PUBLISHED. A staged save doesn't
  // count: nothing anyone else can load has changed, so it must not float the room.
  recentlyupdated: ranked((db) => getRecentlyUpdatedRooms(db, 0, LIST_SIZE)),
  // Newest player-made rooms by creation time. Distinct from the browse screen's `tag=new`
  // chip, which selects on the RRO flag instead — see `getNewRooms`.
  new: ranked((db) => getNewRooms(db, 0, LIST_SIZE)),
  // The category rows. Each names its tag OUTRIGHT rather than deriving one from the slug,
  // because the mapping is not mechanical — `quests_algoendpoint` is plural and its tag
  // `quest` is singular, while the six below happen to match. Deriving would quietly invent
  // a `quests` tag no room carries and serve an empty carousel under a category heading.
  quests_algoendpoint: tagRow("quest"),
  battle_algoendpoint: tagRow("battle"),
  roleplay_algoendpoint: tagRow("roleplay"),
  horror_algoendpoint: tagRow("horror"),
  hangout_algoendpoint: tagRow("hangout"),
  casual_algoendpoint: tagRow("casual"),
  explore_algoendpoint: tagRow("explore")
};
const PERSONAL_ROW_FEEDS = {
  // Rooms the caller has been in, most recently visited first — the "Continue Playing"
  // carousel as an algorithmic row. Backed by the `interaction` table's `last_visited_at`,
  // which the `match` heartbeat stamps, and served straight from `getVisitedRooms` so this
  // row and `rooms` `GET /rooms/visitedby/me` can never disagree about where someone has been.
  recentlyvisited: (db, accountId) => getVisitedRooms(db, accountId, 0, LIST_SIZE)
};
const GENERIC_ID_PREFIX = {
  PurchasableItem: "0",
  CustomAvatarItem: "1"
};
const GENERIC_ROW_SIZE = 50;
const STORE_ROW_RULES = {
  // Equipment skins — the Maker Pen, the sword, the disc golf disc and so on.
  skinsitems: { kind: CatalogKind.Skin },
  // Wearable categories, by name for want of anything better to filter on.
  headwearitems: { kind: CatalogKind.AvatarItem, nameContains: ["hat"] },
  topsitems: { kind: CatalogKind.AvatarItem, nameContains: ["shirt", "jacket", "dress"] },
  handsitems: { kind: CatalogKind.AvatarItem, nameContains: ["glove", "hand", "wrist"] },
  hairitems: { kind: CatalogKind.AvatarItem, nameContains: ["hair"] },
  facialhairitems: {
    kind: CatalogKind.AvatarItem,
    nameContains: ["beard", "mustache"]
  },
  waistitems: { kind: CatalogKind.AvatarItem, nameContains: ["belt"] },
  accessoriesitems: {
    kind: CatalogKind.AvatarItem,
    nameContains: ["earrings", "hearing aids"]
  },
  footwearitems: {
    kind: CatalogKind.AvatarItem,
    nameContains: ["shoes", "sneakers", "sandals", "boots"]
  },
  bottomsitems: { kind: CatalogKind.AvatarItem, nameContains: ["pants", "shorts"] },
  shoulderitems: {
    kind: CatalogKind.AvatarItem,
    nameContains: ["quiver", "backpack", "sword"]
  }
};
const DEFAULT_STORE_ROW_RULE = { kind: CatalogKind.AvatarItem };
async function randomCatalogIds(c, rule) {
  const binds = [];
  const bind = (v) => `?${binds.push(v)}`;
  const where = [`kind = ${bind(rule.kind)}`, "catalog_id IS NOT NULL"];
  where.push(`rarity NOT IN (${UNSELLABLE_RARITIES.map((r) => bind(r)).join(", ")})`);
  if (rule.nameContains !== void 0 && rule.nameContains.length > 0) {
    const any = rule.nameContains.map((needle) => {
      const escaped = needle.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
      return `lower(friendly_name) LIKE ${bind(`%${escaped}%`)} ESCAPE '\\'`;
    }).join(" OR ");
    where.push(`(${any})`);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT catalog_id FROM catalog WHERE ${where.join(" AND ")}
		 ORDER BY RANDOM() LIMIT ${bind(GENERIC_ROW_SIZE)}`
  ).bind(...binds).all();
  return results.map((r) => r.catalog_id);
}
async function genericRowEntities(c) {
  const ids = await randomCatalogIds(c, DEFAULT_STORE_ROW_RULE);
  return entities(ids.map((id) => `${GENERIC_ID_PREFIX.PurchasableItem}.${id}`));
}
async function purchasableItemRowEntities(c, key) {
  const ids = await randomCatalogIds(c, STORE_ROW_RULES[key] ?? DEFAULT_STORE_ROW_RULE);
  return entities(ids.map((id) => String(id)));
}
const STATIC_ROW_ENTITIES = {
  // Empty. The store carousels that lived here —
  // `summerpartycarousel` (the Featured page's "Medieval Masterpieces from the Community")
  // and `newitems` (the Clothing page's "New") — are asked for with `?type=5`, and Generic is
  // answered by the TYPE from the catalog table now, so a static entry for either was already
  // unreachable. See {@link genericRowEntities}.
  //
  // The table stays because it is the right home for a row somebody picks by hand, and the
  // handler still consults it; nothing is hand-picked at the moment.
};
const DEFAULT_ALGORITHMIC_LIST_TYPE = ListEntityType.Rooms;
async function ownedList(c, creatorAccountId, type, name) {
  const accountId = Number.parseInt(creatorAccountId ?? "", 10);
  const listType = Number.parseInt(type ?? "", 10);
  if (!Number.isInteger(accountId) || !Number.isInteger(listType) || !name) return void 0;
  return getPlayerList(c.env.DB, accountId, listType, name);
}
function bodyField(body, c, name) {
  const key = Object.keys(body).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key === void 0 ? void 0 : body[key];
  return typeof value === "string" ? value : c.req.query(name);
}
function intField(body, c, name, fallback) {
  const parsed = Number.parseInt(bodyField(body, c, name) ?? "", 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}
const app = new Hono().use(
  "*",
  // middleware
  (c, next) => useWorkersLogger(c.env.NAME, {
    environment: c.env.ENVIRONMENT,
    release: c.env.SENTRY_RELEASE
  })(c, next)
).onError(withOnError()).notFound(withNotFound()).get(
  "/",
  describeRoute({
    tags: ["Service"],
    summary: "Health check",
    description: "Liveness probe for the lists worker. No auth; the body is plain text.",
    responses: {
      200: {
        description: "Service is up",
        content: { "text/plain": { schema: { type: "string", example: "hello, world!" } } }
      }
    }
  }),
  async (c) => {
    return c.text("hello, world!");
  }
).get(
  "/curatedlists/bulk",
  describeRoute({
    tags: ["Lists", "2025"],
    summary: "Curated lists by id",
    description: [
      "A set of curated lists, asked for by repeating `?id=`. Nothing curates lists here yet,",
      "so this serves ONE canned list whatever is asked for \u2014 an unknown id included, because",
      "a 404 shows as a row that failed to load rather than one the client hides.",
      "",
      "The canned list is shaped the way the client parses one: `ItemIds` are strings rather",
      "than numbers, `Description` may be null, and `ImageName` has to be a string \u2014 the",
      "client reads it straight into a string field."
    ].join("\n"),
    parameters: [LIST_IDS_PARAM],
    responses: { 200: json(CuratedListsBulk, "The canned list, as a one-element array") }
  }),
  async (c) => {
    return c.json([
      {
        ListId: 17859340,
        CreatorAccountId: 1,
        Name: "My List",
        Description: null,
        ImageName: "",
        Type: ListEntityType.Rooms,
        ItemIds: ["123", "456"],
        CreatedAt: "2025-07-18T00:00:00Z"
      }
    ]);
  }
).get(
  "/curatedlists",
  describeRoute({
    tags: ["Lists", "2025"],
    summary: "One curated list",
    description: [
      "ONE list object \u2014 not a collection \u2014 asked for with the same three parameters whether",
      "the client wants a discovery PAGE\u2019s row set or a PLAYER\u2019s own playlist:",
      "",
      "- A page\u2019s rows are a static capture in `static/curated-lists.json`, whose `ItemIds`",
      "  are the discovery section keys the page is built from (not room ids).",
      "- A player\u2019s playlist lives in D1, in the `list` / `list_item` tables this worker owns.",
      "  `__SavedForLater_Rooms` is the one the client creates for itself \u2014 the Play menu\u2019s",
      "  \u201CSaved for Later\u201D row, asked for with the player\u2019s own id and `type=1` (Rooms), so its",
      "  `ItemIds` are room ids.",
      "",
      "D1 is asked FIRST, so a player\u2019s own list wins over a capture that happens to share its",
      "name: the captures are this server\u2019s fixtures and a player\u2019s list is their data.",
      "",
      "Not auth-gated \u2014 the client names the owner rather than proving it, `Accessibility` is a",
      "property of the list rather than of the reader, and the answer is only ever ids the",
      "client then resolves itself.",
      "",
      "A name matching NEITHER answers an EMPTY PLACEHOLDER: a whole list object echoing the",
      "name and `type` asked for, with no `ItemIds`. The client breaks on anything that is",
      "not a list, so a miss cannot be `{}` or a 404; and answering it with an unrelated",
      "capture would put one page\u2019s rows under another page\u2019s heading, which reads as real",
      "content. The two exceptions resolve to real lists rather than placeholders \u2014 a",
      "reserved `__` playlist nobody owns yet, and a request naming no list at all, which",
      "gets the page default for its `type`."
    ].join("\n"),
    parameters: [CREATOR_ACCOUNT_ID_PARAM, LIST_TYPE_PARAM, LIST_NAME_PARAM],
    responses: {
      200: json(CuratedListRead, "The list, or an empty placeholder when there is no such list")
    }
  }),
  async (c) => {
    const creatorAccountId = c.req.query("creatorAccountId");
    const type = c.req.query("type");
    const name = c.req.query("name");
    const list = await ownedList(c, creatorAccountId, type, name) ?? resolveCuratedList(creatorAccountId, type, name) ?? placeholderCuratedList(creatorAccountId, type, name);
    return c.body(serializeCuratedList(list), 200, { "content-type": "application/json" });
  }
).put(
  "/curatedlists/:name/items/:itemId/createlistifneeded",
  describeRoute({
    tags: ["Lists", "2025"],
    summary: "Save an item into the caller\u2019s list",
    description: [
      "Saves an item into one of the caller\u2019s own lists, creating the list when they have none",
      "by that name \u2014 what the client calls when someone saves a room for later. The path names",
      "the list and the item; the form body carries `accessibility` and `type`, both of which",
      "apply only on creation.",
      "",
      "AUTH-GATED, and the owner is the TOKEN\u2019s account: unlike the read, this call names no",
      "`creatorAccountId`, so the only account it could mean is the caller\u2019s \u2014 and taking an",
      "owner from the client would let anyone write into anyone\u2019s list.",
      "",
      "Answers the list as it now stands rather than an acknowledgement, so the row the client",
      "re-renders is the one this call just changed. Saving the same item twice leaves it in",
      "the list once.",
      "",
      "The response drops `Accessibility`, which the read keeps. That is a real difference in",
      "what the client is sent, not an oversight \u2014 every other key, and their order, is the",
      "read\u2019s."
    ].join("\n"),
    security: AUTHED,
    parameters: [SAVE_LIST_NAME_PARAM, ITEM_ID_PARAM],
    requestBody: form(SaveItemBody, "Applied only when the list is created"),
    responses: {
      200: json(CuratedListSaved, "The list as it now stands, without `Accessibility`"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const accountId = await authedId(c);
    if (accountId === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const list = await addPlayerListItem(
      c.env.DB,
      {
        creatorAccountId: accountId,
        name: c.req.param("name"),
        // The `ListEntityType`, saying what the item ids in this list ARE. Rooms when the
        // body names none: every list the client creates this way is a room list, and the
        // type is part of the list's identity, so guessing another would strand the list
        // where the client's own read (`?type=1`) can't find it.
        type: intField(body, c, "type", ListEntityType.Rooms),
        // PRIVATE by default. A list a player builds for themselves is theirs to see;
        // the client sends `accessibility=0` and this only applies on creation anyway.
        accessibility: intField(body, c, "accessibility", Accessibility.Private)
      },
      c.req.param("itemId")
    );
    const { Accessibility: _accessibility, ...saved } = list;
    return c.body(serializeCuratedList(saved), 200, { "content-type": "application/json" });
  }
).get(
  "/algorithmiclists/:list",
  describeRoute({
    tags: ["Lists", "2025"],
    summary: "One discovery row\u2019s contents",
    description: [
      "The entities that fill one discovery row. `{list}` is the row key a curated page lists",
      "in its `ItemIds` (e.g. `Rooms_Battle_AlgoEndpoint_PlayHighlight_TabsTest_Explore`), and",
      "only the IDS travel \u2014 the client resolves each room or item itself.",
      "",
      "`HotList`, `recentlyupdated` and `new` are ranked live off the same room tables the",
      "`rooms` worker\u2019s browse feeds read, so a row and its feed can\u2019t disagree. The",
      "`*_algoendpoint` category rows serve the public rooms carrying one tag, busiest first.",
      "`recentlyvisited` is per-caller and is the one row that reads the token; without one it",
      "answers EMPTY rather than 401ing, since canned rooms would claim the caller visited",
      "rooms they never did \u2014 and an empty carousel is what a brand-new account legitimately",
      "has. A couple of store rows are hand-picked id lists.",
      "",
      "Every other row \u2014 an unknown key included \u2014 answers an EMPTY 200 rather than a 404,",
      "which the client renders as a row that failed to load instead of one it hides.",
      "",
      "`?type=5` (Generic) is answered by the TYPE rather than by the slug, because a Generic",
      "row\u2019s ids are `<prefix>.<id>` composites \u2014 exactly one dot, `0.<int>` a purchasable",
      "item and `1.<guid>` a custom avatar item \u2014 that the client resolves one at a time.",
      "It serves a random draw of sellable purchasable items from the `catalog` table, since",
      "nothing here ranks store items yet; the number in each id is the `catalog_id`, which",
      "is the same `PurchasableItemId` the generated storefront carries.",
      "`?type=4` (PurchasableItems) is answered by the type too, from the same draw, but",
      "with BARE ids: a typed row\u2019s `Type` already says what its ids are, so only a Generic",
      "row needs the prefix. There the SLUG picks what is drawn: `skinsitems` returns",
      "equipment skins, and `headwearitems` / `topsitems` / `handsitems` / `hairitems` /",
      "`facialhairitems` / `waistitems` / `accessoriesitems` / `footwearitems` /",
      "`bottomsitems` / `shoulderitems` return avatar items whose names contain one of that row\u2019s words \u2014",
      "\u201Chat\u201D, \u201Cshirt\u201D/\u201Cjacket\u201D/\u201Cdress\u201D, \u201Cglove\u201D/\u201Chand\u201D/\u201Cwrist\u201D, \u201Chair\u201D,",
      "\u201Cbeard\u201D/\u201Cmustache\u201D, \u201Cbelt\u201D,",
      "\u201Cearrings\u201D/\u201Chearing aids\u201D, \u201Cshoes\u201D/\u201Csneakers\u201D/\u201Csandals\u201D/\u201Cboots\u201D, \u201Cpants\u201D/\u201Cshorts\u201D,",
      "\u201Cquiver\u201D/\u201Cbackpack\u201D/\u201Csword\u201D. Every other row returns the whole avatar-item catalog.",
      "The name match is a stand-in \u2014 the catalog records no",
      "category \u2014 so it takes anything the word appears in. No generated storefront lists",
      "skins yet, so a client has nothing to resolve those ids against."
    ].join("\n"),
    parameters: [ALGORITHMIC_LIST_PARAM, ALGORITHMIC_TYPE_PARAM],
    responses: { 200: json(AlgorithmicList, "The row\u2019s entities, possibly none") }
  }),
  async (c) => {
    const type = Number.parseInt(c.req.query("type") ?? "", 10);
    const echoed = type >= 0 && type <= MAX_LIST_ENTITY_TYPE ? type : DEFAULT_ALGORITHMIC_LIST_TYPE;
    const key = c.req.param("list").toLowerCase();
    if (echoed === ListEntityType.Generic) {
      return c.json({ Type: echoed, Entities: await genericRowEntities(c) });
    }
    if (echoed === ListEntityType.PurchasableItems) {
      return c.json({ Type: echoed, Entities: await purchasableItemRowEntities(c, key) });
    }
    const personal = PERSONAL_ROW_FEEDS[key];
    if (personal !== void 0) {
      const accountId = await authedId(c);
      const rooms = accountId === null ? [] : await personal(c.env.DB, accountId);
      return c.json({ Type: echoed, Entities: toEntities(rooms) });
    }
    const feed = ROW_FEEDS[key];
    if (feed !== void 0) {
      return c.json({ Type: echoed, Entities: toEntities(await feed(c.env.DB)) });
    }
    const canned = STATIC_ROW_ENTITIES[key];
    if (canned !== void 0) {
      return c.json({ Type: echoed, Entities: canned });
    }
    return c.json({ Type: echoed, Entities: ALGORITHMIC_LIST_ENTITIES });
  }
).post(
  "/contextualfeatures",
  describeRoute({
    tags: ["Lists", "2025"],
    summary: "Acknowledge a contextual-features post",
    description: [
      "The client posts the context it is in and reads back whether the call was accepted.",
      "Auth-gated, and the answer is a bare `{ success, error_id, error }` with no payload:",
      "the reference server acknowledges the post and carries nothing back, so there is",
      "nothing here to serve beyond the acknowledgement itself. The body is read for the log",
      "only."
    ].join("\n"),
    security: AUTHED,
    responses: {
      200: json(ContextualFeaturesAck, "Accepted"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json({ success: true, error_id: null, error: null });
  }
);
app.get(
  "/openapi.json",
  describeRoute({ hide: true }),
  withCleanSpec(
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "recflare lists",
          version: "1.0.0",
          description: [
            "Curated and algorithmic lists for recflare, a private-server reimplementation of the",
            "Rec Room backend. A discovery page is built from these: the `discovery` worker says",
            "which carousels a page has, and this worker says what is in them.",
            "",
            "Two kinds of list. A CURATED list is named \u2014 either a static capture of a page\u2019s row",
            "set, or a player\u2019s own playlist in D1 (`__SavedForLater_Rooms`, the Play menu\u2019s",
            "\u201CSaved for Later\u201D). An ALGORITHMIC list is a ranking asked for by row slug: the hot,",
            "recently-updated and new feeds, the room categories, and the caller\u2019s own recently",
            "visited rooms.",
            "",
            "Only IDS travel. Every list answers ids the client resolves against the `rooms` and",
            "`commerce` workers itself, which is why a list carries a `Type` saying what its ids",
            "ARE \u2014 answering with a type the caller didn\u2019t ask for would have it look the ids up",
            "against the wrong service.",
            "",
            "A row with nothing behind it answers an empty 200 rather than a 404: the client",
            "renders a failed row for an error and hides an empty one, and an empty carousel is",
            "the honest answer for a ranking this server has nothing for.",
            "",
            "Reads are unauthenticated \u2014 the client names the owner rather than proving it, and a",
            "list is only ever ids. Writing needs a token, since the list written into is the",
            "caller\u2019s own."
          ].join("\n")
        },
        servers: [{ url: "https://lists.recflare.net", description: "Production" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "An `access_token` from the auth worker\u2019s `POST /connect/token`."
            }
          }
        }
      }
    })
  )
);
var stdin_default = app;
export {
  stdin_default as default
};
