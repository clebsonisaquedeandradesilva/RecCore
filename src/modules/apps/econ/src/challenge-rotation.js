// Ported from apps/econ/src/challenge-rotation.ts; TypeScript types erased; native runtime imports.
import weeklyChallenge from "../static/weekly-challenge.json.js";
const ROTATION_EPOCH_MS = Date.UTC(2020, 0, 1, 21, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1e3;
const CHALLENGE_MAP_ID_BASE = 1e3;
const CHALLENGES_PER_ROTATION = 5;
const MAX_PER_KIND = 2;
const EVENT_GAME_END = 2;
const EVENT_ELIMINATED_AI = 5;
const GAMES_TARGET = 5;
const AI_TARGET = 10;
const CHALLENGE_ROOMS = [
  // Quests — win the quest, or thin out its enemies.
  {
    key: "GoldenTrophy",
    name: "Quest for the Golden Trophy",
    link: "^GoldenTrophy",
    scenes: ["91e16e35-f48f-4700-ab8a-a1b79e50e51b"],
    kinds: ["win", "ai"],
    quest: true
  },
  {
    key: "Jumbotron",
    name: "The Rise of Jumbotron",
    link: "^TheRiseofJumbotron",
    scenes: ["acc06e66-c2d0-4361-b0cd-46246a4c455c"],
    kinds: ["win", "ai"],
    quest: true
  },
  {
    key: "CrimsonCauldron",
    name: "Curse of the Crimson Cauldron",
    link: "^CrimsonCauldron",
    scenes: ["949fa41f-4347-45c0-b7ac-489129174045"],
    kinds: ["win", "ai"],
    quest: true
  },
  {
    key: "IsleOfLostSkulls",
    name: "The Isle of Lost Skulls",
    link: "^IsleOfLostSkulls",
    scenes: ["7e01cfe0-820a-406f-b1b3-0a5bf575235c"],
    kinds: ["win", "ai"],
    quest: true
  },
  {
    key: "Crescendo",
    name: "Crescendo of the Blood Moon",
    link: "^Crescendo",
    scenes: ["49cb8993-a956-43e2-86f4-1318f279b22a"],
    kinds: ["win", "ai"],
    quest: true
  },
  // Head-to-head rooms — finish games, or win one.
  {
    key: "Clearcut",
    name: "Paintball: Clear Cut",
    link: "^Paintball.Clearcut",
    scenes: ["380d18b5-de9c-49f3-80f7-f4a95c1de161"],
    kinds: ["games", "win"],
    shares: "PaintballVR/Clearcut, Clearcut/Home"
  },
  {
    key: "River",
    name: "Paintball: River",
    link: "^Paintball.River",
    scenes: ["e122fe98-e7db-49e8-a1b1-105424b6e1f0"],
    kinds: ["games", "win"],
    shares: "PaintballVR/River, River/Home"
  },
  {
    key: "Homestead",
    name: "Paintball: Homestead",
    link: "^Paintball.Homestead",
    scenes: ["a785267d-c579-42ea-be43-fec1992d1ca7"],
    kinds: ["games", "win"],
    shares: "PaintballVR/Homestead, Homestead/Home"
  },
  {
    key: "Quarry",
    name: "Paintball: Quarry",
    link: "^Paintball.Quarry",
    scenes: ["ff4c6427-7079-4f59-b22a-69b089420827"],
    kinds: ["games", "win"],
    shares: "PaintballVR/Quarry, Quarry/Home"
  },
  {
    key: "Spillway",
    name: "Paintball: Spillway",
    link: "^Paintball.Spillway",
    scenes: ["58763055-2dfb-4814-80b8-16fac5c85709"],
    kinds: ["games", "win"],
    shares: "PaintballVR/Spillway, Spillway/Home"
  },
  {
    key: "Dodgeball",
    name: "Dodgeball",
    link: "^Dodgeball",
    scenes: ["3d474b26-26f7-45e9-9a36-9b02847d5e6f"],
    kinds: ["games", "win"],
    shares: "Gym/Home, DodgeballVR/Home"
  },
  {
    key: "Soccer",
    name: "Soccer",
    link: "^Soccer",
    scenes: ["6d5eea4b-f069-4ed0-9916-0e2f07df0d03"],
    kinds: ["games", "win"],
    shares: "Stadium/Home"
  },
  {
    key: "Hangar",
    name: "Laser Tag: Hangar",
    link: "^LaserTag.Hangar",
    scenes: ["239e676c-f12f-489f-bf3a-d4c383d692c3"],
    kinds: ["games", "win"],
    shares: "Hangar/Home"
  },
  {
    key: "CyberJunkCity",
    name: "Laser Tag: CyberJunk City",
    link: "^LaserTag.CyberJunkCity",
    scenes: ["9d6456ce-6264-48b4-808d-2d96b3d91038"],
    kinds: ["games", "win"],
    shares: "LaserTagCyberJunk/Home, CyberJunkCity/Home"
  },
  {
    key: "Paddleball",
    name: "Paddleball",
    link: "^Paddleball",
    scenes: ["d89f74fa-d51e-477a-a425-025a891dd499"],
    kinds: ["games", "win"]
  },
  {
    key: "FrontierSolos",
    name: "Rec Royale: Solos",
    link: "^RecRoyaleSolos",
    scenes: ["b010171f-4875-4e89-baba-61e878cd41e1"],
    kinds: ["games", "win"]
  },
  {
    key: "FrontierSquads",
    name: "Rec Royale: Squads",
    link: "^RecRoyaleSquads",
    scenes: ["253fa009-6e65-4c90-91a1-7137a56a267f"],
    kinds: ["games", "win"]
  },
  // Rooms where finishing is the whole ask — "winning" one of these isn't a thing the
  // `won` variable is known to report.
  {
    key: "Bowling",
    name: "Bowling",
    link: "^Bowling",
    scenes: ["ae929543-9a07-41d5-8ee9-dbbee8c36800"],
    kinds: ["games"],
    shares: "BowlingAlley/Home"
  },
  {
    key: "DiscGolfLake",
    name: "Disc Golf: Lake",
    link: "^DiscGolfLake",
    scenes: ["f6f7256c-e438-4299-b99e-d20bef8cf7e0"],
    kinds: ["games"],
    shares: "Lake/Home"
  },
  {
    key: "DiscGolfPropulsion",
    name: "Disc Golf: Propulsion",
    link: "^DiscGolfPropulsion",
    scenes: ["d9378c9f-80bc-46fb-ad1e-1bed8a674f55"],
    kinds: ["games"],
    shares: "PropulsionTestRange/Home"
  },
  {
    key: "Charades",
    name: "Charades",
    link: null,
    // Both charades scenes, as the captured rotation's own charades challenge does.
    scenes: ["a673712c-877f-4749-b69a-4a4c6310d545", "4078dfed-24bb-4db7-863f-578ba48d726b"],
    kinds: ["games"],
    shares: "3DCharades/InkSpaceHome, Legacy3DCharades/Home"
  },
  {
    key: "StuntRunner",
    name: "Stunt Runner",
    link: "^StuntRunner",
    scenes: ["b7281665-a715-4051-826b-8e08e69c6172"],
    kinds: ["games"]
  }
];
function pinnedRotation() {
  return weeklyChallenge.Challenges.length > 0 ? weeklyChallenge : null;
}
function rotationIndex(now) {
  return Math.floor((now.getTime() - ROTATION_EPOCH_MS) / WEEK_MS);
}
function rotationMapId(now) {
  return pinnedRotation()?.ChallengeMapId ?? CHALLENGE_MAP_ID_BASE + rotationIndex(now);
}
function rotationWindow(index) {
  const start = ROTATION_EPOCH_MS + index * WEEK_MS;
  return {
    StartAt: toLocalIsoString(new Date(start)),
    EndAt: toLocalIsoString(new Date(start + WEEK_MS))
  };
}
function toLocalIsoString(at) {
  return at.toISOString().slice(0, 19);
}
function toDotNetString(at) {
  return `${at.toISOString().slice(0, -1)}0000Z`;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seedFor(mapId, salt) {
  return Math.imul(mapId ^ salt, 2654435761) >>> 0;
}
function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    out[i] = b;
    out[j] = a;
  }
  return out;
}
function sceneNode(scenes) {
  return { ct: 7, vs: scenes.map((l) => ({ l })) };
}
function configFor(kind, room) {
  const scene = sceneNode(room.scenes);
  switch (kind) {
    case "games":
      return {
        ct: 1,
        ipc: false,
        ctc: [{ ct: 0, ipc: false, wc: [{ ct: 6, vs: [EVENT_GAME_END] }, scene] }],
        t: GAMES_TARGET
      };
    case "win":
      return {
        ct: 0,
        ipc: false,
        wc: [{ ct: 6, vs: [EVENT_GAME_END] }, { ct: 9, vs: [true], v: "won" }, scene]
      };
    case "ai":
      return {
        ct: 1,
        ipc: false,
        ctc: [{ ct: 0, ipc: false, wc: [{ ct: 6, vs: [EVENT_ELIMINATED_AI] }, scene] }],
        t: AI_TARGET
      };
  }
}
function copyFor(kind, room) {
  const where = room.link ?? room.name;
  switch (kind) {
    case "games":
      return {
        Description: `Complete ${GAMES_TARGET} games in ${where}`,
        Tooltip: `Play ${GAMES_TARGET} games of ${room.name} through to the end. Winning is optional.`
      };
    case "win":
      return room.quest === true ? {
        Description: `Complete the ${where} quest`,
        Tooltip: `See ${room.name} through to a win.`
      } : {
        Description: `Win a game in ${where}`,
        Tooltip: `Come out on top of a game of ${room.name}.`
      };
    case "ai":
      return {
        Description: `Defeat ${AI_TARGET} enemies in ${where}`,
        Tooltip: `Take out ${AI_TARGET} enemies in ${room.name}. They don't have to be in one run.`
      };
  }
}
function nameFor(kind, room) {
  switch (kind) {
    case "games":
      return `Complete${GAMES_TARGET}Games${room.key}`;
    case "win":
      return `Win${room.key}`;
    case "ai":
      return `Defeat${AI_TARGET}AI${room.key}`;
  }
}
const CANDIDATES = CHALLENGE_ROOMS.flatMap(
  (room) => room.kinds.map((kind) => ({ challengeId: 0, kind, room }))
).map((candidate, index) => ({ ...candidate, challengeId: index + 1 }));
function pickChallenges(random) {
  const shuffled = shuffle(CANDIDATES, random);
  const picked = [];
  const rooms = /* @__PURE__ */ new Set();
  const kinds = /* @__PURE__ */ new Map();
  for (const pass of [0, 1]) {
    for (const candidate of shuffled) {
      if (picked.length === CHALLENGES_PER_ROTATION) break;
      if (rooms.has(candidate.room.key)) continue;
      if (pass === 0 && (kinds.get(candidate.kind) ?? 0) >= MAX_PER_KIND) continue;
      picked.push(candidate);
      rooms.add(candidate.room.key);
      kinds.set(candidate.kind, (kinds.get(candidate.kind) ?? 0) + 1);
    }
  }
  return picked.map(({ challengeId, kind, room }) => ({
    ChallengeId: challengeId,
    Name: nameFor(kind, room),
    Config: JSON.stringify(configFor(kind, room)),
    ...copyFor(kind, room),
    Complete: false
  }));
}
function pickWeeklyGift(mapId, pool) {
  if (pool.length === 0) return null;
  const random = mulberry32(seedFor(mapId, 2654435769));
  const gift = pool[Math.floor(random() * pool.length)];
  return {
    friendlyName: gift.FriendlyName,
    gift: {
      GiftDropId: gift.GiftDropId,
      AvatarItemDesc: "",
      AvatarItemType: 0,
      ConsumableItemDesc: "",
      EquipmentPrefabName: gift.EquipmentPrefabName,
      EquipmentModificationGuid: gift.EquipmentModificationGuid,
      StorefrontType: 0,
      Xp: 0,
      Level: 0,
      GiftContext: 0,
      GiftRarity: gift.Rarity
    }
  };
}
let cached = null;
function buildRotation(now) {
  const pinned = pinnedRotation();
  if (pinned !== null) return pinned;
  const index = rotationIndex(now);
  const mapId = CHALLENGE_MAP_ID_BASE + index;
  if (cached === null || cached.ChallengeMapId !== mapId) {
    cached = {
      ChallengeMapId: mapId,
      CompletedRequired: weeklyChallenge.CompletedRequired,
      ...rotationWindow(index),
      ServerTime: "",
      Challenges: pickChallenges(mulberry32(seedFor(mapId, 0))),
      Gift: weeklyChallenge.Gift,
      FallbackGiftName: weeklyChallenge.FallbackGiftName,
      ChallengeThemeString: weeklyChallenge.ChallengeThemeString
    };
  }
  return { ...cached, ServerTime: toDotNetString(now) };
}
function withWeeklyGift(rotation, pool) {
  if (pinnedRotation() !== null) return rotation;
  const picked = pickWeeklyGift(rotation.ChallengeMapId, pool);
  if (picked === null) return rotation;
  return { ...rotation, Gift: picked.gift, ChallengeThemeString: picked.friendlyName };
}
export {
  buildRotation,
  rotationIndex,
  rotationMapId,
  withWeeklyGift
};
