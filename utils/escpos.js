// Minimal ESC/POS command builder for POC.
// Works on most thermal mini printers. For Thai/Unicode text, many mini
// printers need a raster image — ASCII is the safest bet for a first test.

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function concat(...chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function ascii(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i] = code < 128 ? code : 0x3f; // '?' fallback for non-ASCII
  }
  return out;
}

export function escposHello() {
  return concat(
    new Uint8Array([ESC, 0x40]),                 // ESC @  initialize
    new Uint8Array([ESC, 0x61, 0x01]),           // ESC a 1  center
    ascii("ESC/POS TEST\n"),
    new Uint8Array([ESC, 0x61, 0x00]),           // left
    ascii("Hello from web\n"),
    ascii("Line 2\n"),
    new Uint8Array([LF, LF, LF, LF]),            // feed
  );
}

export function escposLabel({ title, lines = [], feed = 4 } = {}) {
  const body = [
    new Uint8Array([ESC, 0x40]),
    new Uint8Array([ESC, 0x61, 0x01]),
    new Uint8Array([GS, 0x21, 0x11]),            // double w+h
    ascii(`${title || ""}\n`),
    new Uint8Array([GS, 0x21, 0x00]),            // normal size
    new Uint8Array([ESC, 0x61, 0x00]),
  ];
  for (const ln of lines) body.push(ascii(`${ln}\n`));
  body.push(new Uint8Array(Array(feed).fill(LF)));
  return concat(...body);
}
