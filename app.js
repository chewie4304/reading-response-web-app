// ==========================================
// 1. SUPABASE INITIALIZATION & INITIAL DATA
// ==========================================
const SUPABASE_URL = "https://pnpudjetvfshnmysynmn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucHVkamV0dmZzaG5teXN5bm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTY5MTksImV4cCI6MjEwMjgzMjkxOX0._XLKuDsEg3OUyJ0fGIQbsvvcLUG3GBvJtUR3tcuwt5M";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global App State
let studentsData = [];
let promptsData = [];
let recentSubmissionsData = [];
let allFetchedResponses = [];
let cooldownDays = 14;
let currentSelectedStudent = null;
let activePasscode = "";
let currentMatches = [];
let selectedIndex = -1;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    bindEvents();
    await loadInitialData();
}

async function loadInitialData() {
    try {
        // 1. Fetch Student Roster (include id for edit/delete)
        const { data: students, error: studentErr } = await db
            .from('reading_students')
            .select('id, name, grade')
            .order('name', { ascending: true });

        // 2. Fetch Curriculum Prompts
        const { data: prompts, error: promptErr } = await db
            .from('reading_prompts')
            .select('*');

        if (studentErr || promptErr) {
            throw new Error("Failed to query initial data from Supabase.");
        }

        studentsData = students || [];
        promptsData = prompts || [];

        // Render roster on Teacher Dashboard if visible
        renderRoster();
    } catch (err) {
        console.error("Initial data load error:", err);
        showStatus("Error connecting to database server.", "error");
    }
}

// ==========================================
// 2. STUDENT SEARCH & PROMPT SELECTION
// ==========================================
function bindStudentNameEvents(inputId, suggestionsId, onSelect) {
    const nameInput = document.getElementById(inputId);
    if (!nameInput) return;

    nameInput.addEventListener("input", (e) => handleStudentNameChange(e, suggestionsId, onSelect));
    nameInput.addEventListener("keydown", (e) => handleStudentNameKeydown(e, suggestionsId, onSelect));

    document.addEventListener("click", (e) => {
        if (e.target !== nameInput) {
            const suggestionsBox = document.getElementById(suggestionsId);
            if (suggestionsBox) suggestionsBox.classList.add("hidden");
        }
    });
}

function handleStudentNameChange(e, suggestionsId, onSelect) {
    const typedValue = e.target.value.trim().toLowerCase();
    const suggestionsBox = document.getElementById(suggestionsId);
    selectedIndex = -1;

    if (typedValue.length < 2) {
        currentMatches = [];
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        resetStudentSelection();
        return;
    }

    currentMatches = studentsData.filter(s => {
        const cleanName = s.name.split(",").at(0).trim().toLowerCase();
        return cleanName.includes(typedValue);
    });

    if (currentMatches.length > 0) {
        renderSuggestions(suggestionsBox, onSelect);
    } else {
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        resetStudentSelection();
    }
}

function renderSuggestions(suggestionsBox, onSelect) {
    suggestionsBox.innerHTML = "";

    currentMatches.forEach((student, idx) => {
        const cleanName = student.name.split(",").at(0).trim();
        const item = document.createElement("div");
        item.className = idx === selectedIndex ? "suggestion-item active" : "suggestion-item";
        item.textContent = cleanName;
        item.addEventListener("click", () => onSelect(student));
        suggestionsBox.appendChild(item);
    });

    suggestionsBox.classList.remove("hidden");
}

function handleStudentNameKeydown(e, suggestionsId, onSelect) {
    const suggestionsBox = document.getElementById(suggestionsId);
    if (suggestionsBox.classList.contains("hidden") || currentMatches.length === 0) {
        return;
    }

    if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = selectedIndex < currentMatches.length - 1 ? selectedIndex + 1 : 0;
        renderSuggestions(suggestionsBox, onSelect);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : currentMatches.length - 1;
        renderSuggestions(suggestionsBox, onSelect);
    } else if (e.key === "Tab" || e.key === "Enter") {
        const targetIdx = selectedIndex >= 0 ? selectedIndex : 0;
        const chosenStudent = currentMatches.at(targetIdx);
        if (chosenStudent) {
            if (e.key === "Enter") e.preventDefault();
            onSelect(chosenStudent);
        }
    }
}

async function selectStudent(student) {
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

    document.getElementById("prompt1-select").disabled = false;
    document.getElementById("prompt2-select").disabled = false;
    document.getElementById("response1-text").disabled = false;
    document.getElementById("response2-text").disabled = false;
    document.getElementById("submit-btn").disabled = false;

    // Fetch recent student responses from Supabase to calculate 14-day cooldown locks
    const { data: history } = await db
        .from('reading_responses')
        .select('*')
        .eq('student_name', cleanName);

    recentSubmissionsData = history || [];

    if (cleanGrade) {
        populateGradePrompts(cleanGrade);
    }

    loadStudentHistory(cleanName);
    loadStudentLog(cleanName);
}

function handleLoginStudentSelect(student) {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("student-view").classList.remove("hidden");
    document.getElementById("teacher-access-btn").classList.remove("invisible");
    selectStudent(student);
}

