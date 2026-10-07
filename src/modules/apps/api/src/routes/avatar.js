// Ported from apps/api/src/routes/avatar.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import {
  CURRENT_OUTFIT_SLOT,
  getOutfit,
  getOutfits,
  getOutfitsByAccounts,
  inventionDescriptionRejection,
  inventionLongDescriptionRejection,
  inventionNameRejection,
  inventionTagRejection,
  MAX_BULK_OUTFIT_ACCOUNTS,
  setOutfit
} from "../../../../packages/domain/src/index.js";
import {
  createCustomAvatarItem,
  deleteCustomAvatarItem,
  getCustomAvatarItem,
  getCustomAvatarItems,
  listCustomAvatarItemsByCreator,
  listFeaturedCustomAvatarItems,
  listHotCustomAvatarItems,
  searchCustomAvatarItems,
  updateCustomAvatarItem
} from "../custom-avatar-items-db.js";
import { authedId, unauthorized } from "../http.js";
import {
  createInvention,
  deleteInvention,
  getFeaturedInventions,
  getInventionById,
  getInventionsByIds,
  getInventionsByRoom,
  getInventionTagFilters,
  getInventionTags,
  getInventionVersion,
  getMyInventions,
  getTopInventions,
  INVENTION_TAG_RESULT,
  inventionDeleteResult,
  inventionSaveV9Failure,
  isInventionCheered,
  normalizeInventionTags,
  ownsAllInventions,
  parsePermissionLevel,
  publishInvention,
  searchInventions,
  setInventionCheer,
  setInventionPrice,
  setInventionTags,
  toSaveResult,
  toSaveResultV9,
  updateInvention
} from "../inventions-db.js";
import {
  AUTHED,
  BareBoolean,
  BareInteger,
  BulkCustomAvatarItemsRequest,
  CreateCustomAvatarItemRequest,
  CustomAvatarItemList,
  CustomAvatarItemReportRequest,
  CustomAvatarItemResponse,
  CustomAvatarItemsPage,
  DeleteInventionRequest,
  ErrorResponse,
  form,
  GeneratedGift,
  GenerateGiftRequest,
  idParam,
  intQuery,
  InventionCheerRequest,
  InventionDeleteResult,
  InventionDetails,
  InventionDto,
  InventionPersonalDetails,
  InventionReportRequest,
  InventionSaveResult,
  InventionSaveV9Result,
  InventionVersionDto,
  json,
  JsonArray,
  jsonBody,
  LegacyAvatarItemSaves,
  OPTIONAL_AUTHED,
  OutfitSaveResponse,
  OutfitsBulkRequest,
  OutfitsBulkResponse,
  OutfitsMeRequest,
  OutfitsMeResponse,
  pageParams,
  PublishInventionRequest,
  SaveInventionRequest,
  SaveInventionV9Request,
  SetTagsRequest,
  SetTagsResponse,
  stringParam,
  stringQuery,
  SuccessErrorEnvelope,
  SuccessValueEnvelope,
  TagFilters,
  UNAUTHORIZED_RESPONSE,
  UpdateCustomAvatarItemRequest,
  UpdateInventionMetadataRequest,
  UpdatePriceRequest
} from "../openapi.js";
import { createReport } from "../reports-db.js";
import { exceedsApiUploadLimit, maxApiUploadBytes } from "../upload-limit.js";
const BULK_CUSTOM_AVATAR_ITEM_CAP = 100;
async function bulkCustomAvatarItemIds(c) {
  const raw = [...c.req.queries("customAvatarItemIds") ?? []];
  const body = await c.req.parseBody({ all: true }).catch(() => ({}));
  const key = Object.keys(body).find((k) => k.toLowerCase() === "customavataritemids");
  const posted = key === void 0 ? [] : body[key];
  for (const value of Array.isArray(posted) ? posted : [posted]) {
    if (typeof value === "string") raw.push(value);
  }
  return raw.flatMap((value) => value.split(",")).map((v) => v.trim()).filter((v) => v !== "");
}
async function creatorsInventionResult(c, inventionId) {
  const playerId = await authedId(c);
  if (playerId === null) return { rejection: "Unauthorized", status: 401 };
  if (Number.isNaN(inventionId)) return { rejection: "inventionId is required", status: 400 };
  const invention = await getInventionById(c.env.DB, inventionId);
  if (invention === null) return { rejection: "No such invention", status: 404 };
  if (invention.CreatorPlayerId !== playerId) {
    return { rejection: "Not your invention", status: 403 };
  }
  return { invention };
}
async function creatorsInvention(c, inventionId) {
  const gate = await creatorsInventionResult(c, inventionId);
  if ("invention" in gate) return gate;
  if (gate.status === 401) return { response: unauthorized(c) };
  if (gate.status === 404) return { response: c.notFound() };
  return { response: c.json({ error: gate.rejection }, gate.status) };
}
function requestedTags(request) {
  if (typeof request !== "object" || request === null) return null;
  const lists = request;
  const strings = (v) => Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  const autoTags = strings(lists.AutoTags);
  const customTags = strings(lists.CustomTags);
  const rejected = [...autoTags, ...customTags].some((raw) => {
    const tag = raw.trim().toLowerCase();
    return tag !== "" && inventionTagRejection(tag) !== null;
  });
  return rejected ? { tags: [], tagResult: INVENTION_TAG_RESULT.rejected } : { tags: normalizeInventionTags(autoTags, customTags), tagResult: INVENTION_TAG_RESULT.success };
}
async function createInventionFromBody(c, creatorPlayerId, body) {
  const str = (v) => typeof v === "string" ? v : void 0;
  const num = (v) => typeof v === "number" ? v : void 0;
  const bool = (v) => typeof v === "boolean" ? v : void 0;
  const list = (v, is) => Array.isArray(v) ? v.filter(is) : void 0;
  const isString = (v) => typeof v === "string";
  const isNumber = (v) => typeof v === "number";
  const inventionDataFilename = str(body.inventionDataFilename)?.trim();
  if (!inventionDataFilename) return { rejection: "inventionDataFilename is required" };
  const name = str(body.name)?.trim();
  const nameRejection = name === void 0 || name === "" ? null : inventionNameRejection(name);
  if (nameRejection !== null) return { rejection: nameRejection };
  const description = str(body.description);
  const descriptionRejection = description === void 0 ? null : inventionDescriptionRejection(description);
  if (descriptionRejection !== null) return { rejection: descriptionRejection };
  const requested = requestedTags(body.tagsRequest) ?? {
    tags: [],
    tagResult: INVENTION_TAG_RESULT.success
  };
  const invention = await createInvention(c.env.DB, c.env.CDN_ASSETS, {
    creatorPlayerId,
    inventionDataFilename,
    name,
    description,
    imageName: str(body.imageName),
    instantiationCost: num(body.instantiationCost),
    lightsCost: num(body.lightsCost),
    chipsCost: num(body.chipsCost),
    cloudVariablesCost: num(body.cloudVariablesCost),
    aiCost: num(body.aiCost),
    creationRoomId: num(body.creationRoomId),
    referencedInventions: list(body.referencedInventions, isNumber),
    ugcVersion: num(body.ugcVersion),
    hasBetaContent: bool(body.hasBetaContent),
    referencedUnityAssetIds: list(body.referencedUnityAssetIds, isString),
    longDescription: str(body.longDescription),
    displayMetadataJson: str(body.displayMetadataJson),
    convertedFromInventionId: num(body.convertedFromInventionId),
    tags: requested.tags
  });
  return { invention, ...requested };
}
function inventionIdQuery(c) {
  return c.req.queries("id")?.flatMap((raw) => raw.split(",")).map((raw) => Number.parseInt(raw.trim(), 10)).filter((id) => !Number.isNaN(id)) ?? [];
}
const avatarRoutes = new Hono({ strict: false }).post(
  "/api/avatar/v2/gifts/generate",
  describeRoute({
    tags: ["Avatar"],
    summary: "Generate a gift box",
    description: "Mint the gift box a player earned (levelling up, a room reward). With no EarnableRewards catalog wired up this always falls back to a token gift of a random amount, and the box is not persisted \u2014 its `Id` is 0 and it cannot be opened through the `econ` worker\u2019s consume endpoint.",
    security: AUTHED,
    requestBody: form(GenerateGiftRequest, "Where the gift was earned"),
    responses: {
      200: json(GeneratedGift, "The generated (unpersisted) gift"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const giftContext = typeof body.GiftContext === "string" ? Number.parseInt(body.GiftContext, 10) || 0 : 0;
    const message = typeof body.Message === "string" ? body.Message : "";
    const xp = typeof body.Xp === "string" ? Number.parseInt(body.Xp, 10) || 0 : 0;
    const tokenAmounts = [10, 25, 50, 100, 250, 500];
    const currency = tokenAmounts[Math.floor(Math.random() * tokenAmounts.length)];
    return c.json({
      Id: 0,
      // TODO: real id once gifts are persisted
      FromPlayerId: 1,
      ConsumableItemDesc: "",
      AvatarItemDesc: "",
      FriendlyName: "",
      AvatarItemType: 0,
      EquipmentPrefabName: "",
      EquipmentModificationGuid: "",
      CurrencyType: 2,
      Currency: currency,
      Xp: xp,
      Level: 0,
      Platform: -1,
      PlatformsToSpawnOn: -1,
      BalanceType: 0,
      GiftContext: giftContext,
      GiftRarity: 20,
      Message: message
    });
  }
).post(
  "/api/avatar/v1/lockeditems/bulk",
  describeRoute({
    tags: ["Avatar"],
    summary: "Locked avatar items in bulk",
    description: "Resolves a batch of avatar-item ids to the ones that are LOCKED for the caller, as a bare array. Nothing on this server locks avatar items, so it is always `[]` and the posted ids are not parsed \u2014 a miss is not an error, the client simply renders nothing as locked.\n\nNo auth, matching the reference, which returns the empty array without checking a token \u2014 in contrast to `/api/customAvatarItems/v1/bulk`, which validates one first.",
    responses: { 200: json(JsonArray, "The locked items \u2014 always empty here") }
  }),
  (c) => c.json([])
).get(
  "/api/customAvatarItems/v1/isCreationAllowedForAccount",
  describeRoute({
    tags: ["Avatar"],
    summary: "May this account create custom items?",
    description: "A feature gate with no backing implementation \u2014 we answer yes. Note this one wraps its answer in the `{ success, value }` envelope while the two gates below return a bare boolean.",
    responses: { 200: json(SuccessValueEnvelope, "Allowed") }
  }),
  (c) => c.json({ success: true, value: null })
).get(
  "/api/customAvatarItems/v1/isCreationEnabled",
  describeRoute({
    tags: ["Avatar"],
    summary: "Is custom-item creation enabled?",
    description: "A server-wide feature gate. Enabled; flip to `false` to disable the flow.",
    responses: { 200: json(BareBoolean, "A bare `true`") }
  }),
  (c) => c.json(true)
).get(
  "/api/customAvatarItems/v1/isRenderingEnabled",
  describeRoute({
    tags: ["Avatar"],
    summary: "Is custom-item rendering enabled?",
    description: "A server-wide feature gate. Enabled; flip to `false` to disable the flow.",
    responses: { 200: json(BareBoolean, "A bare `true`") }
  }),
  (c) => c.json(true)
).get(
  "/api/customAvatarItems/v1/minPriceForPublicItem",
  describeRoute({
    tags: ["Avatar"],
    summary: "Minimum token price for a public custom item",
    description: "The floor the creation UI enforces when listing a custom item publicly. A fixed `100`.",
    responses: { 200: json(BareInteger, "A bare `100`") }
  }),
  (c) => c.json(100)
).post(
  "/api/customAvatarItems/v1",
  describeRoute({
    tags: ["Avatar"],
    summary: "Create a custom avatar item",
    description: "Multipart: a `metadata` JSON text field plus two file parts, `thumbnailImage` (PNG) and `design` (the design blob). Inserts a `custom_avatar_item` row owned by the caller and answers with it in the PascalCase `{ Value, Success, Error, error_id }` envelope.\n\nThe two files go to the shared image bucket (`recflare-img`) under `avatar-item/<date>/<id>-thumb.png` and `avatar-item/<date>/<id>-design.png`; those keys are the `ThumbnailImageFilename` / `DesignFilename` on the row.",
    security: AUTHED,
    requestBody: form(CreateCustomAvatarItemRequest, "The metadata and the two files"),
    responses: {
      200: json(CustomAvatarItemResponse, "The created item"),
      400: json(CustomAvatarItemResponse, "Missing or malformed metadata / files"),
      401: UNAUTHORIZED_RESPONSE,
      413: json(CustomAvatarItemResponse, "Either file exceeds the configured per-file limit")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const fail = (message) => c.json({ Value: null, Success: false, Error: message, error_id: null }, 400);
    const body = await c.req.parseBody().catch(() => ({}));
    if (typeof body.metadata !== "string") return fail("metadata is required");
    let meta;
    try {
      const parsed = JSON.parse(body.metadata);
      if (!parsed || typeof parsed !== "object") return fail("metadata must be a JSON object");
      meta = parsed;
    } catch {
      return fail("metadata is not valid JSON");
    }
    if (typeof meta.Name !== "string" || meta.Name.trim() === "") return fail("Name is required");
    if (typeof meta.BaseAvatarItemId !== "number") return fail("BaseAvatarItemId is required");
    if (typeof meta.BaseAvatarItemColor !== "string")
      return fail("BaseAvatarItemColor is required");
    if (!(body.thumbnailImage instanceof File)) return fail("thumbnailImage is required");
    if (!(body.design instanceof File)) return fail("design is required");
    const limit = maxApiUploadBytes(c.env);
    if (exceedsApiUploadLimit(body.thumbnailImage, limit)) {
      return c.json(
        {
          Value: null,
          Success: false,
          Error: `thumbnailImage exceeds the ${limit}-byte upload limit`,
          error_id: null
        },
        413
      );
    }
    if (exceedsApiUploadLimit(body.design, limit)) {
      return c.json(
        {
          Value: null,
          Success: false,
          Error: `design exceeds the ${limit}-byte upload limit`,
          error_id: null
        },
        413
      );
    }
    const customAvatarItemId = crypto.randomUUID();
    const prefix = `avatar-item/${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}/${customAvatarItemId}`;
    const thumbnailImageFilename = `${prefix}-thumb.png`;
    const designFilename = `${prefix}-design.png`;
    await Promise.all([
      c.env.IMAGES.put(thumbnailImageFilename, await body.thumbnailImage.arrayBuffer(), {
        httpMetadata: { contentType: body.thumbnailImage.type || "image/png" }
      }),
      c.env.IMAGES.put(designFilename, await body.design.arrayBuffer(), {
        httpMetadata: { contentType: body.design.type || "image/png" }
      })
    ]);
    const item = await createCustomAvatarItem(c.env.DB, {
      customAvatarItemId,
      creatorAccountId: id,
      name: meta.Name,
      description: typeof meta.Description === "string" ? meta.Description : "",
      price: typeof meta.Price === "number" ? meta.Price : 0,
      baseAvatarItemId: meta.BaseAvatarItemId,
      baseAvatarItemColor: meta.BaseAvatarItemColor,
      accessibility: typeof meta.Accessibility === "number" ? meta.Accessibility : 0,
      designFilename,
      thumbnailImageFilename
    });
    return c.json({ Value: item, Success: true, Error: null, error_id: null });
  }
).put(
  "/api/customAvatarItems/v1/:id{[0-9a-fA-F-]{36}}",
  describeRoute({
    tags: ["Avatar"],
    summary: "Edit a custom avatar item",
    description: 'A partial edit of `Name`, `Description`, `Price` and `Accessibility` \u2014 the client sends every field and nulls the ones it is not changing, so null means "leave alone". Only the creator may edit. `ModifiedAt` is bumped. Answers the updated item in the same `{ Value, Success, Error, error_id }` envelope as the create.',
    security: AUTHED,
    parameters: [stringParam("id", "The `CustomAvatarItemId`")],
    requestBody: jsonBody(UpdateCustomAvatarItemRequest, "The fields to change"),
    responses: {
      200: json(CustomAvatarItemResponse, "The updated item"),
      400: json(CustomAvatarItemResponse, "Malformed body"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(CustomAvatarItemResponse, "Not the creator"),
      404: json(CustomAvatarItemResponse, "No such item")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const fail = (status, message) => c.json({ Value: null, Success: false, Error: message, error_id: null }, status);
    const itemId = c.req.param("id");
    const existing = await getCustomAvatarItem(c.env.DB, itemId);
    if (!existing) return fail(404, "No such item");
    if (existing.CreatorAccountId !== id) return fail(403, "Not your item");
    const body = await c.req.json().catch(() => null);
    if (!body) return fail(400, "A JSON body is required");
    const str = (v, field) => {
      if (v === null || v === void 0) return null;
      if (typeof v !== "string") throw new TypeError(`${field} must be a string`);
      return v;
    };
    const int = (v, field) => {
      if (v === null || v === void 0) return null;
      if (typeof v !== "number" || !Number.isInteger(v))
        throw new TypeError(`${field} must be an integer`);
      return v;
    };
    let patch;
    try {
      patch = {
        name: str(body.Name, "Name"),
        description: str(body.Description, "Description"),
        price: int(body.Price, "Price"),
        accessibility: int(body.Accessibility, "Accessibility")
      };
    } catch (e) {
      return fail(400, e.message);
    }
    if (patch.name !== null && patch.name?.trim() === "")
      return fail(400, "Name must not be blank");
    const item = await updateCustomAvatarItem(c.env.DB, itemId, patch);
    if (!item) return fail(404, "No such item");
    return c.json({ Value: item, Success: true, Error: null, error_id: null });
  }
).delete(
  "/api/customAvatarItems/v1/:id{[0-9a-fA-F-]{36}}",
  describeRoute({
    tags: ["Avatar"],
    summary: "Delete a custom avatar item",
    description: "Removes the item and its two bucket objects (thumbnail and design). Only the creator may delete. Answers the deleted item in the `{ Value, Success, Error, error_id }` envelope.",
    security: AUTHED,
    parameters: [stringParam("id", "The `CustomAvatarItemId`")],
    responses: {
      200: json(CustomAvatarItemResponse, "The deleted item"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(CustomAvatarItemResponse, "Not the creator"),
      404: json(CustomAvatarItemResponse, "No such item")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const fail = (status, message) => c.json({ Value: null, Success: false, Error: message, error_id: null }, status);
    const itemId = c.req.param("id");
    const existing = await getCustomAvatarItem(c.env.DB, itemId);
    if (!existing) return fail(404, "No such item");
    if (existing.CreatorAccountId !== id) return fail(403, "Not your item");
    const item = await deleteCustomAvatarItem(c.env.DB, itemId);
    if (!item) return fail(404, "No such item");
    await c.env.IMAGES.delete([item.ThumbnailImageFilename, item.DesignFilename]);
    return c.json({ Value: item, Success: true, Error: null, error_id: null });
  }
).get(
  "/api/customAvatarItems/v1/featured",
  describeRoute({
    tags: ["Avatar"],
    summary: "Featured custom avatar items",
    description: "The curated feed: items with `IsFeatured` set that are also published (`Accessibility` 0 is unpublished and is excluded even when flagged), newest first, up to 50. Nothing sets the flag yet, so it stays empty until an operator does.",
    responses: { 200: json(CustomAvatarItemList, "The items, newest first") }
  }),
  async (c) => c.json(await listFeaturedCustomAvatarItems(c.env.DB))
).get(
  "/api/customAvatarItems/v1/search",
  describeRoute({
    tags: ["Avatar"],
    summary: "Search custom avatar items",
    description: [
      "The store\u2019s item search: published items (`Accessibility` 0 is unpublished and is",
      "left out, from its creator too \u2014 `fromCreator` is where they see their own),",
      "newest first, as a BARE ARRAY.",
      "`searchQuery` matches an item\u2019s NAME or its DESCRIPTION, case-insensitively, as a",
      "substring; `%` and `_` in it are literal.",
      "`outfitTypes` may repeat and acts as a whitelist; sending none means no filter",
      "rather than no results, since the client sends every type it can render.",
      "`minPrice`/`maxPrice` bound the price, inclusive.",
      "`skip`/`take` page the results, `take` capped at 200.",
      "`includeCoachItems=false` leaves out this server\u2019s stock content.",
      "`itemTypes`, `ordering`, `unityAssetTarget` and `unityAssetVersion` are accepted and",
      "NOT yet acted on \u2014 nothing records purchase or wear counts to rank by, no per-target",
      "asset variants are stored, and custom avatar items are the only item type there is.",
      "`includePurchaseInfos` likewise: `PurchaseInfo` is null on every item for now,",
      "whatever it says."
    ].join(" "),
    parameters: [
      {
        name: "searchQuery",
        in: "query",
        required: false,
        description: "Free text matched against the item\u2019s name or description",
        schema: { type: "string" }
      },
      {
        name: "outfitTypes",
        in: "query",
        required: false,
        description: "OutfitType to include; repeat for several. None means all.",
        schema: { type: "array", items: { type: "integer" } }
      },
      {
        name: "skip",
        in: "query",
        required: false,
        description: "Rows to skip (default 0)",
        schema: { type: "integer", minimum: 0 }
      },
      {
        name: "take",
        in: "query",
        required: false,
        description: "Rows to return (default 50, capped at 200)",
        schema: { type: "integer", minimum: 0 }
      },
      {
        name: "minPrice",
        in: "query",
        required: false,
        description: "Lowest price to include, inclusive",
        schema: { type: "integer", minimum: 0 }
      },
      {
        name: "maxPrice",
        in: "query",
        required: false,
        description: "Highest price to include, inclusive",
        schema: { type: "integer", minimum: 0 }
      },
      {
        name: "includeCoachItems",
        in: "query",
        required: false,
        description: "Include the Coach\u2019s stock items (default true)",
        schema: { type: "boolean" }
      }
    ],
    responses: { 200: json(CustomAvatarItemList, "The matching items, newest first") }
  }),
  async (c) => {
    const outfitTypes = c.req.queries("outfitTypes")?.map((v) => Number.parseInt(v, 10)).filter((n) => Number.isInteger(n));
    const includeCoachItems = c.req.query("includeCoachItems")?.toLowerCase() !== "false";
    const int = (name) => {
      const raw = c.req.query(name);
      if (raw === void 0) return void 0;
      const n = Number.parseInt(raw, 10);
      return Number.isInteger(n) ? n : void 0;
    };
    return c.json(
      await searchCustomAvatarItems(c.env.DB, {
        searchQuery: c.req.query("searchQuery"),
        outfitTypes,
        includeCoachItems,
        minPrice: int("minPrice"),
        maxPrice: int("maxPrice"),
        skip: int("skip"),
        take: int("take")
      })
    );
  }
).get(
  "/api/customAvatarItems/v1/hot",
  describeRoute({
    tags: ["Avatar"],
    summary: "Trending custom avatar items",
    description: "The \u201Chot\u201D feed: the published items (`Accessibility` 0 is unpublished and is left out), newest first, up to 50. No purchase or wear counts are recorded, so there is no trend to rank by and recency stands in for one.",
    responses: { 200: json(CustomAvatarItemList, "The items, newest first") }
  }),
  async (c) => c.json(await listHotCustomAvatarItems(c.env.DB))
).post(
  "/api/customAvatarItems/v1/bulk",
  describeRoute({
    tags: ["Avatar"],
    summary: "Custom avatar items in bulk",
    description: "Resolves a batch of custom-avatar-item ids to their items: the posted `customAvatarItemIds` filtered against the `custom_avatar_item` table, returned as a BARE ARRAY of the ones that matched, in the order they were asked for. Not the `{ Results, TotalResults }` page the sibling custom-item reads serve \u2014 the reference keeps its catalog in that shape but answers this route with the filtered array alone.\n\nA miss is not an error: unknown ids are simply absent from the response, and the client reads the items it got back rather than the ids it asked for. Unpublished items (`Accessibility` 0) miss for everyone but their creator, the same rule the feeds and the creator shelf apply.\n\nIds ride as repeated `customAvatarItemIds` form fields; a comma-separated value and the same spelling on the query string are both accepted, since the client\u2019s exact encoding here has not been pinned down.\n\nA batch of more than 100 ids answers an EMPTY array without reading the table: the client has been seen posting more than a screen could draw, and a miss is already not an error here.",
    security: AUTHED,
    requestBody: form(BulkCustomAvatarItemsRequest, "The custom-avatar-item ids to resolve"),
    responses: {
      200: json(CustomAvatarItemList, "The items that matched, in request order"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const ids = await bulkCustomAvatarItemIds(c);
    if (ids.length > BULK_CUSTOM_AVATAR_ITEM_CAP) return c.json([]);
    const items = await getCustomAvatarItems(c.env.DB, ids);
    return c.json(
      items.filter((item) => item.Accessibility !== 0 || item.CreatorAccountId === id)
    );
  }
).get(
  "/api/customAvatarItems/v2/fromCreator/:accountId{[0-9]+}",
  describeRoute({
    tags: ["Avatar"],
    summary: "A creator\u2019s custom avatar items",
    description: "The items an account has authored, newest first, in the same page shape as the `econ` worker\u2019s `customAvatarItems/v1/owned`. Published items only \u2014 unless the bearer token is the creator\u2019s, in which case their unpublished (`Accessibility` 0) items are included too. Paging is not applied (the client sends none), so `TotalResults` is the length of `Results`.",
    security: OPTIONAL_AUTHED,
    parameters: [idParam("accountId", "Creator account id")],
    responses: { 200: json(CustomAvatarItemsPage, "The creator\u2019s items") }
  }),
  async (c) => {
    const accountId = Number.parseInt(c.req.param("accountId"), 10);
    const viewer = await authedId(c);
    return c.json(await listCustomAvatarItemsByCreator(c.env.DB, accountId, viewer === accountId));
  }
).post(
  "/api/customAvatarItems/GetCustomAvatarItemCurrentSavesForLegacyAvatarItems",
  describeRoute({
    tags: ["Avatar"],
    summary: "Custom-item saves for legacy avatar items",
    description: "Given a set of legacy avatar items, the custom-item saves that replace them, keyed by the legacy item\u2019s `AvatarItemDesc`. Nothing stores custom items yet, so the map is always empty \u2014 which the client reads as \u201Crender the legacy items as-is\u201D. The request body is ignored.\n\nThe value shape is the official one, recorded here for documentation; we never emit one until custom items are stored.",
    responses: { 200: json(LegacyAvatarItemSaves, "An empty map") }
  }),
  (c) => c.json({ customAvatarItemSavesByAvatarItemDesc: {} })
).get(
  "/outfits/me",
  describeRoute({
    tags: ["Avatar", "2025"],
    summary: "The caller\u2019s outfit",
    description: "The newer outfit read, on a bare un-prefixed path. Served from slot 0 of the shared `outfit` table \u2014 the newer client treats slot 0 as the outfit currently worn \u2014 and handed back exactly as it was saved, since the payload\u2019s heavy fields are the client\u2019s own JSON-in-a-string documents.\n\nA player who has never saved gets the brand-new-account envelope, which is a different, flatter shape than a stored outfit: the four empty-string fields `FaceFeatures`, `HairColor`, `OutfitSelections` and `SkinColor`, and nothing else.",
    security: AUTHED,
    responses: {
      200: json(OutfitsMeResponse, "The stored outfit, or the empty envelope"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const outfit = await getOutfit(c.env.DB, id, CURRENT_OUTFIT_SLOT);
    if (outfit !== null) return c.json(outfit);
    return c.json({
      FaceFeatures: "",
      HairColor: "",
      OutfitSelections: "",
      SkinColor: ""
    });
  }
).put(
  "/outfits/me",
  describeRoute({
    tags: ["Avatar", "2025"],
    summary: "Save the caller\u2019s outfit",
    description: "Saves into the shared `outfit` table, in the slot the body names \u2014 slot 0 being the outfit worn, which is what the GET reads. Re-saving a slot overwrites it.\n\nThe payload is stored verbatim: its heavy fields (`SelectionsV2`, `FaceFeatures`, `CustomizationSettings`) are whole JSON documents encoded as strings by the client\u2019s own serializer, so nothing here parses or re-encodes them.\n\nThe response is the base envelope with no `Value` key \u2014 three keys, and the outfit is not echoed back. The mixed casing (`Success`/`Error` but `error_id`) is the reference\u2019s, not a typo.",
    security: AUTHED,
    requestBody: jsonBody(OutfitsMeRequest, "The outfit to save"),
    responses: {
      200: json(OutfitSaveResponse, "Saved \u2014 `{ Success: true, Error: null, error_id: null }`"),
      400: json(ErrorResponse, "Unparseable body"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json({ error: "Invalid request body" }, 400);
    const outfit = {
      ...body,
      Slot: typeof body.Slot === "number" ? body.Slot : CURRENT_OUTFIT_SLOT
    };
    await setOutfit(c.env.DB, id, outfit);
    return c.json({ Success: true, Error: null, error_id: null });
  }
).post(
  "/outfits/bulk",
  describeRoute({
    tags: ["Avatar"],
    summary: "Several players\u2019 outfits",
    description: "The worn outfit (slot 0) of each account in `AccountIds`, keyed by account id \u2014 the call the client makes to dress a room full of players in one request.\n\nA MAP rather than a list: the client looks each player up by id. The key is the id as a string, and the value is the same stored outfit `GET /outfits/me` serves, handed back exactly as it was saved. An account with nothing saved in slot 0 is ABSENT from the map rather than carrying a null \u2014 a map says \u201Cno outfit\u201D by not having the key, and inventing one for a player who has never saved would dress them in something they never chose.\n\nRepeated ids collapse, and at most 99 distinct accounts may be named \u2014 one query, one round trip, and a room holds nothing like that many players. A longer list is a 400 rather than a partial answer, which would read as \u201Cthose players have no outfit\u201D. `UnityAssetTarget` / `UnityAssetVersion` name a baked-asset build and are accepted and ignored: nothing here bakes assets.",
    security: AUTHED,
    requestBody: jsonBody(OutfitsBulkRequest, "The accounts whose outfits are wanted"),
    responses: {
      200: json(OutfitsBulkResponse, "The outfits that exist, keyed by account id"),
      400: json(ErrorResponse, "Unparseable body, or more than 99 accounts"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json({ error: "Invalid request body" }, 400);
    const accountIds = Array.isArray(body.AccountIds) ? body.AccountIds.filter((v) => Number.isInteger(v)) : [];
    if (new Set(accountIds).size > MAX_BULK_OUTFIT_ACCOUNTS) {
      return c.json({ error: `At most ${MAX_BULK_OUTFIT_ACCOUNTS} accounts per request` }, 400);
    }
    const outfits = await getOutfitsByAccounts(c.env.DB, accountIds, CURRENT_OUTFIT_SLOT);
    const OutfitsByAccountId = {};
    for (const [accountId, outfit] of outfits) OutfitsByAccountId[String(accountId)] = outfit;
    return c.json({ OutfitsByAccountId });
  }
).get(
  "/outfits/me/saved",
  describeRoute({
    tags: ["Avatar", "2025"],
    summary: "The caller\u2019s saved outfits",
    description: "The wardrobe behind the newer outfit screen: every slot the caller has saved, ordered by slot, and `[]` when they have saved none. The same rows `econ`\u2019s `GET /api/avatar/v3/saved` serves \u2014 both write paths land in the shared `outfit` table.\n\nSlot 0 is included. It is the outfit being worn (what `GET /outfits/me` reads) but it is a saved slot too, and the client chooses the slot it saves into, so omitting it would hide a real outfit whenever a wardrobe entry lands there.\n\nEach outfit is served exactly as it was stored, unprojected: slots written through `PUT /outfits/me` hold the newer envelope while `econ`\u2019s saved-set slots hold the old flat shape, and neither is converted into the other.",
    security: AUTHED,
    responses: {
      200: json(JsonArray, "The saved outfits, ordered by slot (empty when none)"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getOutfits(c.env.DB, id));
  }
).get(
  "/api/inventions/v1",
  describeRoute({
    tags: ["Inventions"],
    summary: "One invention by id",
    description: "The stored `RRInvention`. Public \u2014 an unpublished invention is served too.",
    parameters: [intQuery("inventionId", "Invention id; required")],
    responses: {
      200: json(InventionDto, "The invention"),
      400: json(ErrorResponse, "Missing or non-numeric inventionId"),
      404: { description: "No such invention" }
    }
  }),
  async (c) => {
    const inventionId = Number.parseInt(c.req.query("inventionId") ?? "", 10);
    if (Number.isNaN(inventionId)) return c.json({ error: "inventionId is required" }, 400);
    const invention = await getInventionById(c.env.DB, inventionId);
    return invention ? c.json(invention) : c.notFound();
  }
).get(
  "/api/inventions/v1/tagfilters",
  describeRoute({
    tags: ["Inventions"],
    summary: "Invention browse filter chips",
    description: "The filter chips on the invention browse screen, derived from the tags actually in use on published inventions \u2014 most popular first, the top few pinned. `TrendingFilters` is null: that needs recent-activity data we do not keep, and the client treats null as absent.",
    responses: { 200: json(TagFilters, "The chips in use") }
  }),
  async (c) => c.json(await getInventionTagFilters(c.env.DB))
).get(
  "/api/inventions/v2/batch",
  describeRoute({
    tags: ["Inventions"],
    summary: "Inventions by id, in bulk",
    description: "Look up several inventions at once. Unknown ids are dropped rather than 404ing, and an empty request is an empty list. Auth is optional and only widens what you see: an unpublished invention comes back only to its creator.",
    parameters: [intQuery("id", "Repeatable; each value may be a comma-separated list of ids")],
    responses: { 200: json(InventionDto.array(), "The inventions the caller may see") }
  }),
  async (c) => {
    const ids = inventionIdQuery(c);
    if (ids.length === 0) return c.json([]);
    const playerId = await authedId(c);
    const inventions = await getInventionsByIds(c.env.DB, ids);
    return c.json(
      inventions.filter(
        (i) => i.IsPublished || playerId !== null && i.CreatorPlayerId === playerId
      )
    );
  }
).get(
  "/api/inventions/v1/fulllineageowner",
  describeRoute({
    tags: ["Inventions"],
    summary: "Does the caller own this whole lineage?",
    description: "Asked when saving an invention built out of other inventions: may this player use every piece? The client sends the whole lineage as repeated `id`s, and this answers a single bare `true`/`false` for the set \u2014 false as soon as one is not the caller\u2019s. An invention is theirs if they created it or acquired it; an id with no invention behind it is not owned. Price and permission don\u2019t enter into it \u2014 a free invention still has to be picked up, and that writes the same inventory row a paid one does.\n\nOnly the ids asked about are checked \u2014 this does not walk `ReferencedInventions` to widen the lineage, since the client knows what the thing it is holding is actually made of. No ids at all is `true`: nothing in an empty lineage is unowned.",
    security: AUTHED,
    parameters: [intQuery("id", "Repeatable; each value may be a comma-separated list of ids")],
    responses: {
      200: json(BareBoolean, "Whether the caller owns every invention asked about"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const playerId = await authedId(c);
    if (playerId === null) return unauthorized(c);
    return c.json(await ownsAllInventions(c.env.DB, playerId, inventionIdQuery(c)));
  }
).get(
  "/api/inventions/v1/room",
  describeRoute({
    tags: ["Inventions"],
    summary: "A room\u2019s inventions",
    description: "Published inventions created in that room, newest first.",
    parameters: [intQuery("id", "Room id; required"), ...pageParams(100)],
    responses: {
      200: json(InventionDto.array(), "The room\u2019s inventions"),
      400: json(ErrorResponse, "Missing or non-numeric id")
    }
  }),
  async (c) => {
    const roomId = Number.parseInt(c.req.query("id") ?? "", 10);
    if (Number.isNaN(roomId)) return c.json({ error: "id is required" }, 400);
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getInventionsByRoom(c.env.DB, roomId, skip, take));
  }
).get(
  "/api/inventions/v1/personaldetails/:inventionId{[0-9]+}",
  describeRoute({
    tags: ["Inventions"],
    summary: "The caller\u2019s own relation to an invention",
    description: "Whether the caller is cheering this invention. Signed-out callers receive false, since there is no player interaction to look up.",
    parameters: [idParam("inventionId", "Invention id")],
    responses: { 200: json(InventionPersonalDetails, "The caller\u2019s cheer state") }
  }),
  async (c) => {
    const playerId = await authedId(c);
    if (playerId === null) return c.json({ IsCheering: false });
    const inventionId = Number.parseInt(c.req.param("inventionId"), 10);
    return c.json({ IsCheering: await isInventionCheered(c.env.DB, playerId, inventionId) });
  }
).get(
  "/api/inventions/v1/version",
  describeRoute({
    tags: ["Inventions"],
    summary: "One version of an invention",
    description: "The bare `RRInventionVersion`, which carries the blob name the client downloads and `BlobHash`, the base64 SHA-256 of that blob (null when the named blob was never uploaded). Only the current version exists \u2014 nothing writes version history yet \u2014 so any other version number 404s rather than naming a blob that is not there.\n\n`version=0` is the exception: it means \u201Cwhichever is current\u201D rather than a number to match, and gets the current version. No invention has a version 0 \u2014 a fresh save is version 1 \u2014 so a caller sending it does not know which version it wants, and matching it literally 404s an invention that exists.",
    parameters: [
      intQuery("inventionId", "Invention id; required"),
      intQuery("version", "Version number; required. `0` means the current version")
    ],
    responses: {
      200: json(InventionVersionDto, "The version"),
      400: json(ErrorResponse, "Missing inventionId or version"),
      404: { description: "No such invention, or a version number that is not the current one" }
    }
  }),
  async (c) => {
    const inventionId = Number.parseInt(c.req.query("inventionId") ?? "", 10);
    if (Number.isNaN(inventionId)) return c.json({ error: "inventionId is required" }, 400);
    const versionNumber = Number.parseInt(c.req.query("version") ?? "", 10);
    if (Number.isNaN(versionNumber)) return c.json({ error: "version is required" }, 400);
    const version = await getInventionVersion(
      c.env.DB,
      c.env.CDN_ASSETS,
      inventionId,
      versionNumber
    );
    return version === null ? c.notFound() : c.json(version);
  }
).on(
  ["GET", "POST"],
  "/api/inventions/v1/update",
  describeRoute({
    tags: ["Inventions"],
    summary: "Edit an invention\u2019s metadata",
    description: "GET or POST \u2014 the client sends both, and the fields to change ride as query params either way; no body is read. Absent params keep their stored value. An empty `description` clears it, but an empty `name`/`imageName` is ignored rather than blanking the invention. A supplied name/description must satisfy the same rules `v6/save` enforces. Publishing and pricing are separate endpoints.",
    security: AUTHED,
    parameters: [
      intQuery("inventionId", "Invention id; required"),
      stringQuery("name", "3\u201324 chars, letters/digits/spaces/dashes/colons; empty is ignored"),
      stringQuery("description", "Max 512 chars; present-but-empty clears it"),
      stringQuery("imageName", "New thumbnail; empty is ignored"),
      stringQuery("allowTrial", "`true`/`1` to allow trials"),
      stringQuery(
        "permission",
        "What other players get (`GeneralPermission`). The picker sends `UseOnly`, `EditAndSave` or `Publish`; any ladder name (case- and underscore-insensitive) or the raw number is accepted"
      )
    ],
    responses: {
      200: json(InventionSaveResult, "The updated invention, in the save envelope"),
      400: json(ErrorResponse, "A supplied name or description breaks its rule"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "Not the caller\u2019s invention"),
      404: { description: "No such invention" }
    }
  }),
  async (c) => {
    const gate = await creatorsInvention(c, Number.parseInt(c.req.query("inventionId") ?? "", 10));
    if ("response" in gate) return gate.response;
    const nonEmpty = (name2) => {
      const v = c.req.query(name2)?.trim();
      return v === void 0 || v === "" ? void 0 : v;
    };
    const allowTrial = c.req.query("allowTrial");
    const permission = c.req.query("permission");
    const name = nonEmpty("name");
    const nameRejection = name === void 0 ? null : inventionNameRejection(name);
    if (nameRejection !== null) return c.json({ error: nameRejection }, 400);
    const description = c.req.query("description");
    const descriptionRejection = description === void 0 ? null : inventionDescriptionRejection(description);
    if (descriptionRejection !== null) return c.json({ error: descriptionRejection }, 400);
    const updated = await updateInvention(c.env.DB, gate.invention.InventionId, {
      name,
      // Present-but-empty clears the description, so this checks presence.
      description,
      imageName: nonEmpty("imageName"),
      allowTrial: allowTrial === void 0 ? void 0 : allowTrial.toLowerCase() === "true" || allowTrial === "1",
      generalPermission: permission === void 0 ? void 0 : parsePermissionLevel(permission)
    });
    return updated === null ? c.notFound() : c.json(toSaveResult(updated));
  }
).get(
  "/api/inventions/v3/publish",
  describeRoute({
    tags: ["Inventions"],
    summary: "Publish an invention",
    description: "What puts an invention into search and the feeds. Sets the permission other players get (defaulting to UseOnly) and its price. Another GET that writes.",
    security: AUTHED,
    parameters: [
      intQuery("inventionId", "Invention id; required"),
      stringQuery("permissionLevel", "A name like `useonly`, or the raw number"),
      intQuery("price", "Price in tokens; negative is ignored")
    ],
    responses: {
      200: json(InventionSaveResult, "The published invention, in the save envelope"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "Not the caller\u2019s invention"),
      404: { description: "No such invention" }
    }
  }),
  async (c) => {
    const gate = await creatorsInvention(c, Number.parseInt(c.req.query("inventionId") ?? "", 10));
    if ("response" in gate) return gate.response;
    const permissionLevel = c.req.query("permissionLevel");
    const price = Number.parseInt(c.req.query("price") ?? "", 10);
    const published = await publishInvention(c.env.DB, gate.invention.InventionId, {
      permissionLevel: permissionLevel === void 0 ? void 0 : parsePermissionLevel(permissionLevel),
      price: Number.isNaN(price) || price < 0 ? void 0 : price
    });
    return published === null ? c.notFound() : c.json(toSaveResult(published));
  }
).post(
  "/api/inventions/v1/updateprice",
  describeRoute({
    tags: ["Inventions"],
    summary: "Set an invention\u2019s price",
    description: "Unlike update/publish, this one POSTs a JSON body. Creator only; a negative price is rejected.",
    security: AUTHED,
    requestBody: jsonBody(UpdatePriceRequest, "The invention and its new price"),
    responses: {
      200: json(InventionSaveResult, "The repriced invention, in the save envelope"),
      400: json(ErrorResponse, "Unparseable body, or a price below 0"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "Not the caller\u2019s invention"),
      404: { description: "No such invention" }
    }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json({ error: "Invalid request body" }, 400);
    const inventionId = typeof body.InventionId === "number" ? body.InventionId : Number.NaN;
    const gate = await creatorsInvention(c, inventionId);
    if ("response" in gate) return gate.response;
    const price = typeof body.Price === "number" ? body.Price : Number.NaN;
    if (Number.isNaN(price) || price < 0) return c.json({ error: "Price must be >= 0" }, 400);
    const updated = await setInventionPrice(c.env.DB, gate.invention.InventionId, price);
    return updated === null ? c.notFound() : c.json(toSaveResult(updated));
  }
).post(
  "/api/inventions/v1/settags",
  describeRoute({
    tags: ["Inventions"],
    summary: "Replace an invention\u2019s tags",
    description: "`CustomTags` are the creator\u2019s own (Type 0), `AutoTags` the ones the client derives from the invention (Type 2); both lists are replaced wholesale. Creator only.\n\nEvery tag in either list must be at most 15 letters (a\u2013z once lowercased); one that isn\u2019t fails the whole call, so no tag is ever silently dropped.\n\nNote the asymmetry: this answers the flat list of tag *names* (auto first, then custom), while `v1/details` serves the typed `{ Tag, Type }` objects.",
    security: AUTHED,
    requestBody: jsonBody(SetTagsRequest, "The replacement tag lists"),
    responses: {
      200: json(SetTagsResponse, "The resulting tag names"),
      400: json(ErrorResponse, "Unparseable body, or a tag that breaks the rule"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "Not the caller\u2019s invention"),
      404: { description: "No such invention" }
    }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json({ error: "Invalid request body" }, 400);
    const inventionId = typeof body.InventionId === "number" ? body.InventionId : Number.NaN;
    const gate = await creatorsInvention(c, inventionId);
    if ("response" in gate) return gate.response;
    const strings = (v) => Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
    const autoTags = strings(body.AutoTags);
    const customTags = strings(body.CustomTags);
    for (const raw of [...autoTags, ...customTags]) {
      const tag = raw.trim().toLowerCase();
      if (tag === "") continue;
      const rejection = inventionTagRejection(tag);
      if (rejection !== null) {
        return c.json({ error: `${rejection} (\u201C${tag}\u201D)` }, 400);
      }
    }
    const tags = await setInventionTags(
      c.env.DB,
      gate.invention.InventionId,
      autoTags,
      customTags
    );
    return c.json({ Result: 0, Tags: (tags ?? []).map((t) => t.Tag) });
  }
).get(
  "/api/inventions/v1/details",
  describeRoute({
    tags: ["Inventions"],
    summary: "An invention\u2019s detail card",
    description: "Which in practice is just its tags, as typed `{ Tag, Type }` objects. An untagged invention reports an empty list.",
    parameters: [intQuery("inventionId", "Invention id; required")],
    responses: {
      200: json(InventionDetails, "The invention\u2019s tags"),
      400: json(ErrorResponse, "Missing or non-numeric inventionId"),
      404: { description: "No such invention" }
    }
  }),
  async (c) => {
    const inventionId = Number.parseInt(c.req.query("inventionId") ?? "", 10);
    if (Number.isNaN(inventionId)) return c.json({ error: "inventionId is required" }, 400);
    const tags = await getInventionTags(c.env.DB, inventionId);
    return tags === null ? c.notFound() : c.json({ Tags: tags });
  }
).get(
  "/api/inventions/v1/toptoday",
  describeRoute({
    tags: ["Inventions"],
    summary: "The \u201Ctop today\u201D feed",
    description: "Published inventions ranked by how many players acquired them in the last 24 hours, counted from the purchase records \u2014 free grants included, one per player per invention. Genuinely a window: an invention nobody has picked up since yesterday falls off, and a day with no acquisitions at all serves an empty list. It trails the clock rather than resetting at midnight.",
    parameters: pageParams(50),
    responses: { 200: json(InventionDto.array(), "The top inventions") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "50", 10) || 50;
    return c.json(await getTopInventions(c.env.DB, skip, take));
  }
).get(
  "/api/inventions/v1/featured",
  describeRoute({
    tags: ["Inventions"],
    summary: "The featured feed",
    description: "Curated (`IsFeatured`) inventions, newest first \u2014 published and non-hidden only. Serves an empty list while nothing is flagged rather than standing in the top feed: the client presents these as hand-picked, so a fallback would be a lie.",
    parameters: pageParams(50),
    responses: { 200: json(InventionDto.array(), "The featured inventions") }
  }),
  async (c) => {
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "50", 10) || 50;
    return c.json(await getFeaturedInventions(c.env.DB, skip, take));
  }
).get(
  "/api/inventions/v1/featureddormskins",
  describeRoute({
    tags: ["Inventions"],
    summary: "The featured dorm-skin feed",
    description: "Curated dorm-skin inventions. Nothing is curated yet, so it is empty.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).get(
  "/api/inventions/v1/fromcreators",
  describeRoute({
    tags: ["Inventions"],
    summary: "Inventions by particular creators (stub)",
    description: 'The published inventions of the accounts named by `id` (repeatable), newest first \u2014 a creator\u2019s shelf, and the "from creators you follow" row. STUB: always an empty array for now, which the client renders as "nothing published" rather than as a failed load. `id`, `skip` and `take` are accepted and, for the moment, ignored.',
    parameters: [
      intQuery("id", "Creator account id; repeatable. Accepted and ignored by the stub"),
      ...pageParams(100)
    ],
    responses: { 200: json(InventionDto.array(), "Empty \u2014 nothing is served here yet") }
  }),
  (c) => c.json([])
).get(
  "/api/inventions/v2/search",
  describeRoute({
    tags: ["Inventions"],
    summary: "Search / browse inventions",
    description: "Published inventions matching `value`, newest first. `value` is split into terms and every term must match, each against the name and the description. An absent `value` browses everything published \u2014 that is the browse screen\u2019s initial request. Tags are NOT searched: a `#tag` term from the browse screen\u2019s filter chips is treated as text and matches nothing.",
    parameters: [
      stringQuery("value", "Search text; absent browses everything"),
      ...pageParams(100)
    ],
    responses: { 200: json(InventionDto.array(), "The matching inventions") }
  }),
  async (c) => {
    const value = c.req.query("value") ?? "";
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await searchInventions(c.env.DB, value, skip, take));
  }
).get(
  "/api/inventions/v2/mine",
  describeRoute({
    tags: ["Inventions"],
    summary: "The caller\u2019s own inventions",
    description: "\u201CMy inventions\u201D, newest first \u2014 the ones the caller created plus the ones they bought. Includes unpublished ones, which nobody else can see, and keeps a bought invention listed even if it has since been unpublished or hidden. Not paginated.",
    security: AUTHED,
    responses: {
      200: json(InventionDto.array(), "The caller\u2019s inventions"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await getMyInventions(c.env.DB, id));
  }
).post(
  "/api/customAvatarItems/v1/:id{[0-9a-fA-F-]{36}}/report",
  describeRoute({
    tags: ["Avatar", "Moderation"],
    summary: "Report a custom avatar item",
    description: "Files a report against a custom avatar item, named by the PATH. Stored as a row in the same `report` table a player report goes to (`POST /api/PlayerReporting/v3/create`), an event report and an invention report \u2014 the same submission with the same moderation life, which a moderator converts into a ban the same way. What marks it as an item report is `custom_avatar_item_id`; the row\u2019s `reported_player_id` is the item\u2019s CREATOR, read from the item. The body\u2019s `ReportedPlayerId` is sent as null and IGNORED even when set \u2014 the client does not know who made the item, and letting a client name who a report is against would let it point one at anybody. Nothing fills `room_id`: an item isn\u2019t tied to one room the way an event is.\n\nThe reporter is the caller (from the bearer token), never a body field. `ReportCategory` is stored verbatim \u2014 the enum is not mapped here. Nothing dedupes the rows: reporting the same item twice files two reports, and reporting your own is allowed rather than being a special case.\n\nAnswers the `{ success, error }` envelope the event and invention reports use, `error` being an empty string rather than null, on the rejected branches too so there is only one shape to parse.",
    security: AUTHED,
    parameters: [idParam("id", "The custom avatar item\u2019s guid")],
    requestBody: jsonBody(CustomAvatarItemReportRequest, "The report"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      401: UNAUTHORIZED_RESPONSE,
      404: json(SuccessErrorEnvelope, "No such custom avatar item")
    }
  }),
  async (c) => {
    const reporterId = await authedId(c);
    if (reporterId === null) return unauthorized(c);
    const customAvatarItemId = c.req.param("id");
    const item = await getCustomAvatarItem(c.env.DB, customAvatarItemId);
    if (item === null) return c.json({ success: false, error: "No such item" }, 404);
    const body = await c.req.json().catch(() => ({}));
    const category = Number(body.ReportCategory);
    await createReport(c.env.DB, {
      reporterPlayerId: reporterId,
      reportedPlayerId: item.CreatorAccountId,
      reportCategory: Number.isInteger(category) ? category : 0,
      details: typeof body.Details === "string" ? body.Details : null,
      customAvatarItemId
    });
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/inventions/v1/cheer",
  describeRoute({
    tags: ["Inventions"],
    summary: "Cheer or un-cheer an invention",
    description: "Persists the caller\u2019s cheer state and resyncs the invention\u2019s `CheerCount`. Repeating the same state is idempotent.",
    security: AUTHED,
    requestBody: jsonBody(InventionCheerRequest, "The invention and new cheer state"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "Invalid body"),
      401: UNAUTHORIZED_RESPONSE,
      404: json(SuccessErrorEnvelope, "No such invention")
    }
  }),
  async (c) => {
    const playerId = await authedId(c);
    if (playerId === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const inventionId = Number(body.InventionId);
    if (!Number.isInteger(inventionId) || typeof body.Cheer !== "boolean") {
      return c.json({ success: false, error: "InventionId and Cheer are required" }, 400);
    }
    if (await getInventionById(c.env.DB, inventionId) === null) {
      return c.json({ success: false, error: "No such invention" }, 404);
    }
    await setInventionCheer(c.env.DB, playerId, inventionId, body.Cheer);
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/inventions/v1/report",
  describeRoute({
    tags: ["Inventions", "Moderation"],
    summary: "Report an invention",
    description: "Files a report against an invention. Stored as a row in the same `report` table a player report goes to (`POST /api/PlayerReporting/v3/create`) and an event report (`POST /api/playerevents/v1/report`) \u2014 it is the same submission with the same moderation life, and a moderator converts any of them into a ban the same way. What marks it as an invention report is `invention_id`; the row\u2019s `reported_player_id` is the invention\u2019s CREATOR \u2014 who a moderator would act against \u2014 read from the invention rather than sent by the client. Nothing fills `room_id`: an invention isn\u2019t tied to one room the way an event is.\n\nThe reporter is the caller (from the bearer token), never a body field. `ReportCategory` is stored verbatim \u2014 the enum is not mapped here. Nothing dedupes the rows: reporting the same invention twice files two reports, and reporting your own is allowed rather than being a special case.\n\nAnswers the same `{ success, error }` envelope as the event report, `error` being an empty string rather than null, on the rejected branches too so there is only one shape to parse.",
    security: AUTHED,
    requestBody: jsonBody(InventionReportRequest, "The report"),
    responses: {
      200: json(SuccessErrorEnvelope, '`{ success: true, error: "" }`'),
      400: json(SuccessErrorEnvelope, "No usable `InventionId` in the body"),
      401: UNAUTHORIZED_RESPONSE,
      404: json(SuccessErrorEnvelope, "No such invention")
    }
  }),
  async (c) => {
    const reporterId = await authedId(c);
    if (reporterId === null) return unauthorized(c);
    const body = await c.req.json().catch(() => ({}));
    const inventionId = Number(body.InventionId);
    if (!Number.isInteger(inventionId)) {
      return c.json({ success: false, error: "InventionId is required" }, 400);
    }
    const invention = await getInventionById(c.env.DB, inventionId);
    if (invention === null) return c.json({ success: false, error: "No such invention" }, 404);
    const category = Number(body.ReportCategory);
    await createReport(c.env.DB, {
      reporterPlayerId: reporterId,
      reportedPlayerId: invention.CreatorPlayerId,
      reportCategory: Number.isInteger(category) ? category : 0,
      details: typeof body.Details === "string" ? body.Details : null,
      inventionId
    });
    return c.json({ success: true, error: "" });
  }
).post(
  "/api/inventions/v6/save",
  describeRoute({
    tags: ["Inventions"],
    summary: "Save a new invention",
    description: "Records an invention\u2019s metadata. The data file itself is uploaded separately through the `storage` worker and referenced here by `inventionDataFilename` \u2014 the one required field, since an invention with no data blob is unusable. An omitted name/description is defaulted rather than rejected; a supplied one must be 3\u201324 characters of letters, digits, spaces, dashes and colons (name) or at most 512 characters (description).\n\nA freshly saved invention is private: it shows up only in the creator\u2019s own list until they call `v3/publish`.",
    security: AUTHED,
    requestBody: jsonBody(SaveInventionRequest, "The invention metadata (camelCase)"),
    responses: {
      200: json(InventionSaveResult, "The stored invention, carrying its assigned id"),
      400: json(
        ErrorResponse,
        "Unparseable body, no inventionDataFilename, or an invalid name/description"
      ),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json({ error: "Invalid request body" }, 400);
    const outcome = await createInventionFromBody(c, id, body);
    if ("rejection" in outcome) return c.json({ error: outcome.rejection }, 400);
    return c.json(toSaveResult(outcome.invention));
  }
).post(
  "/api/inventions/v9/save",
  describeRoute({
    tags: ["Inventions"],
    summary: "Save a new invention (v9)",
    description: "`v6/save` plus the fields the newer client sends: `referencedUnityAssetIds`, `longDescription`, `displayMetadataJson`, `convertedFromInventionId`, `ugcVersion`, `hasBetaContent`, and a `tagsRequest` carrying the same `AutoTags`/`CustomTags` lists `v1/settags` takes. Every one is optional and is stored only when sent, so a body v6 would accept produces the same record here.\n\nThe reply is where the two versions part: v9 is ENVELOPED as `{ Value, Success, Error, error_id }`, with v6\u2019s `{ Status, Invention, InventionVersion }` inside `Value` alongside a `TagsResponse`. The client reads `Success` and then `Value.Invention.InventionId`; `Error` is the only text it ever shows a human.\n\nSo a refusal is *also* a 200 carrying `{ Success: false, Error, Value: null }` \u2014 the client dereferences `Value` unguarded when `Success` is true, and treats anything that isn\u2019t this envelope as a null one. Tags are held to the `v1/settags` rule (at most 15 letters each), but one that breaks it costs the tags and not the save: `TagsResponse.Result` comes back non-zero and the creator re-submits them through `v1/settags`.\n\nA freshly saved invention is private: it shows up only in the creator\u2019s own list until they call `v3/publish`.",
    security: AUTHED,
    requestBody: jsonBody(SaveInventionV9Request, "The invention metadata (camelCase)"),
    responses: {
      200: json(
        InventionSaveV9Result,
        "The envelope \u2014 the stored invention under `Value`, or `Success: false` with `Error` when the save was refused"
      ),
      401: json(InventionSaveV9Result, "The same envelope, refused \u2014 not an empty body")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return c.json(inventionSaveV9Failure("Unauthorized"), 401);
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json(inventionSaveV9Failure("Invalid request body"));
    const outcome = await createInventionFromBody(c, id, body);
    return c.json(
      "rejection" in outcome ? inventionSaveV9Failure(outcome.rejection) : toSaveResultV9(outcome.invention, outcome.tags, outcome.tagResult)
    );
  }
).put(
  "/api/inventions/v2/metadata",
  describeRoute({
    tags: ["Inventions"],
    summary: "Edit an invention\u2019s metadata (v2)",
    description: "Creator only. Every field but `InventionId` is nullable and a null one is left as it is \u2014 the client sends the whole shape on every edit \u2014 so this is a patch, not a replace. An empty string is not a null: it is how a creator CLEARS a description, long description or image. `Name` is the exception, since a nameless invention isn\u2019t a thing the client can draw: it is held to the same 3\u201324 character rule `v6/save` enforces, which an empty name fails.\n\n`TagsRequest` replaces both tag lists wholesale, exactly as `v1/settags` does; a null one leaves the stored tags alone. A tag that breaks the tag rule costs the tags and not the edit \u2014 `TagsResponse.Result` comes back non-zero.\n\nAnswers the enveloped result `v9/save` answers, carrying the UPDATED invention: the client re-renders the detail page from `Value.Invention`. Refusals \u2014 an unknown invention and someone else\u2019s alike \u2014 are `Success: false` with a null `Value` rather than a bare error body, which that client cannot parse.",
    security: AUTHED,
    requestBody: jsonBody(UpdateInventionMetadataRequest, "The fields to change"),
    responses: {
      200: json(
        InventionSaveV9Result,
        "The envelope \u2014 the updated invention under `Value`, or `Success: false` with `Error` when the edit was refused"
      ),
      401: json(InventionSaveV9Result, "The same envelope, refused \u2014 not an empty body")
    }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json(inventionSaveV9Failure("Invalid request body"));
    const gate = await creatorsInventionResult(
      c,
      typeof body.InventionId === "number" ? body.InventionId : Number.NaN
    );
    if ("rejection" in gate) {
      return gate.status === 401 ? c.json(inventionSaveV9Failure(gate.rejection), 401) : c.json(inventionSaveV9Failure(gate.rejection));
    }
    const edited = (key) => typeof body[key] === "string" ? body[key] : void 0;
    const name = edited("Name")?.trim();
    const description = edited("Description");
    const longDescription = edited("LongDescription");
    for (const rejection of [
      name === void 0 ? null : inventionNameRejection(name),
      description === void 0 ? null : inventionDescriptionRejection(description),
      longDescription === void 0 ? null : inventionLongDescriptionRejection(longDescription)
    ]) {
      if (rejection !== null) return c.json(inventionSaveV9Failure(rejection));
    }
    const requested = requestedTags(body.TagsRequest);
    const updated = await updateInvention(c.env.DB, gate.invention.InventionId, {
      name,
      description,
      longDescription,
      imageName: edited("ImageName"),
      tags: requested?.tags
    });
    if (updated === null) return c.json(inventionSaveV9Failure("No such invention"));
    return c.json(
      toSaveResultV9(
        updated,
        updated.Tags ?? [],
        requested?.tagResult ?? INVENTION_TAG_RESULT.success
      )
    );
  }
).post(
  "/api/inventions/v4/publish",
  describeRoute({
    tags: ["Inventions"],
    summary: "Publish an invention (v4)",
    description: "What puts an invention into search and the feeds. Creator only.\n\n`Permission` is the `GeneralPermission` other players get, as a raw ladder number (the publish sheet sends 20, UseOnly). `Accessibility` says where it can be found \u2014 1 (Public) lists it, 2 (Unlisted) publishes it reachable by id but keeps it out of browse and search. A null `Price` leaves the price alone rather than zeroing it, so re-publishing something that was for sale doesn\u2019t give it away; every field but `InventionId` is nullable and an omitted one keeps what the invention has.\n\nPublishing is not undone here, and re-publishing doesn\u2019t re-date the first publish. Refusals answer `Success: false` with a null `Value`, the way `v9/save` does.",
    security: AUTHED,
    requestBody: jsonBody(PublishInventionRequest, "What the publish decides"),
    responses: {
      200: json(
        InventionSaveV9Result,
        "The envelope \u2014 the published invention under `Value`, or `Success: false` with `Error` when the publish was refused"
      ),
      401: json(InventionSaveV9Result, "The same envelope, refused \u2014 not an empty body")
    }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json(inventionSaveV9Failure("Invalid request body"));
    const gate = await creatorsInventionResult(
      c,
      typeof body.InventionId === "number" ? body.InventionId : Number.NaN
    );
    if ("rejection" in gate) {
      return gate.status === 401 ? c.json(inventionSaveV9Failure(gate.rejection), 401) : c.json(inventionSaveV9Failure(gate.rejection));
    }
    const int = (key) => typeof body[key] === "number" && Number.isInteger(body[key]) ? body[key] : void 0;
    const price = int("Price");
    const published = await publishInvention(c.env.DB, gate.invention.InventionId, {
      permissionLevel: int("Permission"),
      accessibility: int("Accessibility"),
      // A negative price is dropped rather than stored, as it is on `v3/publish`.
      price: price !== void 0 && price < 0 ? void 0 : price
    });
    if (published === null) return c.json(inventionSaveV9Failure("No such invention"));
    return c.json(toSaveResultV9(published, published.Tags ?? []));
  }
).post(
  "/api/inventions/v2/delete",
  describeRoute({
    tags: ["Inventions"],
    summary: "Delete an invention",
    description: "Creator only \u2014 a buyer or a co-owner cannot delete someone else\u2019s invention. The record goes entirely: its versions, tags and referenced-invention lists live in the same row.\n\nWhat survives is deliberate. The data blob stays in storage, because nothing here knows whether another record still points at that filename. The ownership rows of players who bought it stay too \u2014 a delete must not rewrite what someone else paid for \u2014 and they fall out of every list on their own, since an owned id with no invention row behind it is skipped.\n\nAnswers the `{ Value, Success, Error, error_id }` envelope the other v2+ invention routes use, with `Value` NULL: the invention is gone, so there is nothing to redraw from and the client reads only `Success`. Refusals \u2014 an unknown invention and someone else\u2019s alike \u2014 are `Success: false` with a message, not a bare error body that client cannot parse.",
    security: AUTHED,
    requestBody: jsonBody(DeleteInventionRequest, "The invention to delete"),
    responses: {
      200: json(InventionDeleteResult, "The delete envelope, `Value` null either way"),
      401: json(InventionDeleteResult, "The same envelope, refused \u2014 not an empty body")
    }
  }),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) return c.json(inventionDeleteResult("Invalid request body"));
    const gate = await creatorsInventionResult(
      c,
      typeof body.InventionId === "number" ? body.InventionId : Number.NaN
    );
    if ("rejection" in gate) {
      return gate.status === 401 ? c.json(inventionDeleteResult(gate.rejection), 401) : c.json(inventionDeleteResult(gate.rejection));
    }
    const deleted = await deleteInvention(c.env.DB, gate.invention.InventionId);
    return c.json(
      deleted === null ? inventionDeleteResult("No such invention") : inventionDeleteResult()
    );
  }
);
export {
  avatarRoutes
};
