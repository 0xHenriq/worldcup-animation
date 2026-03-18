import { COUNTDOWN_LABEL, OPENING_MATCH_TARGET_ISO } from "../../lib/hero/constants";

export const COUNTDOWN_COMPLETE_TEXT = "The World Cup has begun";

const COUNTDOWN_TARGET_TIMESTAMP = Date.parse(OPENING_MATCH_TARGET_ISO);
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function getCountdownRemainingMs(now = Date.now()): number {
  if (!Number.isFinite(COUNTDOWN_TARGET_TIMESTAMP)) {
    return 0;
  }

  return Math.max(0, COUNTDOWN_TARGET_TIMESTAMP - now);
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return COUNTDOWN_COMPLETE_TEXT;
  }

  const totalSeconds = Math.floor(Math.max(0, remainingMs) / 1000);

  if (totalSeconds <= 0) {
    return COUNTDOWN_COMPLETE_TEXT;
  }

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [
    `${String(days).padStart(2, "0")} days`,
    `${String(hours).padStart(2, "0")} hours`,
    `${String(minutes).padStart(2, "0")} min`,
    `${String(seconds).padStart(2, "0")} sec`,
  ].join(" ");
}

function getAccessibleCountdownBucket(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 0;
  }

  return Math.floor(remainingMs / MINUTE_MS);
}

export function formatAccessibleCountdownStatus(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return COUNTDOWN_COMPLETE_TEXT;
  }

  const accessibleBucket = getAccessibleCountdownBucket(remainingMs);

  if (accessibleBucket < 1) {
    return `${COUNTDOWN_LABEL}: less than 1 minute remaining`;
  }

  const totalMinutes = accessibleBucket;
  const days = Math.floor(totalMinutes / (DAY_MS / MINUTE_MS));
  const hours = Math.floor((totalMinutes % (DAY_MS / MINUTE_MS)) / (HOUR_MS / MINUTE_MS));
  const minutes = totalMinutes % (HOUR_MS / MINUTE_MS);

  return `${COUNTDOWN_LABEL}: ${days} days ${hours} hours ${minutes} minutes remaining`;
}
