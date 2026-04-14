import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseResetTime, calculateWaitMs } from '../src/time-parser.js';

describe('parseResetTime', () => {
  it('parses "resets 3pm (Europe/Dublin)"', () => {
    const r = parseResetTime('5-hour limit reached - resets 3pm (Europe/Dublin)');
    assert.equal(r.hour, 15); assert.equal(r.minute, 0);
    assert.equal(r.timezone, 'Europe/Dublin');
  });
  it('parses "resets at 2pm (America/New_York)"', () => {
    const r = parseResetTime('Usage limit. Resets at 2pm (America/New_York)');
    assert.equal(r.hour, 14); assert.equal(r.timezone, 'America/New_York');
  });
  it('parses "resets 15:30 (Asia/Kolkata)"', () => {
    const r = parseResetTime('resets 15:30 (Asia/Kolkata)');
    assert.equal(r.hour, 15); assert.equal(r.minute, 30);
  });
  it('parses 12pm as noon', () => {
    const r = parseResetTime('resets 12pm (UTC)');
    assert.equal(r.hour, 12);
  });
  it('parses 12am as midnight', () => {
    const r = parseResetTime('resets 12am (UTC)');
    assert.equal(r.hour, 0);
  });
  it('handles no timezone', () => {
    const r = parseResetTime('resets 3pm');
    assert.equal(r.hour, 15); assert.equal(r.timezone, null);
  });
  it('returns null for unparseable text', () => {
    assert.equal(parseResetTime('some random text'), null);
  });
  it('parses "try again in 5 minutes" as relative time', () => {
    const r = parseResetTime('try again in 5 minutes');
    assert.ok(r.relative);
    assert.equal(r.waitMs, 5 * 60_000);
  });
  it('parses "try again in 2 hours" as relative time', () => {
    const r = parseResetTime('try again in 2 hours');
    assert.ok(r.relative);
    assert.equal(r.waitMs, 2 * 3_600_000);
  });
  it('parses "wait 30 mins" as relative time', () => {
    const r = parseResetTime('wait 30 mins');
    assert.ok(r.relative);
    assert.equal(r.waitMs, 30 * 60_000);
  });
  it('parses "resets in: 3 hours" as relative time', () => {
    const r = parseResetTime('usage limit · resets in: 3 hours');
    assert.ok(r.relative);
    assert.equal(r.waitMs, 3 * 3_600_000);
  });
  it('parses "resets in 2 hours" as relative time', () => {
    const r = parseResetTime('resets in 2 hours');
    assert.ok(r.relative);
    assert.equal(r.waitMs, 2 * 3_600_000);
  });
});

describe('calculateWaitMs', () => {
  it('returns positive wait for future time', () => {
    const now = new Date();
    const futureHour = (now.getUTCHours() + 2) % 24;
    const wait = calculateWaitMs({ hour: futureHour, minute: 0, timezone: 'UTC' }, 60, 5, now);
    assert.ok(wait > 0);
    assert.ok(wait <= 3 * 3600_000);
  });
  it('adds margin seconds', () => {
    const now = new Date();
    const futureHour = (now.getUTCHours() + 1) % 24;
    const w0 = calculateWaitMs({ hour: futureHour, minute: 0, timezone: 'UTC' }, 0, 5, now);
    const w120 = calculateWaitMs({ hour: futureHour, minute: 0, timezone: 'UTC' }, 120, 5, now);
    assert.ok(w120 - w0 >= 119_000 && w120 - w0 <= 121_000);
  });
  it('returns fallback when parsed is null', () => {
    const wait = calculateWaitMs(null, 60, 5);
    assert.ok(Math.abs(wait - (5 * 3600 + 60) * 1000) < 2000);
  });
  it('handles ambiguous hour by picking soonest future', () => {
    const now = new Date('2026-03-18T13:00:00Z');
    const wait = calculateWaitMs(
      { hour: 3, minute: 0, timezone: 'UTC', ambiguous: true }, 0, 5, now
    );
    assert.ok(wait > 0 && wait <= 3 * 3600_000);
  });
  it('handles relative time correctly', () => {
    const wait = calculateWaitMs({ relative: true, waitMs: 300_000 }, 60, 5);
    assert.ok(Math.abs(wait - 360_000) < 2000); // 5 min + 60s margin
  });
  it('falls back on invalid timezone', () => {
    const wait = calculateWaitMs({ hour: 15, minute: 0, timezone: 'Invalid/Zone' }, 60, 5);
    assert.ok(Math.abs(wait - (5 * 3600 + 60) * 1000) < 2000); // fallback
  });
  it('computes ~2h wait for UTC+ timezone same-day reset, not ~26h', () => {
    // Simulate: "resets 10pm (Europe/Warsaw)" detected at 19:49 Warsaw time.
    // Europe/Warsaw = UTC+2 in April (CEST). 19:49 Warsaw = 17:49 UTC.
    // Target is 22:00 Warsaw = 20:00 UTC. Expected wait ≈ 2h 11m, not ~26h.
    const now = new Date('2026-04-14T17:49:16Z'); // 19:49:16 Warsaw
    const wait = calculateWaitMs(
      { hour: 22, minute: 0, timezone: 'Europe/Warsaw' }, 60, 5, now
    );
    const waitHours = wait / 3_600_000;
    assert.ok(waitHours > 1.5 && waitHours < 3,
      `Expected ~2h wait, got ${waitHours.toFixed(2)}h`);
  });
  it('waits until tomorrow if UTC+ same-day reset already passed', () => {
    // 22:30 Warsaw = 20:30 UTC. Target 10pm already passed → wait ~23.5h.
    const now = new Date('2026-04-14T20:30:00Z'); // 22:30 Warsaw
    const wait = calculateWaitMs(
      { hour: 22, minute: 0, timezone: 'Europe/Warsaw' }, 60, 5, now
    );
    const waitHours = wait / 3_600_000;
    assert.ok(waitHours > 22 && waitHours < 25,
      `Expected ~23.5h wait, got ${waitHours.toFixed(2)}h`);
  });
});
