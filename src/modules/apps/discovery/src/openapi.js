// Ported from apps/discovery/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
const PAGE_SOURCE_PARAM = {
  name: "type",
  in: "path",
  required: true,
  description: [
    "The page source \u2014 `WatchHome`, `PlayHighlight`, `CommunityBoard`, `PlayMenuTabs`,",
    "`PlayCategories`, `StoreCategories`, `StoreFeatured`, `StoreClothing`,",
    "`StoreConsumables` at the time of writing. It names a file in `static/`",
    "(`<type>.json`) and is matched exactly, case included, so the set is whatever is",
    "published rather than anything this worker enumerates.",
    "",
    "`sections` is a file in `static/` too but is not one of these: it is the id-keyed",
    "catalogue `/sections/bulk` filters, not a page anything draws."
  ].join(" "),
  // Deliberately not an `enum`: the accepted values are the published files, and a spec
  // that froze today's list would be wrong the moment one is added.
  schema: { type: "string", example: "WatchHome" }
};
const SECTION_IDS_PARAM = {
  name: "id",
  in: "query",
  required: false,
  description: [
    "A section id to look up, repeated once per section wanted. Ids that match nothing are",
    "skipped rather than erroring, and repeating one still yields it once \u2014 the answer is",
    "the catalogue filtered, so it can only ever be a subset of it. Omitting the parameter",
    "entirely answers `[]`."
  ].join(" "),
  style: "form",
  explode: true,
  schema: { type: "array", items: { type: "string" } },
  example: [
    "Rooms_New_PlayHighlight_TabsTest_Explore",
    "RoomCategories_MoodPlaylists_FeelingLucky"
  ]
};
const ServiceStatus = z.object({
  service: z.literal("discovery"),
  status: z.literal("ok")
});
const DiscoverySection = z.object({
  id: z.string().describe("Unique id of this section on this page, e.g. `Rooms_RRO_WatchHome`"),
  sectionType: z.int().describe(
    "What the section lists: 0 RoomsSection \xB7 1 AccountsSection \xB7 2 InventionsSection \xB7 3 ClubsSection \xB7 4 StoreItemsSection \xB7 5 EventsSection \xB7 6 RoomBanner \xB7 7 Top5Section \xB7 8 CustomAvatarItemsSection \xB7 9 AdsSection \xB7 10 SkusSection \xB7 11 RoomCategorySection \xB7 12 RoomCategoryListSection \xB7 13 DiscoverySection"
  ),
  sectionSubType: z.string().describe("The section\u2019s kind, shared across pages, e.g. `Rooms_RRO`"),
  source: z.string().describe("The feed that fills the section"),
  sourceMetadata: z.string().nullable().describe("Argument to `source` \u2014 a carousel slug, a playlist id, \u2026 `null` when it takes none"),
  displayMetadata: z.string().nullable().describe(
    "How the section is drawn (`DisplayTitle`, `numRows`, `backgroundColor`, \u2026), as an embedded JSON *string* the client parses itself \u2014 not an object. Its booleans and numbers are quoted in most sections and bare in some; both forms are live in the captures, so the client evidently takes either. `null` where a section is drawn however its type says (several store and play-highlight sections)."
  )
});
const DiscoverySections = DiscoverySection.array();
export {
  DiscoverySection,
  DiscoverySections,
  PAGE_SOURCE_PARAM,
  SECTION_IDS_PARAM,
  ServiceStatus,
  json
};
