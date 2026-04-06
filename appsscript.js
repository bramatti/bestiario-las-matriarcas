// =============================================================
// Las Matriarcas — Apps Script
// Cole este código em Extensões → Apps Script da sua planilha
// Depois: Implantar → Nova implantação → Aplicativo da Web
//   Executar como: Eu
//   Quem pode acessar: Qualquer pessoa
// =============================================================

const SHEET_NAME  = 'Bichos';
const FOLDER_NAME = 'Las Matriarcas — Fotos';   // pasta criada automaticamente no Drive
const MONTHS      = ['Jan','Fev','Mar','Abr','Mai','Jun',
                     'Jul','Ago','Set','Out','Nov','Dez'];

// ── Roteador ──────────────────────────────────────────────────
function doGet(e)  { return route(e); }
function doPost(e) { return route(e); }

function route(e) {
  try {
    const action = e.parameter.action ||
                   (e.postData ? JSON.parse(e.postData.contents).action : null);
    if (action === 'read')         return ok(readSpecies());
    if (action === 'write')        return ok(writeMonths(e));
    if (action === 'upload')       return ok(uploadPhoto(e));
    if (action === 'listPhotos')   return ok(listPhotos(e));
    return err('Ação desconhecida: ' + action);
  } catch(ex) {
    return err(ex.message);
  }
}

// ── Leitura da planilha ───────────────────────────────────────
function readSpecies() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows  = sheet.getDataRange().getValues();
  const data  = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const months = [];
    for (let m = 0; m < 12; m++) {
      const val = r[4 + m];
      if (val && String(val).trim() !== '' && val != 0) months.push(m);
    }
    data.push({
      rowIndex : i + 1,
      name     : r[0] || '',
      sci      : r[1] || '',
      fam      : r[2] || '',
      photo    : r[3] || '',   // foto principal (coluna D)
      months   : months
    });
  }
  return { species: data };
}

// ── Gravação de meses ─────────────────────────────────────────
function writeMonths(e) {
  const body    = JSON.parse(e.postData.contents);
  const changes = body.changes;  // [{ rowIndex, months }]
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  changes.forEach(({ rowIndex, months }) => {
    for (let m = 0; m < 12; m++) {
      sheet.getRange(rowIndex, 5 + m).setValue(months.includes(m) ? 'x' : '');
    }
  });
  return { saved: changes.length };
}

// ── Upload de foto para o Drive ───────────────────────────────
function uploadPhoto(e) {
  const body      = JSON.parse(e.postData.contents);
  const base64    = body.data;          // string base64 pura (sem prefixo data:...)
  const mimeType  = body.mimeType;      // ex: "image/jpeg"
  const species   = body.species;       // nome da espécie
  const dateStr   = body.date;          // ex: "2025-07-12"
  const monthIdx  = body.month;         // 0–11

  const folder    = getOrCreateFolder();
  const bytes     = Utilities.base64Decode(base64);
  const blob      = Utilities.newBlob(bytes, mimeType);

  const ext       = mimeType.split('/')[1] || 'jpg';
  const fileName  = `${species}__${dateStr}__${MONTHS[monthIdx]}.${ext}`
    .replace(/[^a-zA-ZÀ-ÿ0-9._\-]/g, '_');

  blob.setName(fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId   = file.getId();
  const viewUrl  = `https://drive.google.com/file/d/${fileId}/view`;
  const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;

  return { fileId, viewUrl, thumbUrl, fileName };
}

// ── Listar fotos de uma espécie ───────────────────────────────
function listPhotos(e) {
  const species = e.parameter.species;
  const folder  = getOrCreateFolder();
  const files   = folder.getFiles();
  const photos  = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    // Nome formato: EspecieNome__YYYY-MM-DD__Mes.ext
    if (!name.startsWith(species.replace(/[^a-zA-ZÀ-ÿ0-9._\-]/g, '_'))) continue;

    const parts   = name.split('__');
    const dateStr = parts[1] || '';
    const monthLbl= (parts[2] || '').split('.')[0];
    const fileId  = file.getId();

    photos.push({
      fileId   : fileId,
      thumbUrl : `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
      viewUrl  : `https://drive.google.com/file/d/${fileId}/view`,
      date     : dateStr,
      month    : monthLbl,
      name     : name
    });
  }

  // Ordena por data decrescente
  photos.sort((a, b) => b.date.localeCompare(a.date));
  return { photos };
}

// ── Helpers ───────────────────────────────────────────────────
function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
