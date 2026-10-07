// Ported from apps/lists/src/curated-lists.ts; TypeScript types erased; native runtime imports.
import { DEFAULT_LIST_IMAGE } from "../../../packages/domain/src/index.js";
import curatedLists from "../static/curated-lists.json.js";
const CuratedListType = {
  WatchHome: 0,
  PlayHighlight: 1,
  CommunityBoard: 2,
  MobileHome: 3,
  StoreFeatured: 4,
  StoreClothing: 5,
  StoreConsumables: 6,
  PlayCategories: 7,
  StoreInventions: 8,
  TitleScreen: 9,
  PlayMenuTabs: 10,
  OrientationStoreFeatured: 11,
  AppNavPortalPanel: 12,
  WWPanelList: 13,
  RecRoomPlusBenefits: 14,
  RecCenterStorefront: 15,
  RecCenterCommunityContent: 16,
  None: 999
};
const CURATED_LISTS = curatedLists;
function serializeCuratedList(list) {
  return JSON.stringify(list).replace(/"ListId":"(\d+)"/, '"ListId":$1');
}
function nameKey(name) {
  return name.toLowerCase();
}
const BY_CREATOR_TYPE_NAME = /* @__PURE__ */ new Map();
const BY_TYPE_NAME = /* @__PURE__ */ new Map();
const BY_NAME = /* @__PURE__ */ new Map();
const BY_TYPE = /* @__PURE__ */ new Map();
for (const list of CURATED_LISTS) {
  const name = nameKey(list.Name);
  BY_CREATOR_TYPE_NAME.set(`${list.CreatorAccountId}/${list.Type}/${name}`, list);
  if (!BY_TYPE_NAME.has(`${list.Type}/${name}`)) BY_TYPE_NAME.set(`${list.Type}/${name}`, list);
  if (!BY_NAME.has(name)) BY_NAME.set(name, list);
  if (!BY_TYPE.has(list.Type)) BY_TYPE.set(list.Type, list);
}
const RESERVED_LIST_PREFIX = "__";
function isReservedListName(name) {
  return (name ?? "").startsWith(RESERVED_LIST_PREFIX);
}
function emptyReservedList(creatorAccountId, type, name) {
  return {
    ListId: "0",
    CreatorAccountId: Number.parseInt(creatorAccountId ?? "", 10) || 0,
    Name: name,
    Description: null,
    ImageName: DEFAULT_LIST_IMAGE,
    Type: type,
    ItemIds: [],
    Accessibility: 1,
    CreatedAt: (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
const PLACEHOLDER_LIST_IMAGE = "DefaultListImage.jpg";
const PLACEHOLDER_CREATED_AT = "2026-08-24T18:44:52.438Z";
function placeholderCuratedList(creatorAccountId, type, name) {
  const parsedType = Number.parseInt(type ?? "", 10);
  return {
    // A string here and a NUMBER on the wire — see `serializeCuratedList`, which is why every
    // id in this file is carried as one.
    ListId: "1",
    CreatorAccountId: Number.parseInt(creatorAccountId ?? "", 10) || 0,
    Name: name ?? "",
    Description: null,
    ImageName: PLACEHOLDER_LIST_IMAGE,
    Type: Number.isInteger(parsedType) ? parsedType : 0,
    ItemIds: [],
    Accessibility: 0,
    CreatedAt: PLACEHOLDER_CREATED_AT
  };
}
function resolveCuratedList(creatorAccountId, type, name) {
  const key = nameKey(name ?? "");
  const parsedType = Number.parseInt(type ?? "", 10);
  const hasType = Number.isInteger(parsedType);
  return (hasType ? BY_CREATOR_TYPE_NAME.get(`${creatorAccountId}/${parsedType}/${key}`) : void 0) ?? (hasType ? BY_TYPE_NAME.get(`${parsedType}/${key}`) : void 0) ?? BY_NAME.get(key) ?? (isReservedListName(name) ? emptyReservedList(creatorAccountId, hasType ? parsedType : 0, name ?? "") : void 0) ?? (key === "" && hasType ? BY_TYPE.get(parsedType) : void 0);
}
export {
  CuratedListType,
  isReservedListName,
  placeholderCuratedList,
  resolveCuratedList,
  serializeCuratedList
};
