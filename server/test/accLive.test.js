import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAccLog } from '../src/accLive.js';

// Sample lines verbatim from real accServer.exe output:
// https://gist.github.com/pedrofaria/ab057054e31eb5c7960a79fe3116c3d9
// https://www.overtake.gg/threads/some-problem-with-dedicated-server.235725/

const SAMPLE = `
Track barcelona was set and updated
Session changed: Practice -> Practice 0
Detected sessionPhase -> (Practice)
New connection request: id 0 Joe Siffert S76561198000653331 on car model 22
Creating new car connection: carId 1001, carModel 22, raceNumber #999
New connection request: id 2 Alex Stones S76561198309515997 on car model 20
Creating new car connection: carId 1002, carModel 20, raceNumber #159
New connection request: id 3 fox suckfoxwaifu S76561198123845993 on car model 24
Creating new car connection: carId 1003, carModel 24, raceNumber #69
==ERR: TCP socket error detected 10053
Client 0 closed the connection (10053)
Removing dead connection 0 (last lastUdpPaketReceived 6450)
Alive connections: 2
Session changed: Practice -> Qualifying 0
Detected sessionPhase -> (Qualifying)
car 1002 has no driving connection anymore, will remove it
`;

test('parses connections, disconnects, sessions', () => {
  const r = parseAccLog(SAMPLE);
  assert.equal(r.track, 'barcelona');
  assert.equal(r.sessionType, 'Qualifying');
  assert.equal(r.sessionPhase, 'Qualifying');
  // id 0 closed+removed, id 2's car removed → only id 3 remains
  assert.equal(r.connectedCount, 1);
  assert.equal(r.drivers[0].name, 'fox suckfoxwaifu');
  assert.equal(r.drivers[0].steamId, 'S76561198123845993');
  assert.equal(r.drivers[0].carId, 1003);
  assert.equal(r.drivers[0].carModel, 24);
});

test('restart inside the tail discards stale connections', () => {
  const log = `
New connection request: id 0 Joe Siffert S76561198000653331 on car model 22
Creating new car connection: carId 1001, carModel 22, raceNumber #999
Session changed: Practice -> Qualifying 0
Detected sessionPhase -> (Qualifying)
Listening to TCP 9232 | UDP 9231
Track spa was set and updated
Session changed: Qualifying -> Practice 0
Detected sessionPhase -> (Practice)
`;
  const r = parseAccLog(log);
  assert.equal(r.connectedCount, 0); // Joe's pre-restart connection must not count
  assert.equal(r.track, 'spa');
  assert.equal(r.sessionType, 'Practice');
});

test('empty / garbage log is safe', () => {
  const r = parseAccLog('random noise\n\n');
  assert.equal(r.connectedCount, 0);
  assert.equal(r.sessionType, null);
});
