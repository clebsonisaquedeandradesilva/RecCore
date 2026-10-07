// Ported from packages/domain/src/enums.ts; TypeScript types erased; native runtime imports.
const PlatformType = {
  All: -1,
  Steam: 0,
  Oculus: 1,
  PlayStation: 2,
  Xbox: 3,
  RecNet: 4,
  IOS: 5,
  GooglePlay: 6,
  Standalone: 7,
  Pico: 8,
  Discord: 101
};
var RoomInstanceType = /* @__PURE__ */ ((RoomInstanceType2) => {
  RoomInstanceType2[RoomInstanceType2["Public"] = 0] = "Public";
  RoomInstanceType2[RoomInstanceType2["Private"] = 1] = "Private";
  RoomInstanceType2[RoomInstanceType2["Dormroom"] = 2] = "Dormroom";
  RoomInstanceType2[RoomInstanceType2["Event"] = 3] = "Event";
  RoomInstanceType2[RoomInstanceType2["Meetup"] = 4] = "Meetup";
  RoomInstanceType2[RoomInstanceType2["Clubhouse"] = 5] = "Clubhouse";
  return RoomInstanceType2;
})(RoomInstanceType || {});
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["GameInvite"] = 0] = "GameInvite";
  MessageType2[MessageType2["GameInviteDeclined"] = 1] = "GameInviteDeclined";
  MessageType2[MessageType2["GameJoinFailed"] = 2] = "GameJoinFailed";
  MessageType2[MessageType2["PartyActivitySwitch"] = 3] = "PartyActivitySwitch";
  MessageType2[MessageType2["FriendInvite"] = 4] = "FriendInvite";
  MessageType2[MessageType2["VoteToKick"] = 5] = "VoteToKick";
  MessageType2[MessageType2["GameInviteV2"] = 6] = "GameInviteV2";
  MessageType2[MessageType2["PartyActivitySwitchV2"] = 7] = "PartyActivitySwitchV2";
  MessageType2[MessageType2["RequestGameInvite"] = 10] = "RequestGameInvite";
  MessageType2[MessageType2["RequestGameInviteDeclined"] = 11] = "RequestGameInviteDeclined";
  MessageType2[MessageType2["FriendStatusOnline"] = 20] = "FriendStatusOnline";
  MessageType2[MessageType2["TextMessage"] = 30] = "TextMessage";
  MessageType2[MessageType2["FriendRequestAccepted"] = 40] = "FriendRequestAccepted";
  MessageType2[MessageType2["PlayerCheer"] = 50] = "PlayerCheer";
  MessageType2[MessageType2["PlayerCheerAnonymous"] = 51] = "PlayerCheerAnonymous";
  MessageType2[MessageType2["RoomCoOwnerAdded"] = 60] = "RoomCoOwnerAdded";
  MessageType2[MessageType2["RoomCoOwnerRemoved"] = 61] = "RoomCoOwnerRemoved";
  MessageType2[MessageType2["RoomCoOwnerInvited"] = 62] = "RoomCoOwnerInvited";
  MessageType2[MessageType2["CreatorPublishedNewRoom"] = 70] = "CreatorPublishedNewRoom";
  MessageType2[MessageType2["PlayerAttendingEvent"] = 80] = "PlayerAttendingEvent";
  MessageType2[MessageType2["PlayerEventInvitation"] = 81] = "PlayerEventInvitation";
  MessageType2[MessageType2["DeprecatedGroupInvitation"] = 90] = "DeprecatedGroupInvitation";
  MessageType2[MessageType2["DeprecatedPlayerJoinedGroup"] = 91] = "DeprecatedPlayerJoinedGroup";
  MessageType2[MessageType2["CoachMessage"] = 100] = "CoachMessage";
  MessageType2[MessageType2["NewRoomComments"] = 110] = "NewRoomComments";
  MessageType2[MessageType2["PartyUpRequest"] = 120] = "PartyUpRequest";
  MessageType2[MessageType2["FriendIntroduction"] = 130] = "FriendIntroduction";
  MessageType2[MessageType2["ClubMemberInvited"] = 200] = "ClubMemberInvited";
  MessageType2[MessageType2["ClubModeratorInvited"] = 201] = "ClubModeratorInvited";
  MessageType2[MessageType2["ClubCoownerInvited"] = 202] = "ClubCoownerInvited";
  MessageType2[MessageType2["VirtualClubAnnouncementRoomPublished"] = 1e5] = "VirtualClubAnnouncementRoomPublished";
  MessageType2[MessageType2["VirtualClubAnnouncementInventionPublished"] = 100001] = "VirtualClubAnnouncementInventionPublished";
  MessageType2[MessageType2["VirtualClubAnnouncementGeneric"] = 100002] = "VirtualClubAnnouncementGeneric";
  MessageType2[MessageType2["VirtualClubAnnouncementPlayerEventPublished"] = 100003] = "VirtualClubAnnouncementPlayerEventPublished";
  MessageType2[MessageType2["VirtualClubAnnouncementClub"] = 100004] = "VirtualClubAnnouncementClub";
  MessageType2[MessageType2["VirtualClubAnnouncementPlayer"] = 100005] = "VirtualClubAnnouncementPlayer";
  MessageType2[MessageType2["VirtualClubAnnouncementCode"] = 100006] = "VirtualClubAnnouncementCode";
  MessageType2[MessageType2["VirtualClubAnnouncementPhoto"] = 100007] = "VirtualClubAnnouncementPhoto";
  MessageType2[MessageType2["VirtualRoomNotification"] = 100008] = "VirtualRoomNotification";
  return MessageType2;
})(MessageType || {});
var InviteMode = /* @__PURE__ */ ((InviteMode2) => {
  InviteMode2[InviteMode2["None"] = 0] = "None";
  InviteMode2[InviteMode2["LeaveParty"] = 1] = "LeaveParty";
  InviteMode2[InviteMode2["InviteParty"] = 2] = "InviteParty";
  InviteMode2[InviteMode2["PartyAutoFollow"] = 3] = "PartyAutoFollow";
  InviteMode2[InviteMode2["EveryoneAutoFollow"] = 4] = "EveryoneAutoFollow";
  InviteMode2[InviteMode2["InviteOnlineFriends"] = 20] = "InviteOnlineFriends";
  InviteMode2[InviteMode2["FullInstanceReinvite"] = 21] = "FullInstanceReinvite";
  InviteMode2[InviteMode2["PlayTogether"] = 22] = "PlayTogether";
  return InviteMode2;
})(InviteMode || {});
var Accessibility = /* @__PURE__ */ ((Accessibility2) => {
  Accessibility2[Accessibility2["Private"] = 0] = "Private";
  Accessibility2[Accessibility2["Public"] = 1] = "Public";
  Accessibility2[Accessibility2["Unlisted"] = 2] = "Unlisted";
  Accessibility2[Accessibility2["Dev_only"] = 3] = "Dev_only";
  Accessibility2[Accessibility2["Dev_Unlisted"] = 4] = "Dev_Unlisted";
  return Accessibility2;
})(Accessibility || {});
var MatchmakingErrorCode = /* @__PURE__ */ ((MatchmakingErrorCode2) => {
  MatchmakingErrorCode2[MatchmakingErrorCode2["UnknownError"] = -1] = "UnknownError";
  MatchmakingErrorCode2[MatchmakingErrorCode2["Success"] = 0] = "Success";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NoSuchGame"] = 1] = "NoSuchGame";
  MatchmakingErrorCode2[MatchmakingErrorCode2["PlayerNotOnline"] = 2] = "PlayerNotOnline";
  MatchmakingErrorCode2[MatchmakingErrorCode2["InsufficientSpace"] = 3] = "InsufficientSpace";
  MatchmakingErrorCode2[MatchmakingErrorCode2["EventNotStarted"] = 4] = "EventNotStarted";
  MatchmakingErrorCode2[MatchmakingErrorCode2["EventAlreadyFinished"] = 5] = "EventAlreadyFinished";
  MatchmakingErrorCode2[MatchmakingErrorCode2["BlockedFromRoom"] = 7] = "BlockedFromRoom";
  MatchmakingErrorCode2[MatchmakingErrorCode2["JuniorNotAllowed"] = 11] = "JuniorNotAllowed";
  MatchmakingErrorCode2[MatchmakingErrorCode2["Banned"] = 12] = "Banned";
  MatchmakingErrorCode2[MatchmakingErrorCode2["AlreadyInBestInstance"] = 13] = "AlreadyInBestInstance";
  MatchmakingErrorCode2[MatchmakingErrorCode2["InsufficientRelationship"] = 14] = "InsufficientRelationship";
  MatchmakingErrorCode2[MatchmakingErrorCode2["UpdateRequired"] = 16] = "UpdateRequired";
  MatchmakingErrorCode2[MatchmakingErrorCode2["AlreadyInTargetInstance"] = 17] = "AlreadyInTargetInstance";
  MatchmakingErrorCode2[MatchmakingErrorCode2["UGCNotAllowed"] = 19] = "UGCNotAllowed";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NoSuchRoom"] = 20] = "NoSuchRoom";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RoomIsNotActive"] = 22] = "RoomIsNotActive";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RoomBlockedByCreator"] = 23] = "RoomBlockedByCreator";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RoomIsPrivate"] = 25] = "RoomIsPrivate";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RoomInstanceIsPrivate"] = 26] = "RoomInstanceIsPrivate";
  MatchmakingErrorCode2[MatchmakingErrorCode2["DeviceClassNotSupported"] = 30] = "DeviceClassNotSupported";
  MatchmakingErrorCode2[MatchmakingErrorCode2["DeviceClassNotSupportedByRoomOwner"] = 31] = "DeviceClassNotSupportedByRoomOwner";
  MatchmakingErrorCode2[MatchmakingErrorCode2["MovementModeNotSupportedByRoomOwner"] = 32] = "MovementModeNotSupportedByRoomOwner";
  MatchmakingErrorCode2[MatchmakingErrorCode2["EventIsPrivate"] = 35] = "EventIsPrivate";
  MatchmakingErrorCode2[MatchmakingErrorCode2["EventIsFull"] = 36] = "EventIsFull";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RoomInviteExpired"] = 40] = "RoomInviteExpired";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NoAvailableRegion"] = 45] = "NoAvailableRegion";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NotorietyTooPoor"] = 50] = "NotorietyTooPoor";
  MatchmakingErrorCode2[MatchmakingErrorCode2["BannedFromRoom"] = 55] = "BannedFromRoom";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NoSuchClub"] = 70] = "NoSuchClub";
  MatchmakingErrorCode2[MatchmakingErrorCode2["ClubHasNoClubhouse"] = 71] = "ClubHasNoClubhouse";
  MatchmakingErrorCode2[MatchmakingErrorCode2["ClubIsNotActive"] = 73] = "ClubIsNotActive";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NotAMemberOfClub"] = 74] = "NotAMemberOfClub";
  MatchmakingErrorCode2[MatchmakingErrorCode2["BannedFromClub"] = 75] = "BannedFromClub";
  MatchmakingErrorCode2[MatchmakingErrorCode2["InstanceJoinNotPermitted"] = 76] = "InstanceJoinNotPermitted";
  MatchmakingErrorCode2[MatchmakingErrorCode2["LevelTooLow"] = 77] = "LevelTooLow";
  MatchmakingErrorCode2[MatchmakingErrorCode2["ChatPartyInviteNotFound"] = 78] = "ChatPartyInviteNotFound";
  MatchmakingErrorCode2[MatchmakingErrorCode2["ChatPartyInviteModerated"] = 79] = "ChatPartyInviteModerated";
  MatchmakingErrorCode2[MatchmakingErrorCode2["ChatMessageNotAnInvite"] = 80] = "ChatMessageNotAnInvite";
  MatchmakingErrorCode2[MatchmakingErrorCode2["DeveloperOnly"] = 81] = "DeveloperOnly";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RRPlusRequired"] = 82] = "RRPlusRequired";
  MatchmakingErrorCode2[MatchmakingErrorCode2["MetaJuniorAccountRestriction"] = 83] = "MetaJuniorAccountRestriction";
  MatchmakingErrorCode2[MatchmakingErrorCode2["NotExclusivelyLoggedIn"] = 84] = "NotExclusivelyLoggedIn";
  MatchmakingErrorCode2[MatchmakingErrorCode2["AccountDoesNotExist"] = 85] = "AccountDoesNotExist";
  MatchmakingErrorCode2[MatchmakingErrorCode2["RoomInstanceBlockedByMatchmakingPolicy"] = 86] = "RoomInstanceBlockedByMatchmakingPolicy";
  return MatchmakingErrorCode2;
})(MatchmakingErrorCode || {});
var Role = /* @__PURE__ */ ((Role2) => {
  Role2[Role2["None"] = 0] = "None";
  Role2[Role2["Host"] = 10] = "Host";
  Role2[Role2["Moderator"] = 20] = "Moderator";
  Role2[Role2["CoOwner"] = 30] = "CoOwner";
  Role2[Role2["Creator"] = 255] = "Creator";
  return Role2;
})(Role || {});
export {
  Accessibility,
  InviteMode,
  MatchmakingErrorCode,
  MessageType,
  PlatformType,
  Role,
  RoomInstanceType
};
