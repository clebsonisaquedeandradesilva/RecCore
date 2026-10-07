// Ported from apps/notify/src/notification-payloads.ts; TypeScript types erased; native runtime imports.
var BalanceAddType = /* @__PURE__ */ ((BalanceAddType2) => {
  BalanceAddType2[BalanceAddType2["Invalid"] = 0] = "Invalid";
  BalanceAddType2[BalanceAddType2["DirectBalanceWithMultiplier"] = 1] = "DirectBalanceWithMultiplier";
  BalanceAddType2[BalanceAddType2["FromGiftBox"] = 2] = "FromGiftBox";
  BalanceAddType2[BalanceAddType2["NUXChallenge"] = 10] = "NUXChallenge";
  BalanceAddType2[BalanceAddType2["AllNUXChallenges"] = 11] = "AllNUXChallenges";
  BalanceAddType2[BalanceAddType2["DailyChallenge"] = 100] = "DailyChallenge";
  BalanceAddType2[BalanceAddType2["AllDailyChallenges"] = 101] = "AllDailyChallenges";
  BalanceAddType2[BalanceAddType2["FinishActivity"] = 200] = "FinishActivity";
  BalanceAddType2[BalanceAddType2["RecRoyaleMatchFinished"] = 250] = "RecRoyaleMatchFinished";
  BalanceAddType2[BalanceAddType2["ChecklistCredit"] = 303] = "ChecklistCredit";
  BalanceAddType2[BalanceAddType2["WonGame"] = 1e3] = "WonGame";
  BalanceAddType2[BalanceAddType2["LostGame"] = 1001] = "LostGame";
  BalanceAddType2[BalanceAddType2["WonGameRateLimited"] = 1002] = "WonGameRateLimited";
  BalanceAddType2[BalanceAddType2["WonGamePartial"] = 1003] = "WonGamePartial";
  BalanceAddType2[BalanceAddType2["LevelUp"] = 1100] = "LevelUp";
  BalanceAddType2[BalanceAddType2["Registered"] = 1200] = "Registered";
  BalanceAddType2[BalanceAddType2["CreatorReward"] = 1300] = "CreatorReward";
  BalanceAddType2[BalanceAddType2["CommercePurchase"] = 1400] = "CommercePurchase";
  BalanceAddType2[BalanceAddType2["CommercePurchaseRevoked"] = 1401] = "CommercePurchaseRevoked";
  BalanceAddType2[BalanceAddType2["ManualRefund"] = 2e3] = "ManualRefund";
  BalanceAddType2[BalanceAddType2["ManualThanks"] = 2010] = "ManualThanks";
  BalanceAddType2[BalanceAddType2["ManualApology"] = 2020] = "ManualApology";
  return BalanceAddType2;
})(BalanceAddType || {});
var BalancePlatform = /* @__PURE__ */ ((BalancePlatform2) => {
  BalancePlatform2[BalancePlatform2["NonPurchasedNotUsableInP2P"] = -2] = "NonPurchasedNotUsableInP2P";
  BalancePlatform2[BalancePlatform2["NonPurchasedDefault"] = -1] = "NonPurchasedDefault";
  BalancePlatform2[BalancePlatform2["SteamPurchased"] = 0] = "SteamPurchased";
  BalancePlatform2[BalancePlatform2["OculusPurchased"] = 1] = "OculusPurchased";
  BalancePlatform2[BalancePlatform2["PlayStationPurchased"] = 2] = "PlayStationPurchased";
  BalancePlatform2[BalancePlatform2["MicrosoftPurchased"] = 3] = "MicrosoftPurchased";
  BalancePlatform2[BalancePlatform2["RecNetPurchased"] = 4] = "RecNetPurchased";
  BalancePlatform2[BalancePlatform2["IOSPurchased"] = 5] = "IOSPurchased";
  BalancePlatform2[BalancePlatform2["GooglePlayPurchased"] = 6] = "GooglePlayPurchased";
  BalancePlatform2[BalancePlatform2["PicoPurchased"] = 8] = "PicoPurchased";
  BalancePlatform2[BalancePlatform2["PlayStationNonPurchasedP2P"] = 100] = "PlayStationNonPurchasedP2P";
  BalancePlatform2[BalancePlatform2["NonPlayStationNonPurchasedP2P"] = 101] = "NonPlayStationNonPurchasedP2P";
  BalancePlatform2[BalancePlatform2["NonPurchasedEarnedByP2P"] = 1e3] = "NonPurchasedEarnedByP2P";
  return BalancePlatform2;
})(BalancePlatform || {});
var CurrencyType = /* @__PURE__ */ ((CurrencyType2) => {
  CurrencyType2[CurrencyType2["Invalid"] = 0] = "Invalid";
  CurrencyType2[CurrencyType2["LaserTagTickets"] = 1] = "LaserTagTickets";
  CurrencyType2[CurrencyType2["RecCenterTokens"] = 2] = "RecCenterTokens";
  CurrencyType2[CurrencyType2["LostSkullsGold"] = 100] = "LostSkullsGold";
  CurrencyType2[CurrencyType2["DraculaSilver"] = 101] = "DraculaSilver";
  CurrencyType2[CurrencyType2["RecRoyaleSeason1"] = 200] = "RecRoyaleSeason1";
  CurrencyType2[CurrencyType2["RoomCurrency"] = 300] = "RoomCurrency";
  CurrencyType2[CurrencyType2["ProgressionEvent"] = 400] = "ProgressionEvent";
  return CurrencyType2;
})(CurrencyType || {});
var KickReportCategory = /* @__PURE__ */ ((KickReportCategory2) => {
  KickReportCategory2[KickReportCategory2["Moderator"] = -1] = "Moderator";
  KickReportCategory2[KickReportCategory2["Unknown"] = 0] = "Unknown";
  KickReportCategory2[KickReportCategory2["DeprecatedMicrophoneAbuse"] = 1] = "DeprecatedMicrophoneAbuse";
  KickReportCategory2[KickReportCategory2["Harassment"] = 2] = "Harassment";
  KickReportCategory2[KickReportCategory2["Cheating"] = 3] = "Cheating";
  KickReportCategory2[KickReportCategory2["DeprecatedImmatureBehavior"] = 4] = "DeprecatedImmatureBehavior";
  KickReportCategory2[KickReportCategory2["AFK"] = 5] = "AFK";
  KickReportCategory2[KickReportCategory2["Misc"] = 6] = "Misc";
  KickReportCategory2[KickReportCategory2["Underage"] = 7] = "Underage";
  KickReportCategory2[KickReportCategory2["VoteKick"] = 10] = "VoteKick";
  KickReportCategory2[KickReportCategory2["MisleadingPurchases"] = 11] = "MisleadingPurchases";
  KickReportCategory2[KickReportCategory2["CoCUnderage"] = 100] = "CoCUnderage";
  KickReportCategory2[KickReportCategory2["CoCSexual"] = 101] = "CoCSexual";
  KickReportCategory2[KickReportCategory2["CoCDiscrimination"] = 102] = "CoCDiscrimination";
  KickReportCategory2[KickReportCategory2["CoCTrolling"] = 103] = "CoCTrolling";
  KickReportCategory2[KickReportCategory2["CoCNameOrProfile"] = 104] = "CoCNameOrProfile";
  KickReportCategory2[KickReportCategory2["InappropriateClothing"] = 200] = "InappropriateClothing";
  KickReportCategory2[KickReportCategory2["IssuingInaccurateReports"] = 1e3] = "IssuingInaccurateReports";
  return KickReportCategory2;
})(KickReportCategory || {});
var LogoutReason = /* @__PURE__ */ ((LogoutReason2) => {
  LogoutReason2[LogoutReason2["Unknown"] = 0] = "Unknown";
  LogoutReason2[LogoutReason2["UserInitiated"] = 1] = "UserInitiated";
  LogoutReason2[LogoutReason2["SessionTakeover"] = 2] = "SessionTakeover";
  LogoutReason2[LogoutReason2["ForciblyLoggedOut"] = 3] = "ForciblyLoggedOut";
  LogoutReason2[LogoutReason2["Banned"] = 4] = "Banned";
  return LogoutReason2;
})(LogoutReason || {});
var GoToFailureError = /* @__PURE__ */ ((GoToFailureError2) => {
  GoToFailureError2[GoToFailureError2["UnknownError"] = -1] = "UnknownError";
  GoToFailureError2[GoToFailureError2["Success"] = 0] = "Success";
  GoToFailureError2[GoToFailureError2["NoSuchGame"] = 1] = "NoSuchGame";
  GoToFailureError2[GoToFailureError2["PlayerNotOnline"] = 2] = "PlayerNotOnline";
  GoToFailureError2[GoToFailureError2["InsufficientSpace"] = 3] = "InsufficientSpace";
  GoToFailureError2[GoToFailureError2["EventNotStarted"] = 4] = "EventNotStarted";
  GoToFailureError2[GoToFailureError2["EventAlreadyFinished"] = 5] = "EventAlreadyFinished";
  GoToFailureError2[GoToFailureError2["BlockedFromRoom"] = 7] = "BlockedFromRoom";
  GoToFailureError2[GoToFailureError2["JuniorNotAllowed"] = 11] = "JuniorNotAllowed";
  GoToFailureError2[GoToFailureError2["Banned"] = 12] = "Banned";
  GoToFailureError2[GoToFailureError2["AlreadyInBestInstance"] = 13] = "AlreadyInBestInstance";
  GoToFailureError2[GoToFailureError2["InsufficientRelationship"] = 14] = "InsufficientRelationship";
  GoToFailureError2[GoToFailureError2["UpdateRequired"] = 16] = "UpdateRequired";
  GoToFailureError2[GoToFailureError2["AlreadyInTargetInstance"] = 17] = "AlreadyInTargetInstance";
  GoToFailureError2[GoToFailureError2["UGCNotAllowed"] = 19] = "UGCNotAllowed";
  GoToFailureError2[GoToFailureError2["NoSuchRoom"] = 20] = "NoSuchRoom";
  GoToFailureError2[GoToFailureError2["RoomIsNotActive"] = 22] = "RoomIsNotActive";
  GoToFailureError2[GoToFailureError2["RoomBlockedByCreator"] = 23] = "RoomBlockedByCreator";
  GoToFailureError2[GoToFailureError2["RoomIsPrivate"] = 25] = "RoomIsPrivate";
  GoToFailureError2[GoToFailureError2["RoomInstanceIsPrivate"] = 26] = "RoomInstanceIsPrivate";
  GoToFailureError2[GoToFailureError2["DeviceClassNotSupported"] = 30] = "DeviceClassNotSupported";
  GoToFailureError2[GoToFailureError2["DeviceClassNotSupportedByRoomOwner"] = 31] = "DeviceClassNotSupportedByRoomOwner";
  GoToFailureError2[GoToFailureError2["MovementModeNotSupportedByRoomOwner"] = 32] = "MovementModeNotSupportedByRoomOwner";
  GoToFailureError2[GoToFailureError2["EventIsPrivate"] = 35] = "EventIsPrivate";
  GoToFailureError2[GoToFailureError2["EventIsFull"] = 36] = "EventIsFull";
  GoToFailureError2[GoToFailureError2["RoomInviteExpired"] = 40] = "RoomInviteExpired";
  GoToFailureError2[GoToFailureError2["NoAvailableRegion"] = 45] = "NoAvailableRegion";
  return GoToFailureError2;
})(GoToFailureError || {});
export {
  BalanceAddType,
  BalancePlatform,
  CurrencyType,
  GoToFailureError,
  KickReportCategory,
  LogoutReason
};