function populateGradePrompts(grade) {
    if (!grade) return;
    const safeGrade = String(grade).toLowerCase().replace("grade", "").trim();
    const filteredPrompts = promptsData.filter(p => p.grade.toLowerCase().replace("grade", "").trim() === safeGrade);
    const restrictedPrompts = currentSelectedStudent ? getRestrictedPrompts(currentSelectedStudent.name) : new Map();

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");

    let optionsHTML = `<option value="">-- Select a prompt --</option>`;

    filteredPrompts.forEach(p => {
        const restrictedUntil = restrictedPrompts.get(p.title.trim());
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

    // Hide history panel when student selection is reset
    document.getElementById("student-history-panel")?.classList.add("hidden");
    document.getElementById("student-log-panel")?.classList.add("hidden");

}

// ==========================================
// 3. STUDENT FORM SUBMISSION & COOLDOWNS
// ==========================================
function bindEvents() {
    bindStudentNameEvents("student-name", "student-suggestions", selectStudent);
    bindStudentNameEvents("login-student-name", "login-student-suggestions", handleLoginStudentSelect);
    bindPasscodeManagementEvents();

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    const form = document.getElementById("response-form");

    p1Select.addEventListener("change", () => handlePromptSelect(1));
    p2Select.addEventListener("change", () => handlePromptSelect(2));
    form.addEventListener("submit", handleFormSubmit);

    document.getElementById("teacher-access-btn").addEventListener("click", openPasscodeModal);

    document.getElementById("login-teacher-btn").addEventListener("click", openPasscodeModal);

    document.getElementById("close-modal-btn").addEventListener("click", () => {
        document.getElementById("passcode-modal").classList.add("hidden");
    });

    document.getElementById("verify-passcode-btn").addEventListener("click", handleTeacherLogin);
    document.getElementById("passcode-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleTeacherLogin();
        }
    });
    document.getElementById("logout-btn").addEventListener("click", handleLogout);
    document.getElementById("refresh-responses-btn").addEventListener("click", loadTeacherResponses);
    const responsesContainer = document.getElementById("responses-container");
    responsesContainer.addEventListener("click", handleResponsesContainerClick);
    responsesContainer.addEventListener("input", handleCommentInput);

    const detailResponsesContainer = document.getElementById("detail-responses-container");
    detailResponsesContainer.addEventListener("click", handleResponsesContainerClick);
    detailResponsesContainer.addEventListener("input", handleCommentInput);

    document.getElementById("add-student-toggle-btn").addEventListener("click", () => {
        document.getElementById("add-student-panel").classList.toggle("hidden");
    });

    // Inside bindEvents()
    document.getElementById("toggle-history-btn")?.addEventListener("click", () => {
        const container = document.getElementById("history-container");
        const toggleBtn = document.getElementById("toggle-history-btn");
        if (!container || !toggleBtn) return;
        container.classList.toggle("hidden");
        toggleBtn.textContent = container.classList.contains("hidden") ? "Show" : "Hide";
    });

    document.getElementById("toggle-log-btn")?.addEventListener("click", () => {
        const container = document.getElementById("student-log-container");
        const toggleBtn = document.getElementById("toggle-log-btn");
        if (!container || !toggleBtn) return;
        container.classList.toggle("hidden");
        toggleBtn.textContent = container.classList.contains("hidden") ? "Show" : "Hide";
    });

    document.getElementById("add-student-form").addEventListener("submit", handleAddStudent);

    const logDateInput = document.getElementById("log-date");
    if (logDateInput) logDateInput.value = new Date().toLocaleDateString("en-CA");
    document.getElementById("reading-log-form")?.addEventListener("submit", handleReadingLogSubmit);

    document.getElementById("back-to-dashboard-btn")?.addEventListener("click", () => {
        document.getElementById("student-detail-view").classList.add("hidden");
        document.getElementById("teacher-view").classList.remove("hidden");
    });
}

function getRestrictedPrompts(studentName) {
    const restricted = new Map();
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000; // 14-day cooldown
    const now = Date.now();

    recentSubmissionsData.forEach(sub => {
        const sName = sub.student_name || sub.studentName;
        if (sName !== studentName) return;

        const p1 = sub.prompt1_title || sub.prompt1Title;
        const p2 = sub.prompt2_title || sub.prompt2Title;
        const rawDate = sub.created_at || sub.timestamp;

        [p1, p2].forEach(title => {
            if (!title) return;

            const submittedAt = new Date(rawDate).getTime();
            if (isNaN(submittedAt)) return;

            const nextEligible = new Date(submittedAt + cooldownMs);
            if (nextEligible.getTime() <= now) return;

            const trimmedTitle = title.trim();
            const existing = restricted.get(trimmedTitle);
            if (!existing || nextEligible > existing) {
                restricted.set(trimmedTitle, nextEligible);
            }
        });
    });

    return restricted;
}

