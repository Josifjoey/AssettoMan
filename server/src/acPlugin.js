// AC dedicated server UDP plugin protocol. All little-endian.
// Server→plugin packets: first byte is the message type.
// str8  = u8 byteLen + latin1 bytes
// str32 = u8 charCount + charCount*4 bytes UTF-32LE
// vec3f = 3 × f32 (x, y, z)

const T = {
  VERSION: 56,
  NEW_SESSION: 50,
  SESSION_INFO: 59,
  END_SESSION: 55,
  NEW_CONNECTION: 51,
  CONNECTION_CLOSED: 52,
  CLIENT_LOADED: 58,
  CAR_UPDATE: 53,
  CAR_INFO: 54,
  LAP_COMPLETED: 73,
  CHAT: 57,
  CLIENT_EVENT: 130,
  ERROR: 60,
};

export const SESSION_TYPES = { 1: 'practice', 2: 'qualify', 3: 'race' };

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8() { const v = this.b.readUInt8(this.o); this.o += 1; return v; }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return v; }
  str8() { const n = this.u8(); const v = this.b.toString('latin1', this.o, this.o + n); this.o += n; return v; }
  str32() {
    const n = this.u8();
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCodePoint(this.u32());
    return s;
  }
  vec3f() { return { x: this.f32(), y: this.f32(), z: this.f32() }; }
  remaining() { return this.b.length - this.o; }
  ensure(n) { if (this.remaining() < n) throw new Error('packet truncated'); }
}

export function parsePacket(buf) {
  if (!buf || buf.length < 1) return null;
  const r = new Reader(buf);
  const type = r.u8();
  try {
    switch (type) {
      case T.VERSION:
        r.ensure(1);
        return { type: 'version', protocolVersion: r.u8() };

      case T.NEW_SESSION:
      case T.SESSION_INFO: {
        r.ensure(4);
        const version = r.u8();
        const sessionIndex = r.u8();
        const currentSessionIndex = r.u8();
        const sessionCount = r.u8();
        const serverName = r.str32();
        const track = r.str8();
        const trackConfig = r.str8();
        const sessionName = r.str8();
        r.ensure(9);
        const sessionType = r.u8();
        const timeMinutes = r.u16();
        const laps = r.u16();
        const waitTime = r.u16();
        const ambientTemp = r.u8();
        const roadTemp = r.u8();
        const weatherGraphics = r.str8();
        r.ensure(4);
        const elapsedMs = r.i32();
        return {
          type: type === T.NEW_SESSION ? 'new_session' : 'session_info',
          version, sessionIndex, currentSessionIndex, sessionCount,
          serverName, track, trackConfig, sessionName,
          sessionType, sessionTypeName: SESSION_TYPES[sessionType] || String(sessionType),
          timeMinutes, laps, waitTime, ambientTemp, roadTemp, weatherGraphics, elapsedMs,
        };
      }

      case T.END_SESSION:
        return { type: 'end_session', resultsFilename: r.str32() };

      case T.NEW_CONNECTION:
      case T.CONNECTION_CLOSED: {
        const driverName = r.str32();
        const driverGuid = r.str32();
        r.ensure(1);
        const carId = r.u8();
        const carModel = r.str8();
        const carSkin = r.str8();
        return {
          type: type === T.NEW_CONNECTION ? 'new_connection' : 'connection_closed',
          driverName, driverGuid, carId, carModel, carSkin,
        };
      }

      case T.CLIENT_LOADED:
        r.ensure(1);
        return { type: 'client_loaded', carId: r.u8() };

      case T.CAR_UPDATE: {
        r.ensure(1);
        const carId = r.u8();
        r.ensure(3 * 4 * 2 + 1 + 2 + 4);
        const pos = r.vec3f();
        const vel = r.vec3f();
        const gear = r.u8();
        const engineRpm = r.u16();
        const normalizedSplinePos = r.f32();
        return { type: 'car_update', carId, pos, vel, gear, engineRpm, normalizedSplinePos };
      }

      case T.CAR_INFO: {
        r.ensure(2);
        const carId = r.u8();
        const isConnected = r.u8();
        const carModel = r.str32();
        const carSkin = r.str32();
        const driverName = r.str32();
        const driverTeam = r.str32();
        const driverGuid = r.str32();
        return { type: 'car_info', carId, isConnected: !!isConnected, carModel, carSkin, driverName, driverTeam, driverGuid };
      }

      case T.LAP_COMPLETED: {
        r.ensure(7);
        const carId = r.u8();
        const lapTimeMs = r.u32();
        const cuts = r.u8();
        const carsCount = r.u8();
        const leaderboard = [];
        for (let i = 0; i < carsCount; i++) {
          r.ensure(7);
          leaderboard.push({ carId: r.u8(), totalTimeMs: r.u32(), laps: r.u16(), hasCompletedLastLap: !!r.u8() });
        }
        r.ensure(4);
        const gripLevel = r.f32();
        return { type: 'lap_completed', carId, lapTimeMs, cuts, leaderboard, gripLevel };
      }

      case T.CHAT: {
        r.ensure(1);
        const carId = r.u8();
        const message = r.str32();
        return { type: 'chat', carId, message };
      }

      case T.CLIENT_EVENT: {
        r.ensure(2);
        const eventType = r.u8();
        const carId = r.u8();
        let otherCarId = null;
        if (eventType === 10) { r.ensure(1); otherCarId = r.u8(); }
        r.ensure(4 + 12 + 12);
        const impactSpeed = r.f32();
        const worldPos = r.vec3f();
        const relPos = r.vec3f();
        return {
          type: 'client_event',
          eventType,
          eventName: eventType === 10 ? 'collision_car' : eventType === 11 ? 'collision_env' : String(eventType),
          carId, otherCarId, impactSpeed, worldPos, relPos,
        };
      }

      case T.ERROR:
        return { type: 'error', message: r.str32() };

      default:
        return { type: 'unknown', rawType: type };
    }
  } catch {
    return { type: 'malformed', rawType: type };
  }
}

// ---- plugin→server builders ----

function str32buf(s) {
  const chars = [...String(s)];
  const b = Buffer.alloc(1 + chars.length * 4);
  b.writeUInt8(Math.min(chars.length, 255), 0);
  chars.slice(0, 255).forEach((ch, i) => b.writeUInt32LE(ch.codePointAt(0), 1 + i * 4));
  return b;
}

export function buildRealtimeInterval(ms) {
  const b = Buffer.alloc(3);
  b.writeUInt8(200, 0);
  b.writeUInt16LE(ms, 1);
  return b;
}

export function buildGetCarInfo(carId) {
  return Buffer.from([201, carId & 0xff]);
}

export function buildGetSessionInfo(index) {
  const b = Buffer.alloc(3);
  b.writeUInt8(204, 0);
  b.writeInt16LE(index, 1);
  return b;
}

export function buildBroadcastChat(msg) {
  return Buffer.concat([Buffer.from([203]), str32buf(msg)]);
}

export function buildSendChat(carId, msg) {
  return Buffer.concat([Buffer.from([202, carId & 0xff]), str32buf(msg)]);
}

export function buildKick(carId) {
  return Buffer.from([206, carId & 0xff]);
}

export function buildNextSession() {
  return Buffer.from([207]);
}

export function buildRestartSession() {
  return Buffer.from([208]);
}

export function buildAdminCommand(cmd) {
  return Buffer.concat([Buffer.from([209]), str32buf(cmd)]);
}
