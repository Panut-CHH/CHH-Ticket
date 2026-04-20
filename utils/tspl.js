// Minimal TSPL command builder for POC (label printers like Zhuyitao L2X).
// Default label size 40x30mm — adjust in UI if the real label differs.

function asciiBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[i] = c < 128 ? c : 0x3f;
  }
  return out;
}

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

export function tsplHello({ widthMm = 40, heightMm = 30 } = {}) {
  const cmd =
    `SIZE ${widthMm} mm,${heightMm} mm\r\n` +
    `GAP 2 mm,0\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `TEXT 20,20,"3",0,1,1,"TSPL TEST"\r\n` +
    `TEXT 20,60,"2",0,1,1,"Hello from web"\r\n` +
    `TEXT 20,90,"2",0,1,1,"Line 2"\r\n` +
    `PRINT 1,1\r\n`;
  return asciiBytes(cmd);
}

// Build a QC label: ticket, source, station, inspector, date, index/total.
export function tsplQcLabel({
  ticketNo = "",
  sourceNo = "",
  station = "",
  inspector = "",
  date = "",
  index = 1,
  total = 1,
  widthMm = 40,
  heightMm = 30,
} = {}) {
  const cmd =
    `SIZE ${widthMm} mm,${heightMm} mm\r\n` +
    `GAP 2 mm,0\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `TEXT 10,10,"3",0,1,1,"${ticketNo}"\r\n` +
    `TEXT 10,50,"2",0,1,1,"SRC: ${sourceNo}"\r\n` +
    `TEXT 10,80,"2",0,1,1,"STN: ${station}"\r\n` +
    `TEXT 10,110,"2",0,1,1,"QC : ${inspector}"\r\n` +
    `TEXT 10,140,"2",0,1,1,"${date}  ${index}/${total}"\r\n` +
    `BARCODE 10,170,"128",40,1,0,2,2,"${ticketNo}-${index}"\r\n` +
    `PRINT 1,1\r\n`;
  return asciiBytes(cmd);
}
