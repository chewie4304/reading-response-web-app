// ==========================================
// 1. SUPABASE INITIALIZATION & INITIAL DATA
// ==========================================

// Initialize Supabase Client
const SUPABASE_URL = "https://pnpudjetvfshnmysnmn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucHVkamV0dmZzaG5teXN5bm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTY5MTksImV4cCI6MjEwMjgzMjkxOX0._XLKuDsEg3OUyJ0fGIQbsvvcLUG3GBvJtUR3tcuwt5M";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    try {
        // 1. Fetch Student Roster
        const { data: students, error: studentErr } = await db
            .from('reading_students')
            .select('name, grade');

        // 2. Fetch Curriculum Prompts
        const { data: prompts, error: promptErr } = await db
            .from('reading_prompts')
            .select('*');

        if (studentErr || promptErr) {
            throw new Error("Failed to query initial data from Supabase.");
        }

        studentsData = students || new Array();
        promptsData = prompts || new Array();

        console.log(`Loaded ${studentsData.length} students and ${promptsData.length} prompts.`);
    } catch (err) {
        console.error("Initial data load error:", err);
        showStatus("Error connecting to database server.", "error");
    }
}

// ==========================================
// 2. STUDENT SEARCH & PROMPT SELECTION
// ==========================================

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

// ==========================================
// 3. STUDENT FORM SUBMISSION
// ==========================================

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

// Submit Response Form
async function handleFormSubmit(e) {
    e.preventDefault();

    const payload = {
        student_name: currentSelectedStudent.name,
        grade_level: currentSelectedStudent.grade,
        book_title: document.getElementById("book-title").value.trim(),
        book_author: document.getElementById("book-author").value.trim(),
        prompt1_title: document.getElementById("prompt1-select").value,
        response1: document.getElementById("response1-text").value.trim(),
        prompt2_title: document.getElementById("prompt2-select").value,
        response2: document.getElementById("response2-text").value.trim()
    };

    const { error } = await db.from('reading_responses').insert([payload]);

    if (!error) {
        showStatus("Response submitted successfully!", "success");
        document.getElementById("response-form").reset();
        resetStudentSelection();
    } else {
        showStatus("Submission error. Please try again.", "error");
    }
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

// ==========================================
// 4. TEACHER AUTHENTICATION & DASHBOARD
// ==========================================

async function verifyTeacherPasscode(inputPasscode) {
    try {
        const { data, error } = await db
            .from('reading_settings')
            .select('value')
            .eq('key', 'passcode')
            .single();

        if (error || !data) {
            return inputPasscode === "1234"; // Default fallback
        }

        return inputPasscode.trim() === String(data.value).trim();
    } catch (err) {
        console.error("Passcode verification error:", err);
        return false;
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

// Fetch Responses for Teacher Dashboard
async function loadTeacherResponses() {
    showStatus("Loading student responses...", "info");

    const { data: responses, error } = await db
        .from('reading_responses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fetch responses error:", error);
        showStatus("Error loading student responses.", "error");
        return;
    }

    renderResponses(responses || new Array());
}

function handleLogout() {
    activePasscode = "";
    document.getElementById("teacher-view").classList.add("hidden");
    document.getElementById("student-view").classList.remove("hidden");
}

// ==========================================
// 5. DASHBOARD RENDERING & EVALUATIONS
// ==========================================

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

async function saveScoreAndComment(responseId, scoreNum, scoreVal, commentVal) {
    const updatePayload = {};

    if (scoreNum === 1) {
        if (scoreVal !== null) updatePayload.score1 = scoreVal;
        if (commentVal !== null) updatePayload.comment1 = commentVal;
    } else if (scoreNum === 2) {
        if (scoreVal !== null) updatePayload.score2 = scoreVal;
        if (commentVal !== null) updatePayload.comment2 = commentVal;
    }

    const { error } = await db
        .from('reading_responses')
        .update(updatePayload)
        .eq('id', responseId);

    if (error) {
        console.error("Evaluation update error:", error);
        showStatus("Failed to save evaluation.", "error");
    } else {
        showStatus("Saved feedback!", "success");
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

// ==========================================
// 6. ROSTER MANAGEMENT & EXPORTS
// ==========================================

// Add New Student
async function handleAddStudent(name, grade) {
    const { error } = await db
        .from('reading_students')
        .insert([{ name: name.trim(), grade: grade.trim() }]);

    if (!error) {
        showStatus(`Added ${name} (${grade}) to roster.`, "success");
        await loadInitialData(); // Refresh local roster
    } else {
        console.error("Add student error:", error);
        showStatus("Failed to add student to roster.", "error");
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

// Export loaded responses to CSV for teacher gradebooks
function exportResponsesToCsv() {
  if (!allFetchedResponses || allFetchedResponses.length === 0) {
    showStatus("No responses available to export.", "error");
    return;
  }

  const headers = [
    "Timestamp",
    "Student Name",
    "Grade Level",
    "Book Title",
    "Book Author",
    "Prompt 1 Title",
    "Response 1",
    "Score 1",
    "Comment 1",
    "Prompt 2 Title",
    "Response 2",
    "Score 2",
    "Comment 2"
  ];

  const csvRows = [];
  csvRows.push(headers.join(","));

  allFetchedResponses.forEach(r => {
    const row = [
      `"${String(r.created_at || r.timestamp || '').replace(/"/g, '""')}"`,
      `"${String(r.student_name || r.studentName || '').replace(/"/g, '""')}"`,
      `"${String(r.grade_level || r.gradeLevel || '').replace(/"/g, '""')}"`,
      `"${String(r.book_title || r.bookTitle || '').replace(/"/g, '""')}"`,
      `"${String(r.book_author || r.bookAuthor || '').replace(/"/g, '""')}"`,
      `"${String(r.prompt1_title || r.prompt1Title || '').replace(/"/g, '""')}"`,
      `"${String(r.response1 || '').replace(/"/g, '""')}"`,
      `"${r.score1 !== null && r.score1 !== undefined ? r.score1 : ''}"`,
      `"${String(r.comment1 || '').replace(/"/g, '""')}"`,
      `"${String(r.prompt2_title || r.prompt2Title || '').replace(/"/g, '""')}"`,
      `"${String(r.response2 || '').replace(/"/g, '""')}"`,
      `"${r.score2 !== null && r.score2 !== undefined ? r.score2 : ''}"`,
      `"${String(r.comment2 || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(","));
  });

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `reading_responses_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}