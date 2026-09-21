// Web App API Endpoint
const API_URL = "https://script.google.com/macros/s/AKfycbyzv-2a7duFRLcbHR14jDW0YzBDGjKMVQFI3UDPWG0GCweQTiB26-119hKKEeHl59S4/exec";

// Global App State
let studentsData = [];
let promptsData = [];
let recentSubmissionsData = [];
let cooldownDays = 14;
let currentSelectedStudent = null;
let activePasscode = "";
let currentMatches = new Array();
let selectedIndex = -1;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    bindEvents();
    await loadInitialData();
}

// 1. Fetch Roster and Prompts from Google Sheets API
async function loadInitialData() {
    const statusMsg = document.getElementById("status-message");

    try {
        const res = await fetch(`${API_URL}?action=getInitialData`);
        const json = await res.json();

        if (json.success) {
            studentsData = (json.students || new Array()).map(s => ({
                name: String(s.name || ""),
                grade: String(s.grade || "")
            }));
            promptsData = (json.prompts || new Array()).map(p => ({
                id: p.id || "",
                grade: String(p.grade || ""),
                standard: p.standard || "",
                title: p.title || "",
                text: p.text || ""
            }));
            recentSubmissionsData = json.recentSubmissions || new Array();
            cooldownDays = Number(json.cooldownDays) || 14;
        } else {
            showStatus("Failed to load initial data from Google Sheets.", "error");
        }
    } catch (err) {
        showStatus("Error connecting to server. Check your internet connection.", "error");
    }
}

// Bind Student Name Input Events
function bindStudentNameEvents() {
    const nameInput = document.getElementById("student-name");
    if (!nameInput) return;

    nameInput.addEventListener("input", handleStudentNameChange);
    nameInput.addEventListener("keydown", handleStudentNameKeydown);

    // Hide suggestion list when clicking outside
    document.addEventListener("click", (e) => {
        if (e.target !== nameInput) {
            const suggestionsBox = document.getElementById("student-suggestions");
            if (suggestionsBox) suggestionsBox.classList.add("hidden");
        }
    });
}

// Handle Type-Ahead Input
function handleStudentNameChange(e) {
    const typedValue = e.target.value.trim().toLowerCase();
    const suggestionsBox = document.getElementById("student-suggestions");

    selectedIndex = -1;

    if (typedValue.length < 2) {
        currentMatches = new Array();
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        resetStudentSelection();
        return;
    }

    // Filter roster for matching names
    currentMatches = studentsData.filter(s => {
        const cleanName = s.name.split(",").at(0).trim().toLowerCase();
        return cleanName.includes(typedValue);
    });

    if (currentMatches.length > 0) {
        renderSuggestions();
    } else {
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        resetStudentSelection();
    }
}

// Render Suggestions List with Highlight State
function renderSuggestions() {
    const suggestionsBox = document.getElementById("student-suggestions");
    suggestionsBox.innerHTML = "";

    currentMatches.forEach((student, idx) => {
        const cleanName = student.name.split(",").at(0).trim();

        const item = document.createElement("div");
        item.className = idx === selectedIndex ? "suggestion-item active" : "suggestion-item";
        item.textContent = cleanName;
        item.addEventListener("click", () => selectStudent(student));
        suggestionsBox.appendChild(item);
    });

    suggestionsBox.classList.remove("hidden");
}

// Handle Keyboard Navigation (Arrow Keys, Tab, Enter)
function handleStudentNameKeydown(e) {
    const suggestionsBox = document.getElementById("student-suggestions");
    if (suggestionsBox.classList.contains("hidden") || currentMatches.length === 0) {
        return;
    }

    if (e.key === "ArrowDown") {
        e.preventDefault();
        if (selectedIndex < currentMatches.length - 1) {
            selectedIndex++;
        } else {
            selectedIndex = 0;
        }
        renderSuggestions();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectedIndex > 0) {
            selectedIndex--;
        } else {
            selectedIndex = currentMatches.length - 1;
        }
        renderSuggestions();
    } else if (e.key === "Tab" || e.key === "Enter") {
        const targetIdx = selectedIndex >= 0 ? selectedIndex : 0;
        const chosenStudent = currentMatches.at(targetIdx);
        if (chosenStudent) {
            if (e.key === "Enter") e.preventDefault();
            selectStudent(chosenStudent);
        }
    }
}

