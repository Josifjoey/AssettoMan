import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePacket,
  buildRealtimeInterval, buildGetCarInfo, buildGetSessionInfo,
  buildBroadcastChat, buildSendChat, buildKick, buildNextSession,
  buildRestartSession, buildAdminCommand,
} from '../src/acPlugin.js';

function str8(s) {
  const b = Buffer.from(s, 'latin1');
  return Buffer.concat([Buffer.from([b.length]), b]);
}
function str32(s) {
  const chars = [...s];
  const b = Buffer.alloc(1 + chars.length * 4);
  b.writeUInt8(chars.length, 0);
  chars.forEach((ch, i) => b.writeUInt32LE(ch.codePointAt(0), 1 + i * 4));
  return b;
}
function f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; }

test('builders produce expected opcodes', () => {
  assert.deepEqual([...buildRealtimeInterval(250)], [200, 250, 0]);
  assert.deepEqual([...buildGetCarInfo(7)], [201, 7]);
  assert.deepEqual([...buildGetSessionInfo(-1)], [204, 0xff, 0xff]);
  assert.deepEqual([...buildKick(3)], [206, 3]);
  assert.deepEqual([...buildNextSession()], [207]);
  assert.deepEqual([...buildRestartSession()], [208]);
  assert.equal(buildBroadcastChat('hi')[0], 203);
  assert.equal(buildSendChat(2, 'yo')[1], 2);
  assert.equal(buildAdminCommand('/help')[0], 209);
});

test('str32 round-trips through BROADCAST_CHAT builder', () => {
  const msg = 'Héllo';
  const b = buildBroadcastChat(msg);
  assert.equal(b[0], 203);
  assert.equal(b[1], msg.length);
  let out = '';
  for (let i = 0; i < msg.length; i++) out += String.fromCodePoint(b.readUInt32LE(2 + i * 4));
  assert.equal(out, msg);
});

test('CAR_UPDATE parses', () => {
  const buf = Buffer.concat([
    Buffer.from([53, 5]),
    f32(1.5), f32(2.5), f32(3.5),   // pos
    f32(10), f32(0), f32(-20),      // vel
    Buffer.from([4]),               // gear
    (() => { const b = Buffer.alloc(2); b.writeUInt16LE(7500); return b; })(),
    f32(0.42),
  ]);
  const p = parsePacket(buf);
  assert.equal(p.type, 'car_update');
  assert.equal(p.carId, 5);
  assert.equal(p.gear, 4);
  assert.equal(p.engineRpm, 7500);
  assert.ok(Math.abs(p.pos.z - 3.5) < 1e-6);
  assert.ok(Math.abs(p.normalizedSplinePos - 0.42) < 1e-6);
});

test('LAP_COMPLETED parses with leaderboard', () => {
  const lb = Buffer.concat([Buffer.from([2]), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(60000); return b; })(), (() => { const b = Buffer.alloc(2); b.writeUInt16LE(3); return b; })(), Buffer.from([1])]);
  const head = Buffer.alloc(7);
  head.writeUInt8(73, 0); head.writeUInt8(2, 1); head.writeUInt32LE(61234, 2); head.writeUInt8(0, 6);
  const buf = Buffer.concat([head.slice(0, 6), Buffer.from([0, 1]), lb, f32(0.97)]);
  const p = parsePacket(buf);
  assert.equal(p.type, 'lap_completed');
  assert.equal(p.carId, 2);
  assert.equal(p.lapTimeMs, 61234);
  assert.equal(p.leaderboard.length, 1);
  assert.equal(p.leaderboard[0].laps, 3);
  assert.ok(Math.abs(p.gripLevel - 0.97) < 1e-6);
});

test('SESSION_INFO parses', () => {
  const buf = Buffer.concat([
    Buffer.from([59, 1, 2, 0, 3]),  // type, version, sessionIndex, currentSessionIndex, sessionCount
    str32('Test Server'), str8('magione'), str8('gp'), str8('Race'),
    Buffer.from([3]),              // sessionType race
    (() => { const b = Buffer.alloc(6); b.writeUInt16LE(20, 0); b.writeUInt16LE(10, 2); b.writeUInt16LE(60, 4); return b; })(),
    Buffer.from([22, 28]),         // ambient, road
    str8('3_clear'),
    (() => { const b = Buffer.alloc(4); b.writeInt32LE(12345); return b; })(),
  ]);
  const p = parsePacket(buf);
  assert.equal(p.type, 'session_info');
  assert.equal(p.serverName, 'Test Server');
  assert.equal(p.track, 'magione');
  assert.equal(p.trackConfig, 'gp');
  assert.equal(p.sessionTypeName, 'race');
  assert.equal(p.laps, 10);
  assert.equal(p.elapsedMs, 12345);
});

test('truncated / unknown packets are safe', () => {
  assert.equal(parsePacket(Buffer.from([53])).type, 'malformed');
  assert.equal(parsePacket(Buffer.from([99, 1, 2])).type, 'unknown');
  assert.equal(parsePacket(Buffer.alloc(0)), null);
});
