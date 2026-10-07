// Ported from apps/econ/src/balance-db.ts; TypeScript types erased; native runtime imports.
import { BalancePlatform } from "../../notify/src/notification-payloads.js";
const CurrencyType = {
  Invalid: 0,
  LaserTagTickets: 1,
  RecCenterTokens: 2,
  LostSkullsGold: 100,
  DraculaSilver: 101,
  RecRoyaleSeason1: 200,
  RoomCurrency: 300,
  RoomInventoryItem: 301,
  ProgressionEvent: 400
};
const SPENDABLE = [
  CurrencyType.LaserTagTickets,
  CurrencyType.RecCenterTokens,
  CurrencyType.LostSkullsGold,
  CurrencyType.DraculaSilver,
  CurrencyType.RecRoyaleSeason1
];
const isSpendable = (currencyType) => SPENDABLE.includes(currencyType);
const DEFAULT_STARTING_TOKENS = 1e4;
function startingBalances(startingTokens) {
  return [{ currencyType: CurrencyType.RecCenterTokens, amount: startingTokens }];
}
const ALL_PLATFORMS = BalancePlatform.NonPurchasedNotUsableInP2P;
const BALANCE_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS balance (
		account_id INTEGER NOT NULL,
		currency_type INTEGER NOT NULL,
		amount INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (account_id, currency_type)
	)`
];
async function ensureStartingBalances(db, accountId, startingTokens) {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO balance (account_id, currency_type, amount) VALUES (?1, ?2, ?3)"
  );
  await db.batch(
    startingBalances(startingTokens).map((b) => stmt.bind(accountId, b.currencyType, b.amount))
  );
}
async function getBalances(db, accountId, startingTokens) {
  await ensureStartingBalances(db, accountId, startingTokens);
  const { results } = await db.prepare(
    "SELECT currency_type, amount FROM balance WHERE account_id = ?1 ORDER BY currency_type"
  ).bind(accountId).all();
  return results.map((r) => ({ currencyType: r.currency_type, amount: r.amount }));
}
async function getBalance(db, accountId, currencyType, startingTokens) {
  await ensureStartingBalances(db, accountId, startingTokens);
  const row = await db.prepare("SELECT amount FROM balance WHERE account_id = ?1 AND currency_type = ?2").bind(accountId, currencyType).first();
  return row?.amount ?? 0;
}
async function creditCurrency(db, accountId, currencyType, amount, startingTokens) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`creditCurrency: amount must be a positive integer, got ${amount}`);
  }
  await db.prepare(
    `INSERT INTO balance (account_id, currency_type, amount) VALUES (?1, ?2, ?3)
			 ON CONFLICT (account_id, currency_type) DO UPDATE SET amount = amount + ?3`
  ).bind(accountId, currencyType, amount).run();
  return getBalance(db, accountId, currencyType, startingTokens);
}
async function spendCurrency(db, accountId, currencyType, amount, startingTokens) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`spendCurrency: amount must be a positive integer, got ${amount}`);
  }
  await ensureStartingBalances(db, accountId, startingTokens);
  const { meta } = await db.prepare(
    `UPDATE balance SET amount = amount - ?3
			 WHERE account_id = ?1 AND currency_type = ?2 AND amount >= ?3`
  ).bind(accountId, currencyType, amount).run();
  return meta.changes > 0;
}
export {
  ALL_PLATFORMS,
  BALANCE_SCHEMA_DDL,
  CurrencyType,
  DEFAULT_STARTING_TOKENS,
  creditCurrency,
  ensureStartingBalances,
  getBalance,
  getBalances,
  isSpendable,
  spendCurrency,
  startingBalances
};