// Lock in student selection when clicked or tabbed
function selectStudent(student) {
    const cleanName = student.name.split(",").at(0).trim();
    const cleanGrade = student.grade.trim();

    const nameInput = document.getElementById("student-name");
    const suggestionsBox = document.getElementById("student-suggestions");

    nameInput.value = cleanName;
    suggestionsBox.innerHTML = "";
    suggestionsBox.classList.add("hidden");

    currentSelectedStudent = {
        name: cleanName,
        grade: cleanGrade
    };

    const gradeBadge = document.getElementById("grade-badge");
    if (cleanGrade) {
        const displayGrade = cleanGrade.toLowerCase().includes("grade")
            ? cleanGrade
            : `${cleanGrade} Grade`;
        gradeBadge.textContent = displayGrade;
        gradeBadge.classList.remove("hidden");
    } else {
        gradeBadge.classList.add("hidden");
    }

    // Enable prompt options and fields
    document.getElementById("prompt1-select").disabled = false;
    document.getElementById("prompt2-select").disabled = false;
    document.getElementById("response1-text").disabled = false;
    document.getElementById("response2-text").disabled = false;
    document.getElementById("submit-btn").disabled = false;

    if (cleanGrade) {
        populateGradePrompts(cleanGrade);
    }
}

// Populate prompts filtered by student grade level
function populateGradePrompts(grade) {
    if (!grade) return;
    const safeGrade = String(grade).toLowerCase().trim();

    const filteredPrompts = promptsData.filter(p => p.grade.toLowerCase().trim() === safeGrade);
    const restrictedStandards = currentSelectedStudent ? getRestrictedStandards(currentSelectedStudent.name) : new Map();

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    let optionsHTML = `<option value="">-- Select a prompt --</option>`;

    filteredPrompts.forEach(p => {
        const restrictedUntil = restrictedStandards.get(p.standard);
        if (restrictedUntil) {
            const untilText = restrictedUntil.toLocaleDateString();
            optionsHTML += `<option value="${p.title}" data-id="${p.id}" data-restricted="true" disabled>${p.standard}: ${p.title} (locked until ${untilText})</option>`;
        } else {
            optionsHTML += `<option value="${p.title}" data-id="${p.id}">${p.standard}: ${p.title}</option>`;
        }
    });

    p1Select.innerHTML = optionsHTML;
    p2Select.innerHTML = optionsHTML;
}

// Determine which prompt standards are still in cooldown for this student
function getRestrictedStandards(studentName) {
    const restricted = new Map();
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    recentSubmissionsData.forEach(sub => {
        if (sub.studentName !== studentName) return;

        [sub.prompt1Title, sub.prompt2Title].forEach(title => {
            const promptObj = promptsData.find(p => p.title === title);
            if (!promptObj) return;

            const submittedAt = new Date(sub.timestamp).getTime();
            if (isNaN(submittedAt)) return;

            const nextEligible = new Date(submittedAt + cooldownMs);
            if (nextEligible.getTime() <= now) return;

            const existing = restricted.get(promptObj.standard);
            if (!existing || nextEligible > existing) {
                restricted.set(promptObj.standard, nextEligible);
            }
        });
    });

    return restricted;
}

// Reset selection state
function resetStudentSelection() {
    currentSelectedStudent = null;
    document.getElementById("grade-badge").classList.add("hidden");

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    p1Select.disabled = true;
    p2Select.disabled = true;
    document.getElementById("response1-text").disabled = true;
    document.getElementById("response2-text").disabled = true;
    document.getElementById("submit-btn").disabled = true;

    p1Select.innerHTML = `<option value="">-- Select your student name first --</option>`;
    p2Select.innerHTML = `<option value="">-- Select your student name first --</option>`;
    document.getElementById("prompt1-text").classList.add("hidden");
    document.getElementById("prompt2-text").classList.add("hidden");
}

function bindEvents() {
    // Bind student type-ahead input & keyboard listeners
    bindStudentNameEvents();

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    const form = document.getElementById("response-form");

    // Prompt dropdown changes
    p1Select.addEventListener("change", () => handlePromptSelect(1));
    p2Select.addEventListener("change", () => handlePromptSelect(2));

    // Form submission
    form.addEventListener("submit", handleFormSubmit);

    // Teacher modal & dashboard
    document.getElementById("teacher-access-btn").addEventListener("click", () => {
        document.getElementById("passcode-modal").classList.remove("hidden");
    });
    document.getElementById("close-modal-btn").addEventListener("click", () => {
        document.getElementById("passcode-modal").classList.add("hidden");
    });
    document.getElementById("verify-passcode-btn").addEventListener("click", handleTeacherLogin);
    document.getElementById("logout-btn").addEventListener("click", handleLogout);
    document.getElementById("refresh-responses-btn").addEventListener("click", loadTeacherResponses);
    document.getElementById("responses-container").addEventListener("click", handleResponsesContainerClick);

    // Add Student toggle & submit
    document.getElementById("add-student-toggle-btn").addEventListener("click", () => {
        document.getElementById("add-student-panel").classList.toggle("hidden");
    });
    document.getElementById("add-student-form").addEventListener("submit", handleAddStudent);
}