function handlePromptSelect(promptNum) {
    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    const selectedSelect = promptNum === 1 ? p1Select : p2Select;
    const siblingSelect = promptNum === 1 ? p2Select : p1Select;
    const targetDesc = document.getElementById(`prompt${promptNum}-text`);

    const selectedTitle = selectedSelect.value;
    const safeGrade = currentSelectedStudent ? currentSelectedStudent.grade.toLowerCase().replace("grade", "").trim() : "";
    const promptObj = promptsData.find(p => p.title === selectedTitle && p.grade.toLowerCase().replace("grade", "").trim() === safeGrade);

    if (promptObj) {
        targetDesc.textContent = promptObj.text;
        targetDesc.classList.remove("hidden");
    } else {
        targetDesc.classList.add("hidden");
    }

    Array.from(siblingSelect.options).forEach(opt => {
        if (opt.value === "") return;
        opt.disabled = opt.dataset.restricted === "true" || (selectedTitle !== "" && opt.value === selectedTitle);
    });

    if (siblingSelect.value === selectedTitle && selectedTitle !== "") {
        siblingSelect.value = "";
        document.getElementById(`prompt${promptNum === 1 ? 2 : 1}-text`).classList.add("hidden");
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    if (!currentSelectedStudent) {
        showStatus("Please select a valid student from the roster.", "error");
        return;
    }

    const p1 = document.getElementById("prompt1-select").value;
    const p2 = document.getElementById("prompt2-select").value;

    if (!p1 || !p2) {
        showStatus("Please select both prompts before submitting.", "error");
        return;
    }

    if (p1 === p2) {
        showStatus("Please choose two different prompts.", "error");
        return;
    }

    const payload = {
        student_name: currentSelectedStudent.name,
        grade_level: currentSelectedStudent.grade,
        book_title: document.getElementById("book-title").value.trim(),
        book_author: document.getElementById("book-author").value.trim(),
        prompt1_title: p1,
        response1: document.getElementById("response1-text").value.trim(),
        prompt2_title: p2,
        response2: document.getElementById("response2-text").value.trim()
    };

    showStatus("Submitting your response...", "info");

    const { error } = await db.from('reading_responses').insert([payload]);

    if (!error) {
        showStatus("Response submitted successfully!", "success");
        document.getElementById("response-form").reset();
        document.getElementById("student-name").value = "";
        resetStudentSelection();
        await loadInitialData();
    } else {
        console.error("Submission error:", error);
        showStatus("Submission error. Please try again.", "error");
    }
}

function showLogStatus(message, type) {
    const statusBox = document.getElementById("log-status-message");
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = `status-box ${type}`;
}

async function handleReadingLogSubmit(e) {
    e.preventDefault();

    if (!currentSelectedStudent) {
        showLogStatus("Please select your name before adding a log entry.", "error");
        return;
    }

    const pageStart = Number(document.getElementById("log-page-start").value);
    const pageEnd = Number(document.getElementById("log-page-end").value);

    if (pageEnd < pageStart) {
        showLogStatus("The ending page must be the same as or after the starting page.", "error");
        return;
    }

    const payload = {
        student_name: currentSelectedStudent.name,
        log_date: document.getElementById("log-date").value,
        book_title: document.getElementById("log-title").value.trim(),
        minutes_read: Number(document.getElementById("log-time").value),
        page_start: pageStart,
        page_end: pageEnd
    };

    showLogStatus("Saving log entry...", "info");

    const { error } = await db.from('reading_log').insert([payload]);

    if (!error) {
        showLogStatus("Log entry saved!", "success");
        document.getElementById("reading-log-form").reset();
        document.getElementById("log-date").value = new Date().toLocaleDateString("en-CA");
        await loadStudentLog(currentSelectedStudent.name);
    } else {
        console.error("Reading log error:", error);
        showLogStatus("Unable to save log entry. Please try again.", "error");
    }
}

async function loadStudentLog(studentName) {
    const panel = document.getElementById("student-log-panel");
    const container = document.getElementById("student-log-container");
    const countSpan = document.getElementById("log-count");
    const toggleBtn = document.getElementById("toggle-log-btn");

    if (!panel || !container) return;

    // Auto-collapse the log list when the panel first appears for a newly
    // selected student; refreshes (add/edit/delete) preserve the toggle state.
    const isFirstLoad = panel.classList.contains("hidden");
    panel.classList.remove("hidden");
    if (isFirstLoad) {
        container.classList.add("hidden");
        if (toggleBtn) toggleBtn.textContent = "Show";
    }

    container.innerHTML = "<p>Loading your reading log...</p>";

    const { data: entries, error } = await db
        .from('reading_log')
        .select('*')
        .eq('student_name', studentName)
        .order('log_date', { ascending: false });

    if (error) {
        console.error("Fetch student log error:", error);
        container.innerHTML = "<p>Unable to load reading log.</p>";
        return;
    }

    currentStudentLogEntries = entries || [];
    if (countSpan) countSpan.textContent = currentStudentLogEntries.length;
    renderStudentLogEntries(currentStudentLogEntries);
}

function renderStudentLogEntries(entries) {
    const container = document.getElementById("student-log-container");
    if (!container) return;

    if (entries.length === 0) {
        container.innerHTML = "<p style='color: var(--muted); font-size: 0.9rem;'>No reading log entries yet.</p>";
        return;
    }

    const weekTotals = new Map();
    entries.forEach(entry => {
        const key = getWeekKey(entry.log_date);
        if (!key) return;
        const totals = weekTotals.get(key) || { minutes: 0, pages: 0 };
        totals.minutes += Number(entry.minutes_read) || 0;
        totals.pages += (Number(entry.page_end) || 0) - (Number(entry.page_start) || 0) + 1;
        weekTotals.set(key, totals);
    });

    let html = "";
    let lastWeekKey = null;

    entries.forEach(entry => {
        const weekKey = getWeekKey(entry.log_date);
        if (weekKey && weekKey !== lastWeekKey) {
            const totals = weekTotals.get(weekKey);
            html += `<div class="month-total">📅 <strong>${escapeHtml(getWeekLabel(weekKey))}</strong> — Total: ${totals.minutes} min, ${totals.pages} pages</div>`;
            lastWeekKey = weekKey;
        }

        const pageStart = Number(entry.page_start) || 0;
        const pageEnd = Number(entry.page_end) || 0;
        const pageCount = pageEnd - pageStart + 1;

        html += `<div class="log-entry">
            <span class="log-date">${escapeHtml(formatLogDate(entry.log_date))}</span>
            <span class="log-title">📖 <em>${escapeHtml(entry.book_title || "Untitled")}</em></span>
            <span class="log-stats">${Number(entry.minutes_read) || 0} min &middot; pages ${pageStart}&ndash;${pageEnd} (${pageCount} pages)</span>
            <span class="log-actions">
                <button type="button" class="secondary-btn log-edit-btn" data-id="${entry.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; margin-right: 0.25rem;">✏️ Edit</button>
                <button type="button" class="delete-response-btn log-delete-btn" data-id="${entry.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">🗑 Delete</button>
            </span>
        </div>`;
    });

    container.innerHTML = html;
}

document.getElementById("student-log-container")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".log-edit-btn");
    const deleteBtn = e.target.closest(".log-delete-btn");
    if (!editBtn && !deleteBtn) return;

    const modal = document.getElementById("student-modal");
    const modalTitle = document.getElementById("student-modal-title");
    const modalBody = document.getElementById("student-modal-body");
    const confirmBtn = document.getElementById("student-modal-confirm-btn");

    const entryId = (editBtn || deleteBtn).dataset.id;
    const entry = currentStudentLogEntries.find(l => String(l.id) === String(entryId));
    if (!entry) return;

    if (deleteBtn) {
        modalTitle.textContent = "Confirm Deletion";
        modalBody.innerHTML = `<p style="margin:0;">Delete the log entry for <strong>${escapeHtml(entry.book_title || "this book")}</strong> on <strong>${escapeHtml(formatLogDate(entry.log_date))}</strong>?</p>`;
        confirmBtn.textContent = "Delete Entry";
        confirmBtn.className = "delete-response-btn";

        pendingRosterAction = async () => {
            const { error } = await db.from('reading_log').delete().eq('id', entryId);
            if (!error) {
                showLogStatus("Log entry deleted.", "success");
                if (currentSelectedStudent) await loadStudentLog(currentSelectedStudent.name);
            } else {
                console.error("Log delete error:", error);
                showLogStatus("Failed to delete log entry.", "error");
            }
        };

        modal.classList.remove("hidden");
    }

    if (editBtn) {
        modalTitle.textContent = "Edit Log Entry";
        modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Date</label>
          <input type="date" id="edit-log-date" value="${escapeHtml(entry.log_date || "")}" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
        </div>
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Title</label>
          <input type="text" id="edit-log-title" value="${escapeHtml(entry.book_title || "")}" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
        </div>
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Time Read (minutes)</label>
          <input type="number" id="edit-log-time" min="1" value="${Number(entry.minutes_read) || ""}" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
        </div>
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Pages Read</label>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="color: var(--muted); font-size: 0.9rem;">from page</span>
            <input type="number" id="edit-log-page-start" min="1" value="${Number(entry.page_start) || ""}" style="width:5.5rem; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
            <span style="color: var(--muted); font-size: 0.9rem;">to page</span>
            <input type="number" id="edit-log-page-end" min="1" value="${Number(entry.page_end) || ""}" style="width:5.5rem; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
          </div>
        </div>
      </div>
    `;
        confirmBtn.textContent = "Save Changes";
        confirmBtn.className = "";

        pendingRosterAction = async () => {
            const newDate = document.getElementById("edit-log-date").value;
            const newTitle = document.getElementById("edit-log-title").value.trim();
            const newTime = Number(document.getElementById("edit-log-time").value);
            const newStart = Number(document.getElementById("edit-log-page-start").value);
            const newEnd = Number(document.getElementById("edit-log-page-end").value);

            if (!newDate || !newTitle || !newTime || !newStart || !newEnd) return;

            if (newEnd < newStart) {
                showLogStatus("The ending page must be the same as or after the starting page.", "error");
                return;
            }

            const { error } = await db
                .from('reading_log')
                .update({
                    log_date: newDate,
                    book_title: newTitle,
                    minutes_read: newTime,
                    page_start: newStart,
                    page_end: newEnd
                })
                .eq('id', entryId);

            if (!error) {
                showLogStatus("Log entry updated.", "success");
                if (currentSelectedStudent) await loadStudentLog(currentSelectedStudent.name);
            } else {
                console.error("Log update error:", error);
                showLogStatus("Failed to update log entry.", "error");
            }
        };

        modal.classList.remove("hidden");
    }
});

// ==========================================
// 4. TEACHER AUTHENTICATION & DASHBOARD
// ==========================================
function openPasscodeModal() {
    document.getElementById("passcode-modal").classList.remove("hidden");
    document.getElementById("passcode-input").focus();
}

async function verifyTeacherPasscode(inputPasscode) {
    try {
        const { data, error } = await db
            .from('reading_settings')
            .select('value')
            .eq('key', 'passcode')
            .single();

        if (error || !data) {
            return inputPasscode === "1234";
        }
        return inputPasscode.trim() === String(data.value).trim();
    } catch (err) {
        console.error("Passcode verification error:", err);
        return false;
    }
}

async function handleTeacherLogin() {
    const passcode = document.getElementById("passcode-input").value.trim();
    const errorText = document.getElementById("modal-error");
    if (!passcode) return;

    const isValid = await verifyTeacherPasscode(passcode);

    if (isValid) {
        activePasscode = passcode;
        errorText.classList.add("hidden");
        document.getElementById("passcode-modal").classList.add("hidden");
        document.getElementById("login-view").classList.add("hidden");
        document.getElementById("student-view").classList.add("hidden");
        document.getElementById("teacher-view").classList.remove("hidden");
        document.getElementById("teacher-access-btn").classList.add("invisible");
        document.getElementById("passcode-input").value = "";
        await loadTeacherResponses();
    } else {
        errorText.textContent = "Incorrect passcode.";
        errorText.classList.remove("hidden");
    }
}

function handleLogout() {
    activePasscode = "";
    document.getElementById("teacher-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("teacher-access-btn").classList.add("invisible");
}

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

    allFetchedResponses = responses || [];
    renderResponses(allFetchedResponses);
}

// ==========================================
// 5. DASHBOARD RENDERING & EVALUATIONS
// ==========================================
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
        const savedComment = String(currentComment || "").trim();
    return `<div class="comment-block">
    <label>Teacher Comment</label>
        <textarea class="comment-textarea" rows="2" data-response-id="${escapeHtml(responseId)}" data-prompt-num="${promptNum}" data-saved-comment="${escapeHtml(savedComment)}" placeholder="Add feedback for this response...">${escapeHtml(currentComment || "")}</textarea>
    <button type="button" class="secondary-btn save-comment-btn" data-response-id="${escapeHtml(responseId)}" data-prompt-num="${promptNum}">Save Comment</button>
        <span class="comment-status">Saved</span>
  </div>`;
}

function getPromptDescription(title, gradeLevel) {
        const normalizeGrade = grade => String(grade || "").toLowerCase().replace("grade", "").trim();
        const matchingPrompts = promptsData.filter(prompt => prompt.title === title);
        const matchingGradePrompt = matchingPrompts.find(prompt => normalizeGrade(prompt.grade) === normalizeGrade(gradeLevel));
        return (matchingGradePrompt || matchingPrompts[0])?.text || "";
}

function renderResponses(responses) {
    const container = document.getElementById("responses-container");

    if (!responses || responses.length === 0) {
        container.innerHTML = "<p>No responses submitted yet.</p>";
        return;
    }

    container.innerHTML = "";

    responses.forEach(resp => {
        const card = document.createElement("div");
        card.className = "response-card";

        let formattedDate = "N/A";
        const rawDate = resp.created_at || resp.timestamp;
        if (rawDate) {
            const parsed = new Date(rawDate);
            formattedDate = !isNaN(parsed.getTime())
                ? parsed.toLocaleDateString()
                : String(rawDate).split("T").at(0);
        }

        const responseId = resp.id || "";
        const sName = resp.student_name || resp.studentName || "Unknown Student";
        const gLevel = (resp.grade_level || resp.gradeLevel) ? ` (${resp.grade_level || resp.gradeLevel})` : "";
        const bTitle = resp.book_title || resp.bookTitle || "Untitled Book";
        const bAuthor = (resp.book_author || resp.bookAuthor) ? ` by ${resp.book_author || resp.bookAuthor}` : "";

        const p1Title = resp.prompt1_title || resp.prompt1Title || "Prompt 1";
        const p1Description = getPromptDescription(p1Title, resp.grade_level || resp.gradeLevel);
        const r1Text = resp.response1 || "No response provided.";

        const p2Title = resp.prompt2_title || resp.prompt2Title || "Prompt 2";
        const p2Description = getPromptDescription(p2Title, resp.grade_level || resp.gradeLevel);
        const r2Text = resp.response2 || "No response provided.";

        card.innerHTML = `
      <div class="card-header">
        <strong>${escapeHtml(sName)}${escapeHtml(gLevel)}</strong>
        <span class="date">${escapeHtml(formattedDate)}</span>
        <button type="button" class="delete-response-btn" data-response-id="${escapeHtml(responseId)}">🗑 Delete</button>
      </div>
      <p class="book-info">📖 <em>${escapeHtml(bTitle)}</em>${escapeHtml(bAuthor)}</p>
      <div class="resp-block">
                <strong${p1Description ? ` class="prompt-title-tooltip" data-tooltip="${escapeHtml(p1Description)}"` : ""}>${escapeHtml(p1Title)}</strong>
        <p>${escapeHtml(r1Text)}</p>
        ${renderRubricRow(responseId, 1, resp.score1)}
        ${renderCommentBlock(responseId, 1, resp.comment1)}
      </div>
      <div class="resp-block">
                <strong${p2Description ? ` class="prompt-title-tooltip" data-tooltip="${escapeHtml(p2Description)}"` : ""}>${escapeHtml(p2Title)}</strong>
        <p>${escapeHtml(r2Text)}</p>
        ${renderRubricRow(responseId, 2, resp.score2)}
        ${renderCommentBlock(responseId, 2, resp.comment2)}
      </div>
    `;

        container.appendChild(card);
    });
}

function handleResponsesContainerClick(e) {
    if (e.target.closest(".rubric-btn")) {
        handleRubricClick(e);
    } else if (e.target.closest(".delete-response-btn")) {
        handleDeleteResponse(e);
    } else if (e.target.closest(".save-comment-btn")) {
        handleSaveComment(e);
    }
}

function handleCommentInput(e) {
    const textarea = e.target.closest(".comment-textarea");
    if (!textarea) return;

    const status = textarea.closest(".comment-block").querySelector(".comment-status");
    const isSaved = textarea.value.trim() === textarea.dataset.savedComment;
    status.textContent = isSaved ? "Saved" : "Not Saved";
    status.classList.toggle("not-saved", !isSaved);
    status.classList.remove("save-error");
}

async function handleDeleteResponse(e) {
    const btn = e.target.closest(".delete-response-btn");
    if (!btn || btn.disabled) return;

    if (!confirm("Delete this response permanently? This cannot be undone.")) return;

    const responseId = btn.dataset.responseId;
    const card = btn.closest(".response-card");
    btn.disabled = true;

    const { error } = await db
        .from('reading_responses')
        .delete()
        .eq('id', responseId);

    if (!error) {
        card.remove();
    } else {
        alert("Failed to delete response.");
        btn.disabled = false;
    }
}

async function handleRubricClick(e) {
    const btn = e.target.closest(".rubric-btn");
    if (!btn || btn.classList.contains("selected")) return;

    const responseId = btn.dataset.responseId;
    const promptNum = Number(btn.dataset.promptNum);
    const score = Number(btn.dataset.score);

    const row = btn.parentElement;
    const siblingButtons = Array.from(row.querySelectorAll(".rubric-btn"));
    const previousSelected = siblingButtons.find(b => b.classList.contains("selected"));

    siblingButtons.forEach(b => b.classList.toggle("selected", b === btn));

    await saveScoreAndComment(responseId, promptNum, score, null);
}

async function handleSaveComment(e) {
    const btn = e.target.closest(".save-comment-btn");
    if (!btn || btn.disabled) return;

    const responseId = btn.dataset.responseId;
    const promptNum = Number(btn.dataset.promptNum);
    const block = btn.closest(".comment-block");
    const textarea = block.querySelector(".comment-textarea");
    const status = block.querySelector(".comment-status");
    const comment = textarea.value.trim();
    const originalButtonText = btn.textContent;

    btn.disabled = true;
    btn.textContent = "Saving...";
    btn.classList.add("is-saving");
    textarea.disabled = true;

    let saved = false;
    try {
        saved = await saveScoreAndComment(responseId, promptNum, null, comment);
    } catch (error) {
        console.error("Comment save error:", error);
    } finally {
        btn.disabled = false;
        btn.textContent = originalButtonText;
        btn.classList.remove("is-saving");
        textarea.disabled = false;
    }

    if (saved) {
        textarea.dataset.savedComment = comment;
        status.textContent = "Saved";
        status.classList.remove("not-saved", "save-error");
    } else {
        status.textContent = "Save failed";
        status.classList.add("save-error");
    }
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
        showStatus(commentVal !== null ? "Failed to save comment." : "Failed to save evaluation.", "error");
        return false;
    } else {
        showStatus("Saved feedback!", "success");
        return true;
    }
}

// ==========================================
// 6. PASSCODE MANAGEMENT (CHANGE & RESET)
// ==========================================

// Master Recovery Key for Forgot Passcode (Customize as needed)
const MASTER_RECOVERY_KEY = "1234";

// Bind Modal Triggers inside bindEvents()
function bindPasscodeManagementEvents() {
    // Open / Close Change Passcode Modal
    document.getElementById("change-passcode-btn")?.addEventListener("click", () => {
        document.getElementById("change-passcode-modal").classList.remove("hidden");
    });
    document.getElementById("close-change-modal-btn")?.addEventListener("click", () => {
        document.getElementById("change-passcode-modal").classList.add("hidden");
    });

    // Save New Passcode from Dashboard
    document.getElementById("save-new-passcode-btn")?.addEventListener("click", handleChangePasscode);

    // Open / Close Reset Passcode Modal
    document.getElementById("forgot-passcode-link")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("passcode-modal").classList.add("hidden");
        document.getElementById("reset-passcode-modal").classList.remove("hidden");
    });
    document.getElementById("close-reset-modal-btn")?.addEventListener("click", () => {
        document.getElementById("reset-passcode-modal").classList.add("hidden");
    });

    // Confirm Reset with Recovery Key
    document.getElementById("confirm-reset-btn")?.addEventListener("click", handleResetPasscode);
}

// Handler: Change Passcode from Dashboard
async function handleChangePasscode() {
    const newPass = document.getElementById("new-passcode-input").value.trim();
    const confirmPass = document.getElementById("confirm-passcode-input").value.trim();
    const errText = document.getElementById("change-modal-error");

    if (!newPass) {
        errText.textContent = "Passcode cannot be empty.";
        errText.classList.remove("hidden");
        return;
    }

    if (newPass !== confirmPass) {
        errText.textContent = "Passcodes do not match.";
        errText.classList.remove("hidden");
        return;
    }

    const { error } = await db
        .from('reading_settings')
        .upsert({ key: 'passcode', value: newPass });

    if (!error) {
        activePasscode = newPass;
        errText.classList.add("hidden");
        document.getElementById("new-passcode-input").value = "";
        document.getElementById("confirm-passcode-input").value = "";
        document.getElementById("change-passcode-modal").classList.add("hidden");
        showStatus("Passcode successfully updated!", "success");
    } else {
        console.error("Change passcode error:", error);
        errText.textContent = "Failed to update passcode in database.";
        errText.classList.remove("hidden");
    }
}

// Handler: Reset Passcode using Recovery Key
async function handleResetPasscode() {
    const recoveryKey = document.getElementById("recovery-key-input").value.trim();
    const newPass = document.getElementById("reset-new-passcode-input").value.trim();
    const errText = document.getElementById("reset-modal-error");

    if (recoveryKey !== MASTER_RECOVERY_KEY) {
        errText.textContent = "Invalid Master Recovery Key.";
        errText.classList.remove("hidden");
        return;
    }

    if (!newPass) {
        errText.textContent = "Please enter a valid new passcode.";
        errText.classList.remove("hidden");
        return;
    }

    const { error } = await db
        .from('reading_settings')
        .upsert({ key: 'passcode', value: newPass });

    if (!error) {
        errText.classList.add("hidden");
        document.getElementById("recovery-key-input").value = "";
        document.getElementById("reset-new-passcode-input").value = "";
        document.getElementById("reset-passcode-modal").classList.add("hidden");
        showStatus("Passcode reset successfully! You can now log in with your new passcode.", "success");
        openPasscodeModal();
    } else {
        console.error("Reset passcode error:", error);
        errText.textContent = "Failed to reset passcode in database.";
        errText.classList.remove("hidden");
    }
}

// ==========================================
// 7. STUDENT HISTORY & FEEDBACK VIEW
// ==========================================

let currentStudentRecords = [];
let currentStudentLogEntries = [];

async function loadStudentHistory(studentName) {
    const panel = document.getElementById("student-history-panel");
    const container = document.getElementById("history-container");
    const countSpan = document.getElementById("history-count");
    const toggleBtn = document.getElementById("toggle-history-btn");

    if (!panel || !container) return;

    // Auto-collapse the history list when the panel first appears for a newly
    // selected student; refreshes (edit/delete) preserve the current toggle state.
    const isFirstLoad = panel.classList.contains("hidden");
    panel.classList.remove("hidden");
    if (isFirstLoad) {
        container.classList.add("hidden");
        if (toggleBtn) toggleBtn.textContent = "Show";
    }

    container.innerHTML = "<p>Loading your past submissions...</p>";

    const { data: history, error } = await db
        .from('reading_responses')
        .select('*')
        .eq('student_name', studentName)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fetch student history error:", error);
        container.innerHTML = "<p>Unable to load submission history.</p>";
        return;
    }

    currentStudentRecords = history || [];
    if (countSpan) countSpan.textContent = currentStudentRecords.length;
    renderStudentHistory(currentStudentRecords);
}

function renderStudentHistory(records) {
    const container = document.getElementById("history-container");
    if (!container) return;

    if (records.length === 0) {
        container.innerHTML = "<p style='color: var(--muted); font-size: 0.9rem;'>No past submissions found yet.</p>";
        return;
    }

    container.innerHTML = "";

    records.forEach(resp => {
        const card = document.createElement("div");
        card.className = "response-card";

        let formattedDate = "N/A";
        const rawDate = resp.created_at || resp.timestamp;
        if (rawDate) {
            const parsed = new Date(rawDate);
            formattedDate = !isNaN(parsed.getTime()) ? parsed.toLocaleDateString() : String(rawDate).split("T").at(0);
        }

        const bTitle = resp.book_title || "Untitled Book";
        const bAuthor = resp.book_author ? ` by ${resp.book_author}` : "";

        // Check if the submission has been scored by a teacher
        const isGraded = (resp.score1 !== null && resp.score1 !== undefined) ||
            (resp.score2 !== null && resp.score2 !== undefined);

        const actionButtons = !isGraded ? `
      <div class="card-actions" style="margin-top: 0.5rem; text-align: right;">
        <button type="button" class="secondary-btn student-edit-btn" data-id="${resp.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; margin-right: 0.25rem;">✏️ Edit</button>
        <button type="button" class="delete-response-btn student-delete-btn" data-id="${resp.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">🗑 Delete</button>
      </div>
    ` : '';

        const getScoreBadge = (score) => {
            if (score === null || score === undefined) {
                return `<span class="badge" style="background: #fef3c7; color: #92400e;">⏳ Pending Review</span>`;
            }
            const rubricObj = RUBRIC.find(r => r.score === Number(score));
            const label = rubricObj ? ` — ${rubricObj.label}` : '';
            return `<span class="badge" style="background: #dcfce7; color: #15803d; font-weight:700;">Score: ${score}/10${label}</span>`;
        };

        const p1Title = resp.prompt1_title || "Prompt 1";
        const r1Text = resp.response1 || "";
        const s1Badge = getScoreBadge(resp.score1);
        const c1Text = resp.comment1 ? `<div class="status-box info" style="margin-top:0.5rem; font-size:0.85rem; padding:0.5rem 0.75rem;"><strong>Teacher Feedback:</strong> ${escapeHtml(resp.comment1)}</div>` : '';

        const p2Title = resp.prompt2_title || "Prompt 2";
        const r2Text = resp.response2 || "";
        const s2Badge = getScoreBadge(resp.score2);
        const c2Text = resp.comment2 ? `<div class="status-box info" style="margin-top:0.5rem; font-size:0.85rem; padding:0.5rem 0.75rem;"><strong>Teacher Feedback:</strong> ${escapeHtml(resp.comment2)}</div>` : '';

        card.innerHTML = `
      <div class="card-header">
        <strong>📖 <em>${escapeHtml(bTitle)}</em>${escapeHtml(bAuthor)}</strong>
        <span class="date">${escapeHtml(formattedDate)}</span>
      </div>
      <div class="resp-block">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; flex-wrap:wrap; gap:0.4rem;">
          <strong>${escapeHtml(p1Title)}</strong>
          ${s1Badge}
        </div>
        <p style="font-size:0.92rem;">${escapeHtml(r1Text)}</p>
        ${c1Text}
      </div>
      <div class="resp-block">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; flex-wrap:wrap; gap:0.4rem;">
          <strong>${escapeHtml(p2Title)}</strong>
          ${s2Badge}
        </div>
        <p style="font-size:0.92rem;">${escapeHtml(r2Text)}</p>
        ${c2Text}
      </div>
      ${actionButtons}
    `;

        container.appendChild(card);
    });
}

// ==========================================
// 8. ROSTER MANAGEMENT & UTILITIES
// ==========================================

async function handleAddStudent(e) {
    // Prevent browser default form reload
    e.preventDefault();

    const nameInput = document.getElementById("new-student-name");
    const gradeInput = document.getElementById("new-student-grade");

    const name = nameInput.value.trim();
    const grade = gradeInput.value.trim();

    if (!name || !grade) return;

    // Insert into Supabase table
    const { error } = await db
        .from('reading_students')
        .insert([{ name, grade }]);

    if (!error) {
        showStatus(`Added ${name} (${grade}) to roster.`, "success");
        nameInput.value = "";
        gradeInput.value = "";
        document.getElementById("add-student-panel").classList.add("hidden");
        await loadInitialData(); // Reload local roster list
    } else {
        console.error("Add student error:", error);
        showStatus("Failed to add student to roster.", "error");
    }
}

// Render student roster with Edit and Delete options
function renderRoster() {
    const container = document.getElementById("roster-container");
    const countSpan = document.getElementById("roster-count");
    if (!container) return;

    if (countSpan) countSpan.textContent = studentsData.length;

    if (studentsData.length === 0) {
        container.innerHTML = "<p>No students in roster yet.</p>";
        return;
    }

    let html = `<table class="roster-table" style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="text-align: left; border-bottom: 2px solid var(--border);">
        <th style="padding: 0.5rem;">Name</th>
        <th style="padding: 0.5rem;">Grade</th>
        <th style="padding: 0.5rem; text-align: right;">Actions</th>
      </tr>
    </thead>
    <tbody>`;

    studentsData.forEach(student => {
        html += `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 0.5rem;"><button type="button" class="student-name-link" data-name="${escapeHtml(student.name)}"><strong>${escapeHtml(student.name)}</strong></button></td>
        <td style="padding: 0.5rem;"><span class="badge">${escapeHtml(student.grade)}</span></td>
        <td style="padding: 0.5rem; text-align: right;">
          <button type="button" class="secondary-btn edit-student-btn" data-id="${student.id}" data-name="${escapeHtml(student.name)}" data-grade="${escapeHtml(student.grade)}" style="padding: 0.2rem 0.5rem; font-size: 0.85rem; margin-right: 0.25rem;">✏️ Edit</button>
          <button type="button" class="delete-response-btn delete-student-btn" data-id="${student.id}" style="padding: 0.2rem 0.5rem; font-size: 0.85rem;">🗑 Delete</button>
        </td>
      </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// ==========================================
// 6b. TEACHER STUDENT DETAIL VIEW
// ==========================================
async function openStudentDetail(studentName) {
    document.getElementById("teacher-view").classList.add("hidden");
    document.getElementById("student-detail-view").classList.remove("hidden");
    document.getElementById("student-detail-name").textContent = studentName;

    const logContainer = document.getElementById("detail-log-container");
    const respContainer = document.getElementById("detail-responses-container");
    logContainer.innerHTML = "<p>Loading reading log...</p>";
    respContainer.innerHTML = "<p>Loading responses...</p>";

    const [logResult, respResult] = await Promise.all([
        db.from('reading_log').select('*').eq('student_name', studentName).order('log_date', { ascending: false }),
        db.from('reading_responses').select('*').eq('student_name', studentName).order('created_at', { ascending: false })
    ]);

    if (logResult.error) {
        console.error("Reading log fetch error:", logResult.error);
        logContainer.innerHTML = "<p>Unable to load reading log.</p>";
    } else {
        renderStudentLog(logResult.data || []);
    }

    if (respResult.error) {
        console.error("Student responses fetch error:", respResult.error);
        respContainer.innerHTML = "<p>Unable to load responses.</p>";
    } else {
        renderStudentDetailResponses(respResult.data || []);
    }
}

function renderStudentLog(entries) {
    const container = document.getElementById("detail-log-container");

    if (entries.length === 0) {
        container.innerHTML = "<p style='color: var(--muted); font-size: 0.9rem;'>No reading log entries yet.</p>";
        return;
    }

    const weekTotals = new Map();
    entries.forEach(entry => {
        const key = getWeekKey(entry.log_date);
        if (!key) return;
        const totals = weekTotals.get(key) || { minutes: 0, pages: 0 };
        totals.minutes += Number(entry.minutes_read) || 0;
        totals.pages += (Number(entry.page_end) || 0) - (Number(entry.page_start) || 0) + 1;
        weekTotals.set(key, totals);
    });

    let html = "";
    let lastWeekKey = null;

    entries.forEach(entry => {
        const weekKey = getWeekKey(entry.log_date);
        if (weekKey && weekKey !== lastWeekKey) {
            const totals = weekTotals.get(weekKey);
            html += `<div class="month-total">📅 <strong>${escapeHtml(getWeekLabel(weekKey))}</strong> — Total: ${totals.minutes} min, ${totals.pages} pages</div>`;
            lastWeekKey = weekKey;
        }

        const dateLabel = formatLogDate(entry.log_date);
        const pageStart = Number(entry.page_start) || 0;
        const pageEnd = Number(entry.page_end) || 0;
        const pageCount = pageEnd - pageStart + 1;

        html += `<div class="log-entry">
            <span class="log-date">${escapeHtml(dateLabel)}</span>
            <span class="log-title">📖 <em>${escapeHtml(entry.book_title || "Untitled")}</em></span>
            <span class="log-stats">${Number(entry.minutes_read) || 0} min &middot; pages ${pageStart}&ndash;${pageEnd} (${pageCount} pages)</span>
        </div>`;
    });

    container.innerHTML = html;
}

function getWeekKey(dateStr) {
    const parts = String(dateStr || "").split("-").map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() - date.getDay()); // Sunday of this week
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekLabel(weekKey) {
    const [year, month, day] = weekKey.split("-").map(Number);
    const start = new Date(year, month - 1, day);
    const end = new Date(year, month - 1, day + 6);
    return `Week of ${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatLogDate(dateStr) {
    const parts = String(dateStr || "").split("-").map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return String(dateStr || "");
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString();
}

function renderStudentDetailResponses(responses) {
    const container = document.getElementById("detail-responses-container");

    if (responses.length === 0) {
        container.innerHTML = "<p>No responses submitted yet.</p>";
        return;
    }

    container.innerHTML = "";

    responses.forEach(resp => {
        const card = document.createElement("div");
        card.className = "response-card";

        let formattedDate = "N/A";
        const rawDate = resp.created_at || resp.timestamp;
        if (rawDate) {
            const parsed = new Date(rawDate);
            formattedDate = !isNaN(parsed.getTime())
                ? parsed.toLocaleDateString()
                : String(rawDate).split("T").at(0);
        }

        const responseId = resp.id || "";
        const bTitle = resp.book_title || "Untitled Book";
        const bAuthor = resp.book_author ? ` by ${resp.book_author}` : "";
        const p1Title = resp.prompt1_title || "Prompt 1";
        const p1Description = getPromptDescription(p1Title, resp.grade_level);
        const p2Title = resp.prompt2_title || "Prompt 2";
        const p2Description = getPromptDescription(p2Title, resp.grade_level);
        const r1Text = resp.response1 || "No response provided.";
        const r2Text = resp.response2 || "No response provided.";

        // Ungraded responses get the same rubric + comment controls as the dashboard
        const eval1 = resp.score1 != null
            ? `<p class="detail-score">Score: ${escapeHtml(String(resp.score1))}</p>`
            : renderRubricRow(responseId, 1, resp.score1) + renderCommentBlock(responseId, 1, resp.comment1);
        const eval2 = resp.score2 != null
            ? `<p class="detail-score">Score: ${escapeHtml(String(resp.score2))}</p>`
            : renderRubricRow(responseId, 2, resp.score2) + renderCommentBlock(responseId, 2, resp.comment2);

        card.innerHTML = `
      <div class="card-header">
        <span class="date">${escapeHtml(formattedDate)}</span>
      </div>
      <p class="book-info">📖 <em>${escapeHtml(bTitle)}</em>${escapeHtml(bAuthor)}</p>
      <div class="resp-block">
        <strong${p1Description ? ` class="prompt-title-tooltip" data-tooltip="${escapeHtml(p1Description)}"` : ""}>${escapeHtml(p1Title)}</strong>
        <p>${escapeHtml(r1Text)}</p>
        ${eval1}
      </div>
      <div class="resp-block">
        <strong${p2Description ? ` class="prompt-title-tooltip" data-tooltip="${escapeHtml(p2Description)}"` : ""}>${escapeHtml(p2Title)}</strong>
        <p>${escapeHtml(r2Text)}</p>
        ${eval2}
      </div>
    `;

        container.appendChild(card);
    });
}

// Roster Modal Action State
let pendingRosterAction = null;

// Handle Edit and Delete Clicks with Custom Modal (No System Popups)
document.getElementById("roster-container")?.addEventListener("click", (e) => {
    const nameLink = e.target.closest(".student-name-link");
    if (nameLink) {
        openStudentDetail(nameLink.dataset.name);
        return;
    }

    const deleteBtn = e.target.closest(".delete-student-btn");
    const editBtn = e.target.closest(".edit-student-btn");

    const modal = document.getElementById("student-modal");
    const modalTitle = document.getElementById("student-modal-title");
    const modalBody = document.getElementById("student-modal-body");
    const confirmBtn = document.getElementById("student-modal-confirm-btn");

    if (deleteBtn) {
        const studentId = deleteBtn.dataset.id;
        const studentName = deleteBtn.dataset.name;

        modalTitle.textContent = "Confirm Deletion";
        modalBody.innerHTML = `<p style="margin:0;">Are you sure you want to remove <strong>${escapeHtml(studentName)}</strong> from the roster?</p>`;
        confirmBtn.textContent = "Delete Student";
        confirmBtn.className = "delete-response-btn";

        pendingRosterAction = async () => {
            const { error } = await db.from('reading_students').delete().eq('id', studentId);
            if (!error) {
                showStatus(`Deleted ${studentName} from roster.`, "success");
                await loadInitialData();
            } else {
                showStatus("Failed to delete student.", "error");
            }
        };

        modal.classList.remove("hidden");
    }

    if (editBtn) {
        const studentId = editBtn.dataset.id;
        const currentName = editBtn.dataset.name;
        const currentGrade = editBtn.dataset.grade;

        modalTitle.textContent = "Edit Student Details";
        modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Student Name</label>
          <input type="text" id="edit-modal-name" value="${escapeHtml(currentName)}" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
        </div>
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Grade Level</label>
          <select id="edit-modal-grade" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px;">
            <option value="6th" ${currentGrade === '6th' ? 'selected' : ''}>6th Grade</option>
            <option value="7th" ${currentGrade === '7th' ? 'selected' : ''}>7th Grade</option>
            <option value="8th" ${currentGrade === '8th' ? 'selected' : ''}>8th Grade</option>
          </select>
        </div>
      </div>
    `;
        confirmBtn.textContent = "Save Changes";
        confirmBtn.className = "";

        pendingRosterAction = async () => {
            const newName = document.getElementById("edit-modal-name").value.trim();
            const newGrade = document.getElementById("edit-modal-grade").value.trim();

            if (!newName) return;

            const { error } = await db
                .from('reading_students')
                .update({ name: newName, grade: newGrade })
                .eq('id', studentId);

            if (!error) {
                showStatus("Student details updated.", "success");
                await loadInitialData();
            } else {
                showStatus("Failed to update student.", "error");
            }
        };

        modal.classList.remove("hidden");
    }
});

