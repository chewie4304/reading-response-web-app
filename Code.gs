// Google Apps Script backend for the Reading Response Web App.
// Source of truth lives in the bound Apps Script project (Extensions > Apps Script).
// Paste this file's contents there and create a new deployment version after editing.

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const RESPONSE_COOLDOWN_DAYS = 14; // Students can't repeat the same prompt standard within this window

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStoredPasscode(ss) {
  const settingsSheet = ss.getSheetByName("settings");
  return settingsSheet ? settingsSheet.getRange("B2").getValue().toString().trim() : "";
}

// Responses have no dedicated ID column, so the ISO timestamp doubles as the row key.
function findResponseRowByTimestamp(respSheet, responseId) {
  const data = respSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data.at(i).at(0)) === String(responseId)) {
      return i + 1; // Sheet rows are 1-indexed
    }
  }
  return -1;
}

// Prompt titles (not full response text) each student submitted within the cooldown window
function getRecentSubmissions(ss) {
  const respSheet = ss.getSheetByName("responses");
  if (!respSheet) return new Array();

  const cutoff = new Date(Date.now() - RESPONSE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const data = respSheet.getDataRange().getValues();
  const recent = new Array();
  for (let i = 1; i < data.length; i++) {
    const row = data.at(i);
    if (!row || !row.at(0)) continue;
    const submittedAt = new Date(row.at(0));
    if (isNaN(submittedAt.getTime()) || submittedAt < cutoff) continue;
    recent.push({
      studentName: String(row.at(1)),
      prompt1Title: String(row.at(5)),
      prompt2Title: String(row.at(7)),
      timestamp: String(row.at(0))
    });
  }
  return recent;
}

function getPromptStandardMap(ss) {
  const promptSheet = ss.getSheetByName("prompts");
  const map = {};
  if (!promptSheet) return map;
  const data = promptSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data.at(i);
    if (row && row.at(3)) {
      map[String(row.at(3))] = String(row.at(2));
    }
  }
  return map;
}

// Finds the first prompt standard the student already completed within the cooldown window
function findCooldownViolation(ss, studentName, prompt1Title, prompt2Title) {
  const standardMap = getPromptStandardMap(ss);
  const recent = getRecentSubmissions(ss).filter(s => s.studentName === studentName);
  const cooldownMs = RESPONSE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const title of [prompt1Title, prompt2Title]) {
    const standard = standardMap[title];
    if (!standard) continue;

    for (const sub of recent) {
      const subStandards = [standardMap[sub.prompt1Title], standardMap[sub.prompt2Title]];
      if (subStandards.indexOf(standard) === -1) continue;

      const submittedAt = new Date(sub.timestamp).getTime();
      if (isNaN(submittedAt)) continue;

      const nextEligible = submittedAt + cooldownMs;
      if (nextEligible > now) {
        return { standard: standard, nextEligible: new Date(nextEligible) };
      }
    }
  }
  return null;
}