// Update prompt text descriptions and prevent duplicate choices
function handlePromptSelect(promptNum) {
    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");

    const selectedSelect = promptNum === 1 ? p1Select : p2Select;
    const siblingSelect = promptNum === 1 ? p2Select : p1Select;
    const targetDesc = document.getElementById(`prompt${promptNum}-text`);

    const selectedTitle = selectedSelect.value;
    const promptObj = promptsData.find(p => p.title === selectedTitle && p.grade.toLowerCase() === currentSelectedStudent.grade.toLowerCase());

    if (promptObj) {
        targetDesc.textContent = promptObj.text;
        targetDesc.classList.remove("hidden");
    } else {
        targetDesc.classList.add("hidden");
    }

    // Block the sibling dropdown from selecting the same prompt in this submission
    Array.from(siblingSelect.options).forEach(opt => {
        if (opt.value === "") return;
        opt.disabled = opt.dataset.restricted === "true" || (selectedTitle !== "" && opt.value === selectedTitle);
    });
    if (siblingSelect.value === selectedTitle && selectedTitle !== "") {
        siblingSelect.value = "";
        document.getElementById(`prompt${promptNum === 1 ? 2 : 1}-text`).classList.add("hidden");
    }
}

// Submit Response Form
async function handleFormSubmit(e) {
    e.preventDefault();
    if (!currentSelectedStudent) {
        showStatus("Please select a valid student from the roster.", "error");
        return;
    }

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");

    const p1Title = p1Select.value;
    const p2Title = p2Select.value;

    const payload = {
        studentName: currentSelectedStudent.name || "",
        gradeLevel: currentSelectedStudent.grade || "",
        bookTitle: document.getElementById("book-title").value.trim(),
        bookAuthor: document.getElementById("book-author").value.trim(),
        prompt1Title: p1Title,
        response1: document.getElementById("response1-text").value.trim(),
        prompt2Title: p2Title,
        response2: document.getElementById("response2-text").value.trim()
    };

    showStatus("Submitting your response...", "info");

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (json.success) {
            showStatus("Response submitted successfully! Great job!", "success");
            // Reflect this submission locally so the cooldown applies immediately, without waiting on a refetch
            recentSubmissionsData.push({
                studentName: payload.studentName,
                prompt1Title: payload.prompt1Title,
                prompt2Title: payload.prompt2Title,
                timestamp: new Date().toISOString()
            });
            document.getElementById("response-form").reset();
            resetStudentSelection();
        } else {
            showStatus(`Submission error: ${json.message}`, "error");
        }
    } catch (err) {
        showStatus("Error submitting response. Please try again.", "error");
    }
}

// Teacher Authentication
async function handleTeacherLogin() {
    const passcode = document.getElementById("passcode-input").value.trim();
    const errorText = document.getElementById("modal-error");

    if (!passcode) return;

    try {
        const res = await fetch(`${API_URL}?action=verifyPasscode&passcode=${encodeURIComponent(passcode)}`);
        const json = await res.json();

        if (json.success) {
            activePasscode = passcode;
            errorText.classList.add("hidden");
            document.getElementById("passcode-modal").classList.add("hidden");
            document.getElementById("student-view").classList.add("hidden");
            document.getElementById("teacher-view").classList.remove("hidden");
            document.getElementById("passcode-input").value = "";
            loadTeacherResponses();
        } else {
            errorText.classList.remove("hidden");
        }
    } catch (err) {
        errorText.textContent = "Server error verifying passcode.";
        errorText.classList.remove("hidden");
    }
}

function handleLogout() {
    activePasscode = "";
    document.getElementById("teacher-view").classList.add("hidden");
    document.getElementById("student-view").classList.remove("hidden");
}

