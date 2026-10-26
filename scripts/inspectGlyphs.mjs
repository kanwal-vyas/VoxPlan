import fs from 'node:fs';
import path from 'node:path';

function inspectFontGlyphs(buffer) {
  const numTables = buffer.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    const tag = buffer.toString('utf8', offset, offset + 4);
    const tableOffset = buffer.readUInt32BE(offset + 8);
    const length = buffer.readUInt32BE(offset + 12);
    tables[tag] = { offset: tableOffset, length };
  }

  // Parse cmap table to check supported characters
  const supported = new Set();
  if (tables['cmap']) {
    const cmapOffset = tables['cmap'].offset;
    const numSubtables = buffer.readUInt16BE(cmapOffset + 2);
    for (let i = 0; i < numSubtables; i++) {
      const subOffset = cmapOffset + 4 + i * 8;
      const subtableOffset = cmapOffset + buffer.readUInt32BE(subOffset + 4);

      const format = buffer.readUInt16BE(subtableOffset);
      if (format === 4) {
        const segCountX2 = buffer.readUInt16BE(subtableOffset + 6);
        const segCount = segCountX2 / 2;
        const endCodeOffset = subtableOffset + 14;
        const startCodeOffset = endCodeOffset + segCountX2 + 2;

        for (let s = 0; s < segCount; s++) {
          const endCode = buffer.readUInt16BE(endCodeOffset + s * 2);
          const startCode = buffer.readUInt16BE(startCodeOffset + s * 2);
          if (startCode !== 0xFFFF) {
            for (let c = startCode; c <= endCode; c++) {
              supported.add(c);
            }
          }
        }
        break; // format 4 subtable found
      }
    }
  }

  const sampleChars = {
    hasUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').every(ch => supported.has(ch.charCodeAt(0))),
    hasLower: 'abcdefghijklmnopqrstuvwxyz'.split('').every(ch => supported.has(ch.charCodeAt(0))),
    hasDigits: '0123456789'.split('').every(ch => supported.has(ch.charCodeAt(0))),
    hasPunct: '.,:;!?-"\'()'.split('').every(ch => supported.has(ch.charCodeAt(0))),
    totalGlyphs: supported.size
  };

  return sampleChars;
}

const fontsDir = path.resolve('public/fonts');
const fontFolders = fs.readdirSync(fontsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const folder of fontFolders) {
  const folderPath = path.join(fontsDir, folder);
  const files = fs.readdirSync(folderPath).filter(f => /\.(otf|ttf)$/i.test(f));
  for (const f of files) {
    const buf = fs.readFileSync(path.join(folderPath, f));
    const glyphs = inspectFontGlyphs(buf);
    console.log(`[${folder}] ${f}: Upper=${glyphs.hasUpper}, Lower=${glyphs.hasLower}, Digits=${glyphs.hasDigits}, Punct=${glyphs.hasPunct}, TotalGlyphs=${glyphs.totalGlyphs}`);
  }
}
