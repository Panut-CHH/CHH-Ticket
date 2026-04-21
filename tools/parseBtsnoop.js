// Parse btsnoop_hci.log → extract ATT traffic (writes / notifications)
// Usage: node tools/parseBtsnoop.js btsnoop_hci.log [filter_cid]

import fs from "node:fs";
import path from "node:path";

const file = process.argv[2] || "btsnoop_hci.log";
const buf = fs.readFileSync(path.resolve(file));

// --- btsnoop header ---
if (buf.slice(0, 8).toString("ascii") !== "btsnoop\0") {
  console.error("not a btsnoop file");
  process.exit(1);
}
const version = buf.readUInt32BE(8);
const datalink = buf.readUInt32BE(12);
console.log(`# btsnoop v${version} datalink=${datalink} size=${buf.length}`);

// datalink 1002 = HCI UART (H4), 1001 = HCI
// We'll handle both — H4 prepends a 1-byte packet type.

let off = 16;
let recId = 0;
const handleMap = new Map(); // handle (u16) -> last known uuid
const attLog = []; // { rec, ts, dir, op, handle, value }

function hex(u8, max = 64) {
  const arr = [...u8.slice(0, max)];
  let s = arr.map((b) => b.toString(16).padStart(2, "0")).join(" ");
  if (u8.length > max) s += ` …(+${u8.length - max})`;
  return s;
}

const ATT_OPS = {
  0x01: "ERROR_RSP",
  0x02: "MTU_REQ",
  0x03: "MTU_RSP",
  0x04: "FIND_INFO_REQ",
  0x05: "FIND_INFO_RSP",
  0x06: "FIND_BY_TYPE_REQ",
  0x07: "FIND_BY_TYPE_RSP",
  0x08: "READ_BY_TYPE_REQ",
  0x09: "READ_BY_TYPE_RSP",
  0x0a: "READ_REQ",
  0x0b: "READ_RSP",
  0x0c: "READ_BLOB_REQ",
  0x0d: "READ_BLOB_RSP",
  0x10: "READ_BY_GROUP_REQ",
  0x11: "READ_BY_GROUP_RSP",
  0x12: "WRITE_REQ",
  0x13: "WRITE_RSP",
  0x16: "PREP_WRITE_REQ",
  0x17: "PREP_WRITE_RSP",
  0x18: "EXEC_WRITE_REQ",
  0x19: "EXEC_WRITE_RSP",
  0x1b: "HANDLE_NOTIFY",
  0x1d: "HANDLE_INDICATE",
  0x52: "WRITE_CMD",
};