// Fetch Responses for Teacher Dashboard
async function loadTeacherResponses() {
    const container = document.getElementById("responses-container");
    container.innerHTML = "<p>Loading student responses...</p>";

    try {
        const res = await fetch(`${API_URL}?action=getResponses&passcode=${encodeURIComponent(activePasscode)}`);
        const json = await res.json();

        if (json.success) {
            renderResponses(json.responses || []);
        } else {
            container.innerHTML = `<p class="error-text">Unauthorized or error loading responses.</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="error-text">Failed to fetch responses.</p>`;
    }
}

// Reading Response Rubric (6-10 point scale)
const RUBRIC = [
    { score: 6, label: "Incomplete / Off-Topic", desc: "Misses the point of the prompt entirely, is completely off-topic, or is so short it doesn't show any real effort or reading." },
    { score: 7, label: "Minimal Effort", desc: "Barely answers the question. Very short, missing key details, and lacks any text support. Feels rushed." },
    { score: 8, label: "Developing", desc: "Answers the prompt, but the response is a bit basic or brief. Missing strong text evidence or relies on vague summaries instead of specific book details." },
    { score: 9, label: "Proficient", desc: "Answers the prompt correctly and clearly. Includes good examples or details from the book, though maybe not quite as detailed as a 10. Shows solid understanding." },
    { score: 10, label: "Outstanding", desc: "Fully answers all parts of the prompt with deep thought. Uses strong, specific text evidence, quotes, or examples to back up the answer. Shows exceptional effort and high-quality writing." }
];

function renderRubricRow(responseId, promptNum, currentScore) {
    const buttons = RUBRIC.map(r => {
        const isSelected = Number(currentScore) === r.score;
        return `<button type="button" class="rubric-btn${isSelected ? " selected" : ""}" data-response-id="${escapeHtml(responseId)}" data-prompt-num="${promptNum}" data-score="${r.score}" data-tooltip="${escapeHtml(r.label)}: ${escapeHtml(r.desc)}">${r.score}</button>`;
    }).join("");
    return `<div class="rubric-row">${buttons}</div>`;
}

function renderCommentBlock(responseId, promptNum, currentComment) {
    return `<div class="comment-block">
      <label>Teacher Comment</label>
      <textarea class="comment-textarea" rows="2" data-response-id="${escapeHtml(responseId)}" data-prompt-num="${promptNum}" placeholder="Add feedback for this response...">${escapeHtml(currentComment || "")}</textarea>
      <button type="button" class="secondary-btn save-comment-btn" data-response-id="${escapeHtml(responseId)}" data-prompt-num="${promptNum}">Save Comment</button>
      <span class="comment-saved-msg hidden">Saved!</span>
    </div>`;
}

// Render Teacher Dashboard Cards
function renderResponses(responses) {
    const container = document.getElementById("responses-container");

    if (!responses || responses.length === 0) {
        container.innerHTML = "<p>No responses submitted yet.</p>";
        return;
    }

    container.innerHTML = "";

    responses.slice().reverse().forEach(resp => {
        const card = document.createElement("div");
        card.className = "response-card";

        let formattedDate = "N/A";
        if (resp.timestamp) {
            const parsed = new Date(resp.timestamp);
            formattedDate = !isNaN(parsed.getTime())
                ? parsed.toLocaleDateString()
                : String(resp.timestamp).split("T").at(0);
        }

        // Falls back to the raw timestamp when the sheet has no dedicated row id
        const responseId = resp.id || resp.timestamp || "";
        const sName = resp.studentName || "Unknown Student";
        const gLevel = resp.gradeLevel ? ` (${resp.gradeLevel})` : "";
        const bTitle = resp.bookTitle || "Untitled Book";
        const bAuthor = resp.bookAuthor ? ` by ${resp.bookAuthor}` : "";

        const p1Title = resp.prompt1Title || "Prompt 1";
        const r1Text = resp.response1 || "No response provided.";

        const p2Title = resp.prompt2Title || "Prompt 2";
        const r2Text = resp.response2 || "No response provided.";

        card.innerHTML = `
      <div class="card-header">
        <strong>${escapeHtml(sName)}${escapeHtml(gLevel)}</strong>
        <span class="date">${escapeHtml(formattedDate)}</span>
        <button type="button" class="delete-response-btn" data-response-id="${escapeHtml(responseId)}">🗑 Delete</button>
      </div>
      <p class="book-info">📖 <em>${escapeHtml(bTitle)}</em>${escapeHtml(bAuthor)}</p>
      <div class="resp-block">
        <strong>${escapeHtml(p1Title)}</strong>
        <p>${escapeHtml(r1Text)}</p>
        ${renderRubricRow(responseId, 1, resp.score1)}
        ${renderCommentBlock(responseId, 1, resp.comment1)}
      </div>
      <div class="resp-block">
        <strong>${escapeHtml(p2Title)}</strong>
        <p>${escapeHtml(r2Text)}</p>
        ${renderRubricRow(responseId, 2, resp.score2)}
        ${renderCommentBlock(responseId, 2, resp.comment2)}
      </div>
    `;

        container.appendChild(card);
    });
}

// Route clicks within the responses list to the rubric or delete handlers
function handleResponsesContainerClick(e) {
    if (e.target.closest(".rubric-btn")) {
        handleRubricClick(e);
    } else if (e.target.closest(".delete-response-btn")) {
        handleDeleteResponse(e);
    } else if (e.target.closest(".save-comment-btn")) {
        handleSaveComment(e);
    }
}

// Save a rubric score for a single prompt response (optimistic UI, reverts on failure)
async function handleRubricClick(e) {
    const btn = e.target.closest(".rubric-btn");
    if (!btn || btn.classList.contains("selected")) return;

    const responseId = btn.dataset.responseId;
    const promptNum = btn.dataset.promptNum;
    const score = btn.dataset.score;
    const row = btn.parentElement;
    const siblingButtons = Array.from(row.querySelectorAll(".rubric-btn"));
    const previousSelected = siblingButtons.find(b => b.classList.contains("selected"));

    siblingButtons.forEach(b => b.classList.toggle("selected", b === btn));

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "scoreResponse",
                passcode: activePasscode,
                responseId,
                promptNum: Number(promptNum),
                score: Number(score)
            })
        });
        const json = await res.json();

        if (!json.success) {
            siblingButtons.forEach(b => b.classList.toggle("selected", b === previousSelected));
            alert(`Failed to save score: ${json.message || "Unknown error"}`);
        }
    } catch (err) {
        siblingButtons.forEach(b => b.classList.toggle("selected", b === previousSelected));
        alert("Failed to save score. Check your connection.");
    }
}

