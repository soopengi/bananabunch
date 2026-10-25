import { visible } from "./rules.ts";
export function initializeRewards(data: any) {
  if (data.rewardNotificationsInitialized) return;
  for (const row of data.ledger) row.rewardAcknowledged = true;
  data.rewardNotificationsInitialized = true;
}
export function pendingRewards(data: any, user: string) {
  return visible(data, user)
    .ledger.filter(
      (l: any) => l.user === user && l.points > 0 && !l.rewardAcknowledged,
    )
    .map((l: any) => ({
      key: l.key,
      notificationId: l.key + ":" + l.at,
      points: l.points,
      reason: l.reason,
    }));
}
export function acknowledgeReward(data: any, user: string, key: string) {
  if (!pendingRewards(data, user).some((r: any) => r.key === key))
    throw Error("Reward not found.");
  data.ledger.find(
    (l: any) => l.key === key && l.user === user,
  ).rewardAcknowledged = true;
}