function doGet(e) {
  const action = e.parameter ? e.parameter.action : "";
  const passcode = e.parameter ? e.parameter.passcode : "";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  if (action === "getInitialData") {
    const studentSheet = ss.getSheetByName("students");
    const promptSheet = ss.getSheetByName("prompts");

    if (!studentSheet || !promptSheet) {
      return createJsonResponse({ success: false, message: "Sheets not found." });
    }

    const studentData = studentSheet.getDataRange().getValues();
    const students = new Array();
    for (let i = 1; i < studentData.length; i++) {
      const row = studentData.at(i);
      if (row && row.at(0)) {
        students.push({ name: String(row.at(0)), grade: String(row.at(1)) });
      }
    }

    const promptData = promptSheet.getDataRange().getValues();
    const prompts = new Array();
    for (let i = 1; i < promptData.length; i++) {
      const row = promptData.at(i);
      if (row && row.at(0)) {
        prompts.push({
          id: String(row.at(0)),
          grade: String(row.at(1)),
          standard: String(row.at(2)),
          title: String(row.at(3)),
          text: String(row.at(4))
        });
      }
    }

    const recentSubmissions = getRecentSubmissions(ss);

    return createJsonResponse({
      success: true,
      students: students,
      prompts: prompts,
      recentSubmissions: recentSubmissions,
      cooldownDays: RESPONSE_COOLDOWN_DAYS
    });
  }

  const storedPasscode = getStoredPasscode(ss);

  if (action === "verifyPasscode") {
    return createJsonResponse({ success: passcode === storedPasscode });
  }

  if (action === "getResponses") {
    if (passcode !== storedPasscode) {
      return createJsonResponse({ success: false, message: "Unauthorized" });
    }
    const respSheet = ss.getSheetByName("responses");
    if (!respSheet) {
      return createJsonResponse({ success: false, message: "'responses' sheet not found." });
    }
    const standardMap = getPromptStandardMap(ss);
    const data = respSheet.getDataRange().getValues();
    const responses = new Array();
    for (let i = 1; i < data.length; i++) {
      const row = data.at(i);
      if (row && row.at(0)) {
        const prompt1Title = String(row.at(5));
        const prompt2Title = String(row.at(7));
        responses.push({
          timestamp: String(row.at(0)),
          studentName: String(row.at(1)),
          gradeLevel: String(row.at(2)),
          bookTitle: String(row.at(3)),
          bookAuthor: String(row.at(4)),
          prompt1Title: standardMap[prompt1Title] ? `${standardMap[prompt1Title]}: ${prompt1Title}` : prompt1Title,
          response1: String(row.at(6)),
          prompt2Title: standardMap[prompt2Title] ? `${standardMap[prompt2Title]}: ${prompt2Title}` : prompt2Title,
          response2: String(row.at(8)),
          score1: row.at(9) ? String(row.at(9)) : "",
          score2: row.at(10) ? String(row.at(10)) : "",
          comment1: row.at(11) ? String(row.at(11)) : "",
          comment2: row.at(12) ? String(row.at(12)) : ""
        });
      }
    }
    return createJsonResponse({ success: true, responses: responses });
  }

  return createJsonResponse({ success: false, message: "Invalid action" });
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const storedPasscode = getStoredPasscode(ss);

    if (contents.action === "addStudent") {
      if (contents.passcode !== storedPasscode) {
        return createJsonResponse({ success: false, message: "Unauthorized" });
      }
      const studentSheet = ss.getSheetByName("students");
      studentSheet.appendRow(Array.of(contents.studentName, contents.gradeLevel));
      return createJsonResponse({ success: true, message: "Student added!" });
    }

    if (contents.action === "scoreResponse") {
      if (contents.passcode !== storedPasscode) {
        return createJsonResponse({ success: false, message: "Unauthorized" });
      }
      const respSheet = ss.getSheetByName("responses");
      const rowNum = findResponseRowByTimestamp(respSheet, contents.responseId);
      if (rowNum === -1) {
        return createJsonResponse({ success: false, message: "Response not found." });
      }
      const scoreCol = Number(contents.promptNum) === 2 ? 11 : 10; // J=score1, K=score2
      respSheet.getRange(rowNum, scoreCol).setValue(Number(contents.score));
      return createJsonResponse({ success: true, message: "Score saved!" });
    }

    if (contents.action === "saveComment") {
      if (contents.passcode !== storedPasscode) {
        return createJsonResponse({ success: false, message: "Unauthorized" });
      }
      const respSheet = ss.getSheetByName("responses");
      const rowNum = findResponseRowByTimestamp(respSheet, contents.responseId);
      if (rowNum === -1) {
        return createJsonResponse({ success: false, message: "Response not found." });
      }
      const commentCol = Number(contents.promptNum) === 2 ? 13 : 12; // L=comment1, M=comment2
      respSheet.getRange(rowNum, commentCol).setValue(String(contents.comment || ""));
      return createJsonResponse({ success: true, message: "Comment saved!" });
    }

    if (contents.action === "deleteResponse") {
      if (contents.passcode !== storedPasscode) {
        return createJsonResponse({ success: false, message: "Unauthorized" });
      }
      const respSheet = ss.getSheetByName("responses");
      const rowNum = findResponseRowByTimestamp(respSheet, contents.responseId);
      if (rowNum === -1) {
        return createJsonResponse({ success: false, message: "Response not found." });
      }
      respSheet.deleteRow(rowNum);
      return createJsonResponse({ success: true, message: "Response deleted!" });
    }

    const respSheet = ss.getSheetByName("responses");

    if (contents.prompt1Title === contents.prompt2Title) {
      return createJsonResponse({ success: false, message: "Prompt 1 and Prompt 2 cannot be the same prompt." });
    }

    const violation = findCooldownViolation(ss, contents.studentName, contents.prompt1Title, contents.prompt2Title);
    if (violation) {
      const untilText = violation.nextEligible.toLocaleDateString();
      return createJsonResponse({ success: false, message: `Standard ${violation.standard} was already completed recently. Not permitted again until ${untilText}.` });
    }

    respSheet.appendRow(Array.of(
      new Date().toISOString(),
      contents.studentName,
      contents.gradeLevel,
      contents.bookTitle,
      contents.bookAuthor,
      contents.prompt1Title,
      contents.response1,
      contents.prompt2Title,
      contents.response2
    ));

    return createJsonResponse({ success: true, message: "Response submitted!" });
  } catch (err) {
    return createJsonResponse({ success: false, message: err.toString() });
  }
}
