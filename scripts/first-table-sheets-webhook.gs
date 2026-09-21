/**
 * First Table signups → Google Sheet.
 *
 * Sheet: 1CL_Az25LIkX7eVzGQ8fzAefRHcMobOKlOo7QLYG_QHk
 *
 * Deploy: Apps Script → Deploy → New deployment → Web app.
 *   Execute as: Me
 *   Who has access: Anyone
 * Put the web app URL in FIRST_TABLE_SHEETS_WEBHOOK (server only).
 * The Next route POST /api/first-table forwards JSON to that URL.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById('1CL_Az25LIkX7eVzGQ8fzAefRHcMobOKlOo7QLYG_QHk');
    const sheet = ss.getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['timestamp','name','age','gender','phone','email','note','source']);
    }
    sheet.appendRow([
      new Date().toISOString(),
      data.name || '',
      data.age || '',
      data.gender || '',
      data.phone || '',
      data.email || '',
      data.note || '',
      data.source || 'site'
    ]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
