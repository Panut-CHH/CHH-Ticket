import fs from "node:fs";
const buf = fs.readFileSync("btsnoop_hci.log");

// Dump first 30 ACL packets for each handle
let off = 16;
const byHandle = { 0xedc: [], 0x002: [] };
let rec = 0;
while (off < buf.length) {
  const inclLen = buf.readUInt32BE(off + 4);
  const flags = buf.readUInt32BE(off + 8);
  const data = buf.slice(off + 24, off + 24 + inclLen);
  off += 24 + inclLen;
  rec++;
  if (data[0] !== 0x02) continue;
  if (data.length < 5) continue;
  const hf = data.readUInt16LE(1);
  const handle = hf & 0x0fff;
  if (byHandle[handle] && byHandle[handle].length < 15) {
    const dir = flags & 1 ? "rx" : "tx";
    const pb = (hf >> 12) & 0x3;
    const hex = [...data.slice(5, Math.min(5 + 30, data.length))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    byHandle[handle].push({ rec, dir, pb, aclLen: data.readUInt16LE(3), hex });
  }
}
for (const [h, arr] of Object.entries(byHandle)) {
  console.log(`\n=== handle 0x${Number(h).toString(16)} ===`);
  for (const p of arr) {
    console.log(
      `  #${String(p.rec).padStart(4)} ${p.dir} pb=${p.pb} aclLen=${p.aclLen}  ${p.hex}`,
    );
  }
}