// --- packet iter ---
while (off < buf.length) {
  recId++;
  const origLen = buf.readUInt32BE(off);
  const inclLen = buf.readUInt32BE(off + 4);
  const flags = buf.readUInt32BE(off + 8);
  const drops = buf.readUInt32BE(off + 12);
  // timestamp = 8 bytes, microseconds since 0000-01-01
  const tsHi = buf.readUInt32BE(off + 16);
  const tsLo = buf.readUInt32BE(off + 20);
  const tsUs = BigInt(tsHi) * 2n ** 32n + BigInt(tsLo);
  const dataOff = off + 24;
  const data = buf.slice(dataOff, dataOff + inclLen);
  off = dataOff + inclLen;

  // flags bit0: 0 = sent, 1 = received
  const received = (flags & 0x01) === 0x01;
  const direction = received ? "←" : "→";

  // datalink 1002 (H4): first byte is packet type
  let p = 0;
  let pktType = null;
  if (datalink === 1002) {
    pktType = data[p++];
  }
  // HCI ACL = 0x02, HCI CMD = 0x01, HCI EVENT = 0x04
  if (pktType !== 0x02) continue;
  if (data.length < p + 4) continue;

  const handleFlags = data.readUInt16LE(p);
  const aclLen = data.readUInt16LE(p + 2);
  p += 4;
  const aclHandle = handleFlags & 0x0fff;

  // L2CAP: 2B length, 2B cid
  if (data.length < p + 4) continue;
  const l2capLen = data.readUInt16LE(p);
  const l2capCid = data.readUInt16LE(p + 2);
  p += 4;

  // ATT = CID 0x0004
  if (l2capCid !== 0x0004) continue;
  if (data.length < p + 1) continue;

  const opcode = data[p];
  const opName = ATT_OPS[opcode] || `OP_${opcode.toString(16)}`;
  const attData = data.slice(p + 1);

  // Try to pull handle for write/notify ops
  let handle = null;
  let value = null;
  if (opcode === 0x12 || opcode === 0x52) {
    // write req / write cmd: [handle_lo, handle_hi, ...value]
    if (attData.length >= 2) {
      handle = attData.readUInt16LE(0);
      value = attData.slice(2);
    }
  } else if (opcode === 0x1b || opcode === 0x1d) {
    // notify / indicate: [handle_lo, handle_hi, ...value]
    if (attData.length >= 2) {
      handle = attData.readUInt16LE(0);
      value = attData.slice(2);
    }
  } else if (opcode === 0x09) {
    // read by type rsp — used during GATT discovery to map handle→UUID
    // format: [length, ...tuples]
    // for characteristic declarations (UUID 0x2803), value is:
    //   properties(1) + handle(2) + uuid(2 or 16)
    const tupLen = attData[0];
    for (let i = 1; i + tupLen <= attData.length; i += tupLen) {
      const attrHandle = attData.readUInt16LE(i);
      // value is (tupLen - 2) bytes starting at i+2
      const v = attData.slice(i + 2, i + tupLen);
      // charDecl: properties(1) + valueHandle(2) + uuid(rest)
      if (v.length === 5 || v.length === 19) {
        const valueHandle = v.readUInt16LE(1);
        let uuid;
        if (v.length === 5) {
          uuid = v.readUInt16LE(3).toString(16).padStart(4, "0");
        } else {
          // 128-bit uuid, little-endian
          const u = v.slice(3);
          const r = [...u].reverse().map((b) => b.toString(16).padStart(2, "0"));
          uuid = `${r.slice(0, 4).join("")}-${r.slice(4, 6).join("")}-${r
            .slice(6, 8)
            .join("")}-${r.slice(8, 10).join("")}-${r.slice(10).join("")}`;
        }
        handleMap.set(valueHandle, uuid);
      }
    }
  }

  if (handle !== null) {
    attLog.push({
      rec: recId,
      ts: Number(tsUs),
      dir: direction,
      op: opName,
      handle,
      value,
    });
  }
}

console.log(`\n# discovered handle → UUID map (${handleMap.size} entries)`);
for (const [h, u] of [...handleMap.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  0x${h.toString(16).padStart(4, "0")}  ${u}`);
}

// Filter: only interesting handles (writes/notifies related to printer chars)
const printerUuids = new Set([
  "ff02",
  "ff01",
  "ff03",
  "2af0",
  "2af1",
]);
const relevantHandles = new Set(
  [...handleMap.entries()]
    .filter(([, uuid]) => {
      const short = uuid.length <= 4 ? uuid : uuid.slice(4, 8);
      return printerUuids.has(short);
    })
    .map(([h]) => h),
);

console.log(
  `\n# ATT events on printer handles (${relevantHandles.size} handles tracked)`,
);
console.log(
  "#" +
    ["rec", "t(ms)", "dir", "op", "handle(uuid)", "value"]
      .map((h) => `  ${h}`)
      .join(""),
);

const firstTs = attLog.length ? attLog[0].ts : 0;
for (const e of attLog) {
  if (!relevantHandles.has(e.handle)) continue;
  const uuid = handleMap.get(e.handle) || "?";
  const tMs = ((e.ts - firstTs) / 1000).toFixed(1);
  const short = uuid.length > 4 ? uuid.slice(4, 8) : uuid;
  console.log(
    `  #${e.rec.toString().padStart(5)} ${tMs.padStart(8)}ms ${e.dir} ${e.op.padEnd(
      14,
    )} h=0x${e.handle.toString(16).padStart(4, "0")}(${short})  ${hex(
      e.value || Buffer.alloc(0),
      64,
    )}`,
  );
}

console.log(`\n# total ATT events captured: ${attLog.length}`);
console.log(
  `# events on relevant handles: ${
    attLog.filter((e) => relevantHandles.has(e.handle)).length
  }`,
);
