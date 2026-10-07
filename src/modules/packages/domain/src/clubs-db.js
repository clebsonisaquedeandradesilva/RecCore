// Ported from packages/domain/src/clubs-db.ts; TypeScript types erased; native runtime imports.
import { getSavedImagesByNames, placeholderSavedImage } from "./images-db.js";
const CLUB_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS club (
		data TEXT NOT NULL,
		club_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.ClubId')) VIRTUAL,
		name_lower TEXT GENERATED ALWAYS AS (lower(json_extract(data, '$.Name'))) VIRTUAL,
		category TEXT GENERATED ALWAYS AS (json_extract(data, '$.Category')) VIRTUAL,
		visibility INTEGER GENERATED ALWAYS AS (json_extract(data, '$.Visibility')) VIRTUAL,
		state INTEGER GENERATED ALWAYS AS (json_extract(data, '$.State')) VIRTUAL,
		creator_account_id INTEGER GENERATED ALWAYS AS (json_extract(data, '$.CreatorAccountId')) VIRTUAL
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_club_club_id ON club (club_id)`,
  `CREATE INDEX IF NOT EXISTS idx_club_name_lower ON club (name_lower)`,
  `CREATE INDEX IF NOT EXISTS idx_club_category ON club (category)`,
  `CREATE INDEX IF NOT EXISTS idx_club_creator ON club (creator_account_id)`,
  // Club membership — one row per (club, account); `membership_type` (see
  // ClubMembershipType) encodes bans, pending requests/invites, and roles in a
  // single field. Surrogate PK mirrors the Go model; the UNIQUE (club_id,
  // account_id) index enforces one membership per pair (and backs the upsert). The
  // club's MemberCount is kept in sync from the rows that count as real members.
  `CREATE TABLE IF NOT EXISTS club_member (
		club_member_id INTEGER PRIMARY KEY AUTOINCREMENT,
		club_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		membership_type INTEGER NOT NULL DEFAULT 0,
		created_at TEXT
	)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_club_member_pair ON club_member (club_id, account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_club_member_account ON club_member (account_id)`,
  // Club announcements — the club's noticeboard, newest first. Columns rather than a
  // JSON blob (mirroring the Go model), since nothing here is client-shaped beyond
  // the fields themselves.
  `CREATE TABLE IF NOT EXISTS club_announcement (
		announcement_id INTEGER PRIMARY KEY AUTOINCREMENT,
		club_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		title TEXT NOT NULL DEFAULT '',
		body TEXT NOT NULL DEFAULT '',
		image_name TEXT NOT NULL DEFAULT '',
		meta TEXT NOT NULL DEFAULT '',
		created_at TEXT
	)`,
  `CREATE INDEX IF NOT EXISTS idx_club_announcement_club ON club_announcement (club_id)`
];
var ClubMembershipType = /* @__PURE__ */ ((ClubMembershipType2) => {
  ClubMembershipType2[ClubMembershipType2["Banned"] = -1] = "Banned";
  ClubMembershipType2[ClubMembershipType2["None"] = 0] = "None";
  ClubMembershipType2[ClubMembershipType2["PendingRequested"] = 1] = "PendingRequested";
  ClubMembershipType2[ClubMembershipType2["PendingInvited"] = 2] = "PendingInvited";
  ClubMembershipType2[ClubMembershipType2["PendingDenied"] = 3] = "PendingDenied";
  ClubMembershipType2[ClubMembershipType2["Member"] = 10] = "Member";
  ClubMembershipType2[ClubMembershipType2["Moderator"] = 20] = "Moderator";
  ClubMembershipType2[ClubMembershipType2["Coowner"] = 30] = "Coowner";
  ClubMembershipType2[ClubMembershipType2["Creator"] = 100] = "Creator";
  return ClubMembershipType2;
})(ClubMembershipType || {});
var ClubVisibility = /* @__PURE__ */ ((ClubVisibility2) => {
  ClubVisibility2[ClubVisibility2["Private"] = 0] = "Private";
  ClubVisibility2[ClubVisibility2["Public"] = 1] = "Public";
  return ClubVisibility2;
})(ClubVisibility || {});
var ClubJoinability = /* @__PURE__ */ ((ClubJoinability2) => {
  ClubJoinability2[ClubJoinability2["Open"] = 0] = "Open";
  ClubJoinability2[ClubJoinability2["InviteOnly"] = 1] = "InviteOnly";
  ClubJoinability2[ClubJoinability2["AskToJoin"] = 2] = "AskToJoin";
  return ClubJoinability2;
})(ClubJoinability || {});
const MEMBER_THRESHOLD = 10 /* Member */;
const MAX_ADDITIONAL_IMAGES = 3;
function toDto(s) {
  return {
    ClubId: s.ClubId,
    Name: s.Name,
    Description: s.Description,
    Category: s.Category,
    Visibility: s.Visibility,
    Joinability: s.Joinability,
    AllowJuniors: s.AllowJuniors,
    MainImageName: s.MainImageName,
    ClubType: s.ClubType,
    ClubhouseRoomId: s.ClubhouseRoomId,
    CreatorAccountId: s.CreatorAccountId,
    IsRRO: s.IsRRO,
    MinLevel: s.MinLevel,
    State: s.State,
    MemberCount: s.MemberCount
  };
}
const parseOne = (row) => row ? toDto(JSON.parse(row.data)) : null;
const parseAll = (rows) => rows.map((r) => toDto(JSON.parse(r.data)));
async function syncMemberCount(db, clubId) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM club_member WHERE club_id = ?1 AND membership_type >= ?2").bind(clubId, MEMBER_THRESHOLD).first();
  const count = row?.n ?? 0;
  await db.prepare(
    "UPDATE club SET data = json_set(data, '$.MemberCount', CAST(?2 AS INTEGER)) WHERE club_id = ?1"
  ).bind(clubId, count).run();
  return count;
}
async function getMembership(db, clubId, accountId) {
  const row = await db.prepare("SELECT membership_type AS t FROM club_member WHERE club_id = ?1 AND account_id = ?2").bind(clubId, accountId).first();
  return row?.t ?? 0 /* None */;
}
async function setMembership(db, clubId, accountId, type) {
  await db.prepare(
    `INSERT INTO club_member (club_id, account_id, membership_type, created_at)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT(club_id, account_id) DO UPDATE SET membership_type = ?3`
  ).bind(clubId, accountId, type, (/* @__PURE__ */ new Date()).toISOString()).run();
}
async function createClub(db, creatorAccountId, input) {
  const idRow = await db.prepare("SELECT COALESCE(MAX(club_id), 0) + 1 AS next FROM club").first();
  const clubId = idRow?.next ?? 1;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stored = {
    ClubId: clubId,
    Name: input.name,
    Description: input.description ?? "",
    Category: input.category ?? "",
    Visibility: input.visibility ?? 1 /* Public */,
    Joinability: input.joinability ?? 0 /* Open */,
    AllowJuniors: input.allowJuniors ?? true,
    MainImageName: input.mainImageName ?? "DefaultImgPurple",
    ClubType: input.clubType ?? 0,
    ClubhouseRoomId: input.clubhouseRoomId ?? null,
    CreatorAccountId: creatorAccountId,
    IsRRO: input.isRRO ?? false,
    MinLevel: input.minLevel ?? 0,
    State: 0,
    MemberCount: 0,
    CreatedAt: now
  };
  await db.prepare("INSERT INTO club (data) VALUES (?1)").bind(JSON.stringify(stored)).run();
  await setMembership(db, clubId, creatorAccountId, 100 /* Creator */);
  const count = await syncMemberCount(db, clubId);
  return { ...toDto(stored), MemberCount: count };
}
function clubPermission(clubId, type, granted = {}) {
  return {
    ClubId: clubId,
    Type: type,
    ApproveMember: false,
    BanUnban: false,
    CreateEvent: false,
    EditDetails: false,
    EditPermissionSettings: false,
    PostAnnouncement: false,
    ...granted
  };
}
async function getClubDetails(db, club, accountId) {
  return {
    AdditionalImages: await getClubGallery(db, club.ClubId),
    Club: club,
    ClubId: club.ClubId,
    CoownerPermissions: clubPermission(club.ClubId, 30 /* Coowner */, {
      ApproveMember: true,
      BanUnban: true,
      CreateEvent: true,
      EditDetails: true,
      EditPermissionSettings: true,
      PostAnnouncement: true
    }),
    CustomTags: await getClubCustomTags(db, club.ClubId),
    MemberPermissions: clubPermission(club.ClubId, 10 /* Member */),
    ModeratorPermissions: clubPermission(club.ClubId, 20 /* Moderator */, {
      ApproveMember: true,
      BanUnban: true
    }),
    MyMembershipType: accountId === null ? 0 : await getMembership(db, club.ClubId, accountId)
  };
}
async function getClubAnnouncements(db, clubId) {
  const { results } = await db.prepare(
    `SELECT announcement_id, club_id, account_id, title, body, image_name, meta, created_at
			 FROM club_announcement
			 WHERE club_id = ?1
			 ORDER BY created_at DESC, announcement_id DESC`
  ).bind(clubId).all();
  return results.map((r) => ({
    AnnouncementId: r.announcement_id,
    ClubId: r.club_id,
    AccountId: r.account_id,
    Title: r.title,
    Body: r.body,
    ImageName: r.image_name,
    Meta: r.meta,
    CreatedAt: r.created_at
  }));
}
async function createClubAnnouncement(db, clubId, accountId, fields) {
  const row = await db.prepare(
    `INSERT INTO club_announcement (club_id, account_id, title, body, image_name, meta, created_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
			 RETURNING announcement_id`
  ).bind(
    clubId,
    accountId,
    fields.title ?? "",
    fields.body ?? "",
    fields.imageName ?? "",
    fields.meta ?? "",
    (/* @__PURE__ */ new Date()).toISOString()
  ).first();
  return row?.announcement_id ?? 0;
}
async function searchClubs(db, category, query, sort, count) {
  const { results } = await db.prepare(
    `SELECT data FROM club
			 WHERE visibility = ?1
			   AND json_extract(data, '$.ClubType') != ?2`
  ).bind(1 /* Public */, SUBSCRIPTION_CLUB_TYPE).all();
  const stored = results.map((r) => JSON.parse(r.data));
  const term = query.trim().toLowerCase();
  const wanted = category.trim().toLowerCase();
  const matched = stored.filter((club) => {
    if (wanted !== "" && club.Category.toLowerCase() !== wanted) return false;
    if (term === "") return true;
    return club.Name.toLowerCase().includes(term) || club.Description.toLowerCase().includes(term);
  });
  const byNewest = (a, b) => b.CreatedAt.localeCompare(a.CreatedAt);
  matched.sort((a, b) => {
    if (sort === "1") return byNewest(a, b);
    if (sort === "2") return a.Name.localeCompare(b.Name);
    return b.MemberCount - a.MemberCount || byNewest(a, b);
  });
  return {
    Clubs: matched.slice(0, count).map(toDto),
    ContinuationToken: null,
    TotalClubs: matched.length
  };
}
async function getHomeClub(db, accountId) {
  const row = await db.prepare(
    "SELECT json_extract(data, '$.homeClubId') AS clubId FROM account WHERE account_id = ?1"
  ).bind(accountId).first();
  if (row?.clubId == null) return null;
  const club = await getClub(db, row.clubId);
  if (club === null || club.ClubhouseRoomId == null) return null;
  return club;
}
async function setHomeClub(db, accountId, clubId) {
  await db.prepare(
    "UPDATE account SET data = json_set(data, '$.homeClubId', CAST(?2 AS INTEGER)) WHERE account_id = ?1"
  ).bind(accountId, clubId).run();
}
async function clearHomeClub(db, accountId) {
  await db.prepare("UPDATE account SET data = json_remove(data, '$.homeClubId') WHERE account_id = ?1").bind(accountId).run();
}
async function getClubMembers(db, clubId, membershipType, sortBy) {
  const order = sortBy === "1" ? "account_id ASC" : sortBy === "2" ? "created_at ASC" : "membership_type DESC, created_at ASC";
  const filter = membershipType === void 0 ? "" : "AND membership_type = ?2";
  const { results } = await db.prepare(
    `SELECT club_member_id, club_id, account_id, membership_type, created_at
			 FROM club_member
			 WHERE club_id = ?1 ${filter}
			 ORDER BY ${order}`
  ).bind(...membershipType === void 0 ? [clubId] : [clubId, membershipType]).all();
  return results.map((r) => ({
    ClubMemberId: r.club_member_id,
    ClubId: r.club_id,
    AccountId: r.account_id,
    MembershipType: r.membership_type,
    CreatedAt: r.created_at
  }));
}
async function updateClub(db, clubId, patch) {
  const row = await db.prepare("SELECT data FROM club WHERE club_id = ?1").bind(clubId).first();
  if (row === null) return null;
  const stored = JSON.parse(row.data);
  const updated = {
    ...stored,
    Name: patch.name ?? stored.Name,
    Description: patch.description ?? stored.Description,
    Category: patch.category ?? stored.Category,
    Visibility: patch.visibility ?? stored.Visibility,
    Joinability: patch.joinability ?? stored.Joinability,
    AllowJuniors: patch.allowJuniors ?? stored.AllowJuniors,
    MainImageName: patch.mainImageName ?? stored.MainImageName,
    MinLevel: patch.minLevel ?? stored.MinLevel,
    CustomTags: patch.customTags === void 0 ? stored.CustomTags : dedupeTags(patch.customTags),
    // `null` clears the clubhouse, so this can't collapse to `??`.
    ClubhouseRoomId: patch.clubhouseRoomId === void 0 ? stored.ClubhouseRoomId : patch.clubhouseRoomId
  };
  await db.prepare("UPDATE club SET data = ?1 WHERE club_id = ?2").bind(JSON.stringify(updated), clubId).run();
  return toDto(updated);
}
function dedupeTags(tags) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag === "" || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}
async function getClubAdditionalImages(db, clubId) {
  const row = await db.prepare("SELECT data FROM club WHERE club_id = ?1").bind(clubId).first();
  return row === null ? [] : JSON.parse(row.data).AdditionalImages ?? [];
}
async function getClubGallery(db, clubId) {
  const names = await getClubAdditionalImages(db, clubId);
  if (names.length === 0) return [];
  const records = await getSavedImagesByNames(db, names);
  return names.map((name) => records.get(name) ?? placeholderSavedImage(name));
}
async function setClubAdditionalImage(db, clubId, index, imageName) {
  const row = await db.prepare("SELECT data FROM club WHERE club_id = ?1").bind(clubId).first();
  if (row === null) return null;
  const stored = JSON.parse(row.data);
  const images = [...stored.AdditionalImages ?? []];
  if (imageName === "") {
    if (index < images.length) images.splice(index, 1);
  } else if (index < images.length) {
    images[index] = imageName;
  } else if (images.length < MAX_ADDITIONAL_IMAGES) {
    images.push(imageName);
  }
  const updated = { ...stored, AdditionalImages: images };
  await db.prepare("UPDATE club SET data = ?1 WHERE club_id = ?2").bind(JSON.stringify(updated), clubId).run();
  return toDto(updated);
}
async function getClubCustomTags(db, clubId) {
  const row = await db.prepare("SELECT data FROM club WHERE club_id = ?1").bind(clubId).first();
  return row === null ? [] : JSON.parse(row.data).CustomTags ?? [];
}
async function getClub(db, clubId) {
  return parseOne(
    await db.prepare("SELECT data FROM club WHERE club_id = ?1").bind(clubId).first()
  );
}
async function getClubSummary(db, clubId) {
  const row = await db.prepare(
    `SELECT json_extract(data, '$.Name') AS name,
			        json_extract(data, '$.ClubhouseRoomId') AS clubhouseRoomId
			 FROM club WHERE club_id = ?1`
  ).bind(clubId).first();
  if (row === null) return null;
  return { clubId, name: row.name ?? "", clubhouseRoomId: row.clubhouseRoomId };
}
async function deleteClub(db, clubId) {
  if (await getClub(db, clubId) === null) return false;
  await db.batch([
    db.prepare("DELETE FROM club_member WHERE club_id = ?1").bind(clubId),
    db.prepare("DELETE FROM club_announcement WHERE club_id = ?1").bind(clubId),
    // The account table belongs to the auth worker; a dangling homeClubId already
    // reads as "no home club" (getHomeClub), but leaving it would point at whatever
    // club later reuses the id.
    db.prepare(
      `UPDATE account SET data = json_remove(data, '$.homeClubId')
				 WHERE json_extract(data, '$.homeClubId') = ?1`
    ).bind(clubId),
    db.prepare("DELETE FROM club WHERE club_id = ?1").bind(clubId)
  ]);
  return true;
}
const MOST_ACTIVE_CLUBHOUSE_LIMIT = 50;
async function getMostActiveClubhouses(db, limit = MOST_ACTIVE_CLUBHOUSE_LIMIT, now = Math.floor(Date.now() / 1e3)) {
  const { results } = await db.prepare(
    `SELECT c.club_id AS ClubId,
			        json_extract(c.data, '$.ClubhouseRoomId') AS RoomId,
			        COUNT(*) AS PlayerCount
			 FROM club c
			 JOIN presence p ON p.room_id = json_extract(c.data, '$.ClubhouseRoomId')
			 WHERE c.visibility = ?1
			   AND json_extract(c.data, '$.ClubType') != ?2
			   AND p.expires_at > ?3
			   AND p.room_instance_id IS NOT NULL
			 GROUP BY c.club_id
			 ORDER BY PlayerCount DESC, c.club_id
			 LIMIT ?4`
  ).bind(1 /* Public */, SUBSCRIPTION_CLUB_TYPE, now, limit).all();
  return results;
}
const SUBSCRIPTION_CLUB_TYPE = 1;
async function countClubsByCreator(db, accountId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM club
			 WHERE creator_account_id = ?1
			   AND json_extract(data, '$.ClubType') != ?2`
  ).bind(accountId, SUBSCRIPTION_CLUB_TYPE).first();
  return row?.n ?? 0;
}
async function getClubsByCreator(db, accountId) {
  const { results } = await db.prepare(
    `SELECT data FROM club
			 WHERE creator_account_id = ?1
			   AND json_extract(data, '$.ClubType') != ?2
			 ORDER BY json_extract(data, '$.CreatedAt') ASC`
  ).bind(accountId, SUBSCRIPTION_CLUB_TYPE).all();
  return parseAll(results);
}
async function getClubsByMember(db, accountId) {
  const { results } = await db.prepare(
    `SELECT c.data AS data
			 FROM club_member m
			 JOIN club c ON c.club_id = m.club_id
			 WHERE m.account_id = ?1 AND m.membership_type >= ?2
			   AND json_extract(c.data, '$.ClubType') != ?3
			 ORDER BY json_extract(c.data, '$.CreatedAt') ASC`
  ).bind(accountId, MEMBER_THRESHOLD, SUBSCRIPTION_CLUB_TYPE).all();
  return parseAll(results);
}
async function isClubMember(db, clubId, accountId) {
  return await getMembership(db, clubId, accountId) >= MEMBER_THRESHOLD;
}
async function joinClub(db, clubId, accountId) {
  const club = await getClub(db, clubId);
  if (!club) return null;
  const current = await getMembership(db, clubId, accountId);
  if (current === -1 /* Banned */ || current >= MEMBER_THRESHOLD) {
    return club;
  }
  const next = club.Joinability === 0 /* Open */ ? 10 /* Member */ : 1 /* PendingRequested */;
  await setMembership(db, clubId, accountId, next);
  const count = await syncMemberCount(db, clubId);
  return { ...club, MemberCount: count };
}
async function requestToJoinClub(db, clubId, accountId) {
  const club = await getClub(db, clubId);
  if (!club) return null;
  const current = await getMembership(db, clubId, accountId);
  if (current === -1 /* Banned */) return { result: "banned", club };
  if (current >= MEMBER_THRESHOLD) return { result: "alreadyMember", club };
  if (current === 1 /* PendingRequested */) return { result: "alreadyPending", club };
  if (club.Joinability === 1 /* InviteOnly */) return { result: "inviteOnly", club };
  const open = club.Joinability === 0 /* Open */;
  await setMembership(
    db,
    clubId,
    accountId,
    open ? 10 /* Member */ : 1 /* PendingRequested */
  );
  const count = await syncMemberCount(db, clubId);
  return { result: open ? "joined" : "requested", club: { ...club, MemberCount: count } };
}
async function leaveClub(db, clubId, accountId) {
  const club = await getClub(db, clubId);
  if (!club) return null;
  const current = await getMembership(db, clubId, accountId);
  if (current === 100 /* Creator */) return { result: "creator", club };
  await db.prepare(
    "DELETE FROM club_member WHERE club_id = ?1 AND account_id = ?2 AND membership_type <> ?3"
  ).bind(clubId, accountId, -1 /* Banned */).run();
  const count = await syncMemberCount(db, clubId);
  return { result: "left", club: { ...club, MemberCount: count } };
}
async function setMemberType(db, clubId, accountId, membershipType) {
  const club = await getClub(db, clubId);
  if (!club) return null;
  await setMembership(db, clubId, accountId, membershipType);
  const count = await syncMemberCount(db, clubId);
  return { ...club, MemberCount: count };
}
export {
  CLUB_SCHEMA_DDL,
  ClubJoinability,
  ClubMembershipType,
  ClubVisibility,
  MAX_ADDITIONAL_IMAGES,
  MOST_ACTIVE_CLUBHOUSE_LIMIT,
  clearHomeClub,
  countClubsByCreator,
  createClub,
  createClubAnnouncement,
  deleteClub,
  getClub,
  getClubAdditionalImages,
  getClubAnnouncements,
  getClubCustomTags,
  getClubDetails,
  getClubGallery,
  getClubMembers,
  getClubSummary,
  getClubsByCreator,
  getClubsByMember,
  getHomeClub,
  getMembership,
  getMostActiveClubhouses,
  isClubMember,
  joinClub,
  leaveClub,
  requestToJoinClub,
  searchClubs,
  setClubAdditionalImage,
  setHomeClub,
  setMemberType,
  updateClub
};
