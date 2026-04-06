// =============================================================
// Las Matriarcas — Apps Script
// Cole este código em Extensões → Apps Script da sua planilha
// Depois: Implantar → Nova implantação → Aplicativo da Web
//   Executar como: Eu
//   Quem pode acessar: Qualquer pessoa
//
// IMPORTANTE: após colar, rode a função getFolderId() uma vez
// manualmente (botão ▶) para ver o ID da pasta "bestiário"
// no log, e cole o valor em FOLDER_ID abaixo.
// =============================================================

const SHEET_NAME = 'Bichos';
const FOLDER_NAME = 'bestiário';  // nome da pasta no seu Drive
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun',
                'Jul','Ago','Set','Out','Nov','Dez'];

// Cole aqui o ID da pasta "bestiário" do seu Drive.
// Para encontrar: abra a pasta no Drive, copie o trecho
// final da URL após /folders/
// Exemplo: https://drive.google.com/drive/folders/ESTE_TRECHO
// Deixe '' para o script criar/buscar a pasta pelo nome.
const FOLDER_ID = '';

// ── Roteador ──────────────────────────────────────────────────
function doGet(e)  { return route(e); }
function doPost(e) { return route(e); }

function route(e) {
  try {
    // Lê action da URL (?action=...) — mais confiável que o body
    const action = e.parameter && e.parameter.action;
    if (!action) return err('Parâmetro action ausente na URL');

    if (action === 'read')       return ok(readSpecies());
    if (action === 'write')      return ok(writeMonths(e));
    if (action === 'upload')     return ok(uploadPhoto(e));
    if (action === 'listPhotos') return ok(listPhotos(e));
    return err('Ação desconhecida: ' + action);
  } catch(ex) {
    return err('Erro interno: ' + ex.message + ' | stack: ' + ex.stack);
  }
}

// ── Utilitário: descobre o ID da pasta (rode manualmente 1x) ──
function getFolderId() {
  const folder = getFolder();
  Logger.log('ID da pasta "' + FOLDER_NAME + '": ' + folder.getId());
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
      rowIndex: i + 1,
      name:  r[0] || '',
      sci:   r[1] || '',
      fam:   r[2] || '',
      photo: r[3] || '',
      months: months
    });
  }
  return { species: data };
}

// ── Gravação de meses ─────────────────────────────────────────
function writeMonths(e) {
  const body    = JSON.parse(e.postData.contents);
  const changes = body.changes;
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
  const raw = e.postData.contents;
  if (!raw) throw new Error('postData vazio — body não chegou');

  const body     = JSON.parse(raw);
  const base64   = body.data;
  const mimeType = body.mimeType || 'image/jpeg';
  const species  = body.species  || 'desconhecido';
  const dateStr  = body.date     || new Date().toISOString().split('T')[0];
  const monthIdx = (typeof body.month === 'number') ? body.month : new Date().getMonth();

  if (!base64) throw new Error('Campo data (base64) ausente no body');

  const bytes  = Utilities.base64Decode(base64);
  const ext    = mimeType.includes('png') ? 'png' : 'jpg';
  const safeName = (species + '__' + dateStr + '__' + MONTHS[monthIdx] + '.' + ext)
    .replace(/[^\w.\-]/g, '_');

  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const folder = getFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return {
    fileId,
    viewUrl:  'https://drive.google.com/file/d/' + fileId + '/view',
    thumbUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800',
    fileName: safeName
  };
}

// ── Listar fotos de uma espécie ───────────────────────────────
function listPhotos(e) {
  const speciesName = e.parameter.species || '';
  const safePrefix  = speciesName.replace(/[^\w.\-]/g, '_');
  const folder = getFolder();
  const files  = folder.getFiles();
  const photos = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (safePrefix && !name.startsWith(safePrefix)) continue;
    const parts    = name.split('__');
    const dateStr  = parts[1] || '';
    const monthLbl = (parts[2] || '').replace(/\.\w+$/, '');
    const fileId   = file.getId();
    photos.push({
      fileId,
      thumbUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800',
      viewUrl:  'https://drive.google.com/file/d/' + fileId + '/view',
      date:  dateStr,
      month: monthLbl,
      name:  name
    });
  }
  photos.sort((a, b) => b.date.localeCompare(a.date));
  return { photos };
}

// ── Helpers ───────────────────────────────────────────────────
function getFolder() {
  if (FOLDER_ID && FOLDER_ID !== '') {
    return DriveApp.getFolderById(FOLDER_ID);
  }
  // Fallback: busca ou cria pelo nome
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