// Save a teacher comment for a single prompt response
async function handleSaveComment(e) {
    const btn = e.target.closest(".save-comment-btn");
    if (!btn) return;

    const responseId = btn.dataset.responseId;
    const promptNum = btn.dataset.promptNum;
    const block = btn.closest(".comment-block");
    const textarea = block.querySelector(".comment-textarea");
    const savedMsg = block.querySelector(".comment-saved-msg");
    const comment = textarea.value.trim();

    btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "saveComment",
                passcode: activePasscode,
                responseId,
                promptNum: Number(promptNum),
                comment
            })
        });
        const json = await res.json();

        if (json.success) {
            savedMsg.classList.remove("hidden");
            setTimeout(() => savedMsg.classList.add("hidden"), 2000);
        } else {
            alert(`Failed to save comment: ${json.message || "Unknown error"}`);
        }
    } catch (err) {
        alert("Failed to save comment. Check your connection.");
    } finally {
        btn.disabled = false;
    }
}

// Permanently delete a response card, both on screen and in the Google Sheet
async function handleDeleteResponse(e) {
    const btn = e.target.closest(".delete-response-btn");
    if (!btn || btn.disabled) return;

    if (!confirm("Delete this response permanently? This cannot be undone.")) return;

    const responseId = btn.dataset.responseId;
    const card = btn.closest(".response-card");
    btn.disabled = true;

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "deleteResponse",
                passcode: activePasscode,
                responseId
            })
        });
        const json = await res.json();

        if (json.success) {
            card.remove();
        } else {
            alert(`Failed to delete response: ${json.message || "Unknown error"}`);
            btn.disabled = false;
        }
    } catch (err) {
        alert("Failed to delete response. Check your connection.");
        btn.disabled = false;
    }
}

// Add New Student
async function handleAddStudent(e) {
    e.preventDefault();
    const name = document.getElementById("new-student-name").value.trim();
    const grade = document.getElementById("new-student-grade").value;
    const statusBox = document.getElementById("add-student-status");

    const payload = {
        action: "addStudent",
        passcode: activePasscode,
        studentName: name,
        gradeLevel: grade
    };

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (json.success) {
            statusBox.textContent = `Student "${name}" added successfully!`;
            statusBox.className = "status-box success";
            statusBox.classList.remove("hidden");
            document.getElementById("add-student-form").reset();
            await loadInitialData(); // Refresh roster
        } else {
            statusBox.textContent = `Error: ${json.message}`;
            statusBox.className = "status-box error";
            statusBox.classList.remove("hidden");
        }
    } catch (err) {
        statusBox.textContent = "Failed to add student.";
        statusBox.className = "status-box error";
        statusBox.classList.remove("hidden");
    }
}

// Helper Utilities
function showStatus(message, type) {
    const statusMsg = document.getElementById("status-message");
    statusMsg.textContent = message;
    statusMsg.className = `status-box ${type}`;
    statusMsg.classList.remove("hidden");
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}