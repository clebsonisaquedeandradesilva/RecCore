// Ported from apps/api/src/routes/images.ts; TypeScript types erased; native runtime imports.
import { Hono } from "../../../../../runtime/router.js";
import { describeRoute } from "../../../../../runtime/openapi.js";
import {
  createImage,
  deleteImage,
  getCheeredImageIds,
  getImageByName,
  getImagesByIds,
  getImagesByPlayer,
  getImagesByRoom,
  getPlayerFeed,
  getSlideshowImages,
  SavedImageType,
  setImageCheer,
  SLIDESHOW_LIMIT,
  SLIDESHOW_MAX_LIMIT,
  toImageMetadata,
  toImagesPlayer
} from "../../../../packages/domain/src/index.js";
import { authedId, unauthorized } from "../http.js";
import {
  AUTHED,
  CheeredBulkRequest,
  CheeredEntry,
  CheerImageRequest,
  DeleteImageRequest,
  ErrorResponse,
  form,
  idParam,
  ImageMetadataDto,
  ImagesPlayerDto,
  intQuery,
  json,
  JsonArray,
  jsonBody,
  pageParams,
  PhotoTaggingSettingRequest,
  PhotoTaggingSettingResponse,
  SavedImageDto,
  SlideshowResponse,
  stringQuery,
  SuccessResponse,
  UNAUTHORIZED_RESPONSE,
  UploadImageRequest,
  UploadImageResponse
} from "../openapi.js";
import { exceedsApiUploadLimit, maxApiUploadBytes } from "../upload-limit.js";
const typeFolder = {
  [SavedImageType.None]: "none",
  [SavedImageType.ShareCamera]: "sharecamera",
  [SavedImageType.OutfitThumbnail]: "outfit",
  [SavedImageType.RoomThumbnail]: "room",
  [SavedImageType.ProfileThumbnail]: "profile",
  [SavedImageType.InventionThumbnail]: "invention"
};
const PHOTO_TAGGING_KEY = "playerPhotoTaggingSetting";
const PHOTO_TAGGING_DEFAULT = 0;
async function getPlayerSettings(env, accountId) {
  return env.RECFLARE_PLAYER_SETTINGS.get(
    `player:${accountId}`,
    "json"
  ).catch(() => null);
}
async function readPhotoTaggingSetting(env, accountId) {
  const stored = await getPlayerSettings(env, accountId);
  const raw = stored?.[PHOTO_TAGGING_KEY];
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isNaN(parsed) ? PHOTO_TAGGING_DEFAULT : parsed;
}
async function writePhotoTaggingSetting(env, accountId, setting) {
  const stored = await getPlayerSettings(env, accountId) ?? {};
  await env.RECFLARE_PLAYER_SETTINGS.put(
    `player:${accountId}`,
    JSON.stringify({ ...stored, [PHOTO_TAGGING_KEY]: String(setting) })
  );
}
async function readPostedSetting(c) {
  const body = (c.req.header("content-type") ?? "").includes("application/json") ? await c.req.json().catch(() => null) : await c.req.parseBody().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return void 0;
  const raw = body.Setting ?? body.setting;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : void 0;
  if (typeof raw !== "string") return void 0;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(parsed) ? void 0 : parsed;
}
async function cheerLookupIds(c) {
  const raw = [...c.req.queries("id") ?? []];
  if (c.req.method !== "GET") {
    const body = await c.req.parseBody({ all: true }).catch(() => ({}));
    const key = Object.keys(body).find((k) => k.toLowerCase() === "id");
    const posted = key === void 0 ? [] : body[key];
    for (const value of Array.isArray(posted) ? posted : [posted]) {
      if (typeof value === "string") raw.push(value);
    }
  }
  return raw.flatMap((value) => value.split(",")).map((value) => Number.parseInt(value.trim(), 10)).filter((imageId) => !Number.isNaN(imageId));
}
async function cheerLookup(c) {
  const id = await authedId(c);
  if (id === null) return unauthorized(c);
  const ids = await cheerLookupIds(c);
  const cheered = await getCheeredImageIds(c.env.DB, id, ids);
  return c.json(ids.map((imageId) => ({ SavedImageId: imageId, IsCheered: cheered.has(imageId) })));
}
const imageRoutes = new Hono({ strict: false }).get(
  "/api/images/v2/named",
  describeRoute({
    tags: ["Images"],
    summary: "Named images",
    description: "The named-image catalog (UI art the client looks up by name). Not hydrated yet.",
    responses: { 200: json(JsonArray, "An empty list") }
  }),
  (c) => c.json([])
).post(
  "/api/images/v4/uploadsaved",
  describeRoute({
    tags: ["Images"],
    summary: "Upload a saved image",
    description: "Stores a photo in the shared image bucket under a random key, foldered by image type and upload date (e.g. `sharecamera/2026-06-15/\u2026`) so the bucket stays browsable. The returned `ImageName` is that key \u2014 the `img` worker serves the object back by it, slashes and all.\n\nThe `imgMeta` multipart field is a JSON `SavedImageMetaDTO` describing the upload; malformed JSON is tolerated and the image is still stored, just untyped. A `savedImageType` of 4 (profile thumbnail) additionally becomes the account\u2019s avatar, persisted on the account row.",
    security: AUTHED,
    requestBody: form(UploadImageRequest, "The image file plus its metadata"),
    responses: {
      200: json(UploadImageResponse, "The stored bucket key"),
      400: json(ErrorResponse, "No file in the request"),
      401: UNAUTHORIZED_RESPONSE,
      413: json(ErrorResponse, "The image exceeds the configured per-file limit")
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.parseBody().catch(() => ({}));
    const candidate = body.image ?? body.file;
    if (!(candidate instanceof File)) return c.json({ error: "No file found in request" }, 400);
    const file = candidate;
    const limit = maxApiUploadBytes(c.env);
    if (exceedsApiUploadLimit(file, limit)) {
      return c.json({ error: `image exceeds the ${limit}-byte upload limit` }, 413);
    }
    let meta = {};
    if (typeof body.imgMeta === "string") {
      try {
        const parsed = JSON.parse(body.imgMeta);
        if (parsed && typeof parsed === "object") meta = parsed;
      } catch {
      }
    }
    const num = (v) => typeof v === "number" ? v : void 0;
    const savedImageType = num(meta.savedImageType) ?? SavedImageType.None;
    const roomId = num(meta.roomId);
    const playerEventId = num(meta.playerEventId);
    const valid = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    const extension = valid.includes(ext) ? ext : ".jpg";
    const typePrefix = (typeFolder[savedImageType] ?? typeFolder[SavedImageType.None]) + "/";
    const datePrefix = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + "/";
    const name = typePrefix + datePrefix + crypto.randomUUID() + extension;
    await c.env.IMAGES.put(name, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "image/jpeg" }
    });
    if (savedImageType === SavedImageType.ProfileThumbnail) {
      await c.env.DB.prepare(
        "UPDATE account SET data = json_set(data, '$.profileImage', ?2) WHERE account_id = ?1"
      ).bind(id, name).run();
    }
    await createImage(c.env.DB, {
      imageName: name,
      playerId: id,
      type: savedImageType,
      accessibility: num(meta.accessibility),
      roomId: roomId !== void 0 && roomId > 0 ? roomId : null,
      description: typeof meta.description === "string" ? meta.description : null,
      taggedPlayerIds: Array.isArray(meta.playerIds) ? meta.playerIds.filter((v) => typeof v === "number") : void 0,
      playerEventId: playerEventId !== void 0 && playerEventId > 0 ? playerEventId : null
    });
    return c.json({ ImageName: name });
  }
).delete(
  "/api/images/v1/deletesaved",
  describeRoute({
    tags: ["Images"],
    summary: "Delete one of the caller\u2019s photos",
    description: "Looks the image up by name and refuses unless the caller took it, then removes the metadata row (and its cheers) and the object from the bucket. The metadata goes first; the R2 delete is idempotent, so a missing object is fine.",
    security: AUTHED,
    requestBody: jsonBody(DeleteImageRequest, "The image to delete"),
    responses: {
      200: json(SuccessResponse, "Deleted"),
      400: json(ErrorResponse, "No ImageName given"),
      401: UNAUTHORIZED_RESPONSE,
      403: json(ErrorResponse, "Not the caller\u2019s image"),
      404: { description: "No image by that name" }
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    const imageName = typeof body?.ImageName === "string" ? body.ImageName : "";
    if (imageName === "") return c.json({ error: "ImageName is required" }, 400);
    const image = await getImageByName(c.env.DB, imageName);
    if (!image) return c.notFound();
    if (image.PlayerId !== id) return c.json({ error: "Not your image" }, 403);
    await deleteImage(c.env.DB, image);
    await c.env.IMAGES.delete(imageName);
    return c.json({ success: true });
  }
).get(
  "/api/images/v4/room/:roomId{[0-9]+}",
  describeRoute({
    tags: ["Images"],
    summary: "A room\u2019s photo feed",
    description: "The public images taken in that room.\n\nThis feed serves the RAW `SavedImage` record \u2014 unlike the player photo lists below, which must serve the `ImagesPlayer` projection. The inconsistency is real and load-bearing: both render correctly as they are, and unifying them breaks one of them.",
    parameters: [
      idParam("roomId", "Room id"),
      intQuery("sort", "1 = most cheered; anything else = newest first"),
      intQuery("filter", "Narrow by SavedImageType; 0 = all"),
      ...pageParams(100)
    ],
    responses: { 200: json(SavedImageDto.array(), "The room\u2019s photos") }
  }),
  async (c) => {
    const roomId = Number.parseInt(c.req.param("roomId"), 10);
    const sort = Number.parseInt(c.req.query("sort") ?? "0", 10) || 0;
    const filter = Number.parseInt(c.req.query("filter") ?? "0", 10) || 0;
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    return c.json(await getImagesByRoom(c.env.DB, roomId, sort, filter, skip, take));
  }
).get(
  "/api/images/v4/player/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Images"],
    summary: "A player\u2019s photos",
    description: "The public images that player has taken, newest first. Serves the client\u2019s `ImagesPlayer` projection (`SavedImageId`/`SavedImageType`, no `TaggedPlayerIds`) \u2014 the raw `SavedImage` renders blank thumbnails here.",
    parameters: [idParam("playerId", "Account id"), ...pageParams(100)],
    responses: { 200: json(ImagesPlayerDto.array(), "The player\u2019s photos") }
  }),
  async (c) => {
    const playerId = Number.parseInt(c.req.param("playerId"), 10);
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    const images = await getImagesByPlayer(c.env.DB, playerId, 0, skip, take);
    return c.json(images.map(toImagesPlayer));
  }
).get(
  "/api/images/v5/player/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Images"],
    summary: "A player\u2019s photos, sortable",
    description: "v4 plus a `sort` option. Same `ImagesPlayer` projection \u2014 see the note on v4.",
    parameters: [
      idParam("playerId", "Account id"),
      intQuery("sort", "1 = most cheered; anything else = newest first"),
      ...pageParams(100)
    ],
    responses: { 200: json(ImagesPlayerDto.array(), "The player\u2019s photos") }
  }),
  async (c) => {
    const playerId = Number.parseInt(c.req.param("playerId"), 10);
    const sort = Number.parseInt(c.req.query("sort") ?? "0", 10) || 0;
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    const images = await getImagesByPlayer(c.env.DB, playerId, sort, skip, take);
    return c.json(images.map(toImagesPlayer));
  }
).get(
  "/api/images/v3/feed/player/:playerId{[0-9]+}",
  describeRoute({
    tags: ["Images"],
    summary: "A player\u2019s photo feed",
    description: "The public images they took PLUS the ones they are tagged in, newest first \u2014 the photo tab on a profile. Same `ImagesPlayer` projection as the player photo lists.",
    parameters: [idParam("playerId", "Account id"), ...pageParams(100)],
    responses: { 200: json(ImagesPlayerDto.array(), "The player\u2019s feed") }
  }),
  async (c) => {
    const playerId = Number.parseInt(c.req.param("playerId"), 10);
    const skip = Number.parseInt(c.req.query("skip") ?? "0", 10) || 0;
    const take = Number.parseInt(c.req.query("take") ?? "100", 10) || 100;
    const images = await getPlayerFeed(c.env.DB, playerId, skip, take);
    return c.json(images.map(toImagesPlayer));
  }
).get(
  "/api/images/v1/slideshow",
  describeRoute({
    tags: ["Images"],
    summary: "The global slideshow feed",
    description: "The most recent publicly-listable ShareCamera photos across all rooms, newest first, each joined to its creator\u2019s username and room name.\n\nDeliberately public \u2014 it surfaces only already-public images and backs the anonymous homepage slideshow. `ValidTill` is a short (2-minute) cache hint the client refreshes against.",
    parameters: [
      intQuery(
        "take",
        `How many photos to return (default ${SLIDESHOW_LIMIT}, capped at ${SLIDESHOW_MAX_LIMIT})`
      )
    ],
    responses: { 200: json(SlideshowResponse, "The feed plus its cache hint") }
  }),
  async (c) => {
    const asked = Number.parseInt(c.req.query("take") ?? "", 10);
    const take = asked > 0 ? Math.min(asked, SLIDESHOW_MAX_LIMIT) : SLIDESHOW_LIMIT;
    const Images = await getSlideshowImages(c.env.DB, take);
    const ValidTill = new Date(Date.now() + 2 * 60 * 1e3).toISOString();
    return c.json({ Images, ValidTill });
  }
).get(
  "/api/images/v5/bulk",
  describeRoute({
    tags: ["Images"],
    summary: "Image metadata by id, in bulk",
    description: "The stored `SavedImage` records for the given ids (`?ids=207&ids=106`), as a bare array in request order. An id with no record, or one that is not public, is absent from the answer rather than an error \u2014 the list can be shorter than the request. Serves the raw `SavedImage` (as `v6` does), not the `ImagesPlayer` projection the player photo lists use.",
    parameters: [
      intQuery("ids", "Repeatable; each value may also be a comma-separated list of image ids")
    ],
    responses: { 200: json(SavedImageDto.array(), "The matching records, in request order") }
  }),
  async (c) => {
    const ids = c.req.queries("ids")?.flatMap((raw) => raw.split(",")).map((raw) => Number.parseInt(raw.trim(), 10)).filter((imageId) => !Number.isNaN(imageId)) ?? [];
    return c.json(await getImagesByIds(c.env.DB, ids));
  }
).get(
  "/api/images/v6",
  describeRoute({
    tags: ["Images"],
    summary: "Image metadata by filename",
    description: 'An image\u2019s metadata for a bucket key. 404s when the object exists but has no metadata row.\n\nIts own projection: renamed like the player lists (`SavedImageId`/`SavedImageType`, no `TaggedPlayerIds`) but carrying `ClubId`, and with nothing nullable \u2014 `RoomId`, `PlayerEventId` and `ClubId` read 0 where the row holds null, `Description` reads `""`. Three shapes of one row; keep them straight.',
    parameters: [stringQuery("name", "The image name (bucket key); required")],
    responses: {
      200: json(ImageMetadataDto, "The image\u2019s metadata"),
      400: json(ErrorResponse, "No name given"),
      404: { description: "No metadata for that name" }
    }
  }),
  async (c) => {
    const name = c.req.query("name") ?? "";
    if (name === "") return c.json({ error: "name is required" }, 400);
    const image = await getImageByName(c.env.DB, name);
    return image ? c.json(toImageMetadata(image)) : c.notFound();
  }
).post(
  "/api/images/v1/cheer",
  describeRoute({
    tags: ["Images"],
    summary: "Cheer or un-cheer a photo",
    description: "Persists the caller\u2019s cheer and resyncs the image\u2019s `CheerCount`. A body naming no `SavedImageId` is accepted and ignored \u2014 the ack is the same either way.",
    security: AUTHED,
    requestBody: jsonBody(CheerImageRequest, "The image and the new cheer state"),
    responses: {
      200: json(SuccessResponse, "Recorded"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const body = await c.req.json().catch(() => null);
    if (body && typeof body.SavedImageId === "number") {
      await setImageCheer(c.env.DB, id, body.SavedImageId, body.Cheer === true);
    }
    return c.json({ success: true });
  }
).get(
  "/api/images/v5/cheered/bulk",
  describeRoute({
    tags: ["Images"],
    summary: "Which photos the caller has cheered",
    description: "One `{ SavedImageId, IsCheered }` per requested id, in request order \u2014 the client fills in the cheer buttons on a photo grid from this.",
    security: AUTHED,
    parameters: [
      intQuery("id", "Repeatable; each value may be a comma-separated list of image ids")
    ],
    responses: {
      200: json(CheeredEntry.array(), "One entry per requested id, in order"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  cheerLookup
).post(
  "/api/images/v5/cheered/bulk",
  describeRoute({
    tags: ["Images"],
    summary: "Which photos the caller has cheered (bulk POST)",
    description: "One `{ SavedImageId, IsCheered }` per requested id, in request order \u2014 the client fills in the cheer buttons on a photo grid from this. The ids are a form body of repeated `id` fields (`id=651&id=570&\u2026`), which is how the client sends a page of ~100 at once; the query string is read too, so the GET form of this path answers identically.",
    security: AUTHED,
    requestBody: form(CheeredBulkRequest, "The image ids, as repeated `id` fields"),
    responses: {
      200: json(CheeredEntry.array(), "One entry per requested id, in order"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  cheerLookup
).get(
  "/api/players/v1/playerPhotoTaggingSetting",
  describeRoute({
    tags: ["Images"],
    summary: "The caller\u2019s photo-tagging preference",
    description: "Who may tag the caller in photos, as a bare JSON integer (the enum ordinal the client defines \u2014 stored and served back untouched). `0` until the player sets one. Stored as one key in the player-settings bag the `playersettings` worker owns.",
    security: AUTHED,
    responses: {
      200: json(PhotoTaggingSettingResponse, "The caller\u2019s setting; 0 if never set"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    return c.json(await readPhotoTaggingSetting(c.env, id));
  }
).put(
  "/api/players/v1/playerPhotoTaggingSetting",
  describeRoute({
    tags: ["Images"],
    summary: "Set the caller\u2019s photo-tagging preference",
    description: "Stores `Setting` as the caller\u2019s photo-tagging preference and answers the stored value (a bare integer), which is what the client re-renders the toggle from. The write merges into the player-settings bag, so the player\u2019s other settings are left alone. `Setting` is also read from a form body, and from a `setting` spelling; a body carrying no readable value is a no-op that answers the current setting.",
    security: AUTHED,
    requestBody: jsonBody(PhotoTaggingSettingRequest, "The preference to store"),
    responses: {
      200: json(PhotoTaggingSettingResponse, "The setting the caller now has"),
      401: UNAUTHORIZED_RESPONSE
    }
  }),
  async (c) => {
    const id = await authedId(c);
    if (id === null) return unauthorized(c);
    const setting = await readPostedSetting(c);
    if (setting === void 0) return c.json(await readPhotoTaggingSetting(c.env, id));
    await writePhotoTaggingSetting(c.env, id, setting);
    return c.json(setting);
  }
);
export {
  imageRoutes
};