// Modal Action Buttons
document.getElementById("student-modal-confirm-btn")?.addEventListener("click", async () => {
    if (pendingRosterAction) {
        await pendingRosterAction();
        pendingRosterAction = null;
    }
    document.getElementById("student-modal").classList.add("hidden");
});

document.getElementById("student-modal-cancel-btn")?.addEventListener("click", () => {
    pendingRosterAction = null;
    document.getElementById("student-modal").classList.add("hidden");
});

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

    const csvRows = [headers.join(",")];

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
    link.setAttribute("download", `reading_responses_${new Date().toISOString().split('T')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Student History Container Click Delegator (Edit / Delete)
document.getElementById("history-container")?.addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(".student-delete-btn");
    const editBtn = e.target.closest(".student-edit-btn");

    if (deleteBtn) {
        const responseId = deleteBtn.dataset.id;
        if (confirm("Are you sure you want to delete this submission?")) {
            const { error } = await db
                .from('reading_responses')
                .delete()
                .eq('id', responseId);

            if (!error) {
                showStatus("Submission deleted successfully.", "success");
                if (currentSelectedStudent) {
                    const { data: history } = await db
                        .from('reading_responses')
                        .select('*')
                        .eq('student_name', currentSelectedStudent.name);
                    recentSubmissionsData = history || [];
                    if (currentSelectedStudent.grade) {
                        populateGradePrompts(currentSelectedStudent.grade);
                    }
                    await loadStudentHistory(currentSelectedStudent.name);
                    await loadInitialData();
                }
            } else {
                showStatus("Failed to delete submission.", "error");
            }
        }
    }

    if (editBtn) {
        const responseId = editBtn.dataset.id;
        const record = currentStudentRecords.find(r => String(r.id) === String(responseId));

        if (!record) return;

        document.getElementById("edit-response-id").value = record.id;
        document.getElementById("edit-book-title").value = record.book_title || "";
        document.getElementById("edit-book-author").value = record.book_author || "";

        document.getElementById("edit-prompt1-label").textContent = record.prompt1_title || "Prompt 1";
        document.getElementById("edit-response1-text").value = record.response1 || "";

        document.getElementById("edit-prompt2-label").textContent = record.prompt2_title || "Prompt 2";
        document.getElementById("edit-response2-text").value = record.response2 || "";

        document.getElementById("student-edit-modal").classList.remove("hidden");
    }
});

// Student Edit Modal Handlers
document.getElementById("close-student-edit-btn")?.addEventListener("click", () => {
    document.getElementById("student-edit-modal").classList.add("hidden");
});

document.getElementById("student-edit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const responseId = document.getElementById("edit-response-id").value;
    const payload = {
        book_title: document.getElementById("edit-book-title").value.trim(),
        book_author: document.getElementById("edit-book-author").value.trim(),
        response1: document.getElementById("edit-response1-text").value.trim(),
        response2: document.getElementById("edit-response2-text").value.trim()
    };

    const { error } = await db
        .from('reading_responses')
        .update(payload)
        .eq('id', responseId);

    if (!error) {
        showStatus("Submission updated successfully!", "success");
        document.getElementById("student-edit-modal").classList.add("hidden");
        if (currentSelectedStudent) {
            await loadStudentHistory(currentSelectedStudent.name);
        }
    } else {
        console.error("Update error:", error);
        showStatus("Failed to update submission.", "error");
    }
});

function showStatus(message, type) {
    const statusMsg = document.getElementById("status-message");
    if (!statusMsg) return;
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
