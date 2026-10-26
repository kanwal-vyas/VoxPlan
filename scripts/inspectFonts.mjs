import fs from 'node:fs';
import path from 'node:path';

function parseOpenType(buffer) {
  const numTables = buffer.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    const tag = buffer.toString('utf8', offset, offset + 4);
    const tableOffset = buffer.readUInt32BE(offset + 8);
    const length = buffer.readUInt32BE(offset + 12);
    tables[tag] = { offset: tableOffset, length };
  }

  const result = {
    names: {},
    weightClass: null,
    fsSelection: null,
    panose: null
  };

  if (tables['name']) {
    const nameOffset = tables['name'].offset;
    const count = buffer.readUInt16BE(nameOffset + 2);
    const stringOffset = nameOffset + buffer.readUInt16BE(nameOffset + 4);

    for (let i = 0; i < count; i++) {
      const recordOffset = nameOffset + 6 + i * 12;
      const platformID = buffer.readUInt16BE(recordOffset);
      const encodingID = buffer.readUInt16BE(recordOffset + 2);
      const nameID = buffer.readUInt16BE(recordOffset + 6);
      const length = buffer.readUInt16BE(recordOffset + 8);
      const offset = buffer.readUInt16BE(recordOffset + 10);

      const strStart = stringOffset + offset;
      let strVal = '';
      if (platformID === 0 || (platformID === 3 && encodingID === 1) || platformID === 3) {
        try {
          strVal = buffer.toString('utf16be', strStart, strStart + length);
        } catch {
          strVal = buffer.toString('utf8', strStart, strStart + length);
        }
      } else {
        strVal = buffer.toString('latin1', strStart, strStart + length);
      }
      strVal = strVal.replace(/\0/g, '').trim();

      const nameKeys = {
        0: 'copyright',
        1: 'family',
        2: 'subfamily',
        4: 'fullName',
        6: 'postScriptName',
        7: 'trademark',
        8: 'manufacturer',
        9: 'designer',
        11: 'vendorUrl',
        13: 'licenseDescription',
        14: 'licenseUrl',
        16: 'typographicFamily',
        17: 'typographicSubfamily'
      };

      if (nameKeys[nameID] && !result.names[nameKeys[nameID]]) {
        result.names[nameKeys[nameID]] = strVal;
      }
    }
  }

  if (tables['OS/2']) {
    const os2Offset = tables['OS/2'].offset;
    result.weightClass = buffer.readUInt16BE(os2Offset + 4);
    result.panose = Array.from(buffer.slice(os2Offset + 32, os2Offset + 42));
    result.fsSelection = buffer.readUInt16BE(os2Offset + 62);
  }

  return result;
}

const fontsDir = path.resolve('public/fonts');
const fontFolders = fs.readdirSync(fontsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const inventory = [];

for (const folder of fontFolders) {
  const folderPath = path.join(fontsDir, folder);
  const files = fs.readdirSync(folderPath);

  const fontFiles = files.filter(f => /\.(otf|ttf|woff|woff2)$/i.test(f));
  const docFiles = files.filter(f => /\.(txt|md|pdf|doc|html)$/i.test(f));

  const docs = {};
  for (const doc of docFiles) {
    try {
      docs[doc] = fs.readFileSync(path.join(folderPath, doc), 'utf-8');
    } catch (e) {
      docs[doc] = 'Error reading file: ' + e.message;
    }
  }

  for (const fontFile of fontFiles) {
    const filePath = path.join(folderPath, fontFile);
    const stat = fs.statSync(filePath);
    const ext = path.extname(fontFile).toLowerCase();
    const buf = fs.readFileSync(filePath);
    let meta = null;
    try {
      meta = parseOpenType(buf);
    } catch (err) {
      meta = { error: err.message };
    }

    inventory.push({
      folder,
      filename: fontFile,
      format: ext,
      sizeBytes: stat.size,
      meta,
      docs
    });
  }
}

fs.writeFileSync('scripts/font_inventory.json', JSON.stringify(inventory, null, 2), 'utf-8');

console.log(`Inventory completed: ${inventory.length} font files found across ${fontFolders.length} folders.`);
for (const item of inventory) {
  const n = item.meta?.names || {};
  console.log(`- [${item.folder}] ${item.filename} (${item.format}, ${(item.sizeBytes / 1024).toFixed(1)} KB) -> Family: "${n.family || 'Unknown'}", Subfamily: "${n.subfamily || 'Unknown'}", FullName: "${n.fullName || 'Unknown'}", Weight: ${item.meta?.weightClass || 'N/A'}`);
}
