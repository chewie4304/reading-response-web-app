// Web App API Endpoint
const API_URL = "https://script.google.com/macros/s/AKfycbyzv-2a7duFRLcbHR14jDW0YzBDGjKMVQFI3UDPWG0GCweQTiB26-119hKKEeHl59S4/exec";

// Global App State
let studentsData = [];
let promptsData = [];
let currentSelectedStudent = null;
let activePasscode = "";

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
            studentsData = json.students || [];
            promptsData = json.prompts || [];
            populateStudentDatalist();
        } else {
            showStatus("Failed to load initial data from Google Sheets.", "error");
        }
    } catch (err) {
        showStatus("Error connecting to server. Check your internet connection.", "error");
    }
}

// Populate <datalist> for student name autocomplete
function populateStudentDatalist() {
    const datalist = document.getElementById("student-list");
    datalist.innerHTML = "";
    studentsData.forEach(student => {
        const opt = document.createElement("option");
        opt.value = student.name;
        datalist.appendChild(opt);
    });
}

// Bind UI Interactions
function bindEvents() {
    const nameInput = document.getElementById("student-name");
    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    const form = document.getElementById("response-form");

    // Student selection detection
    nameInput.addEventListener("input", handleStudentNameChange);

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

    // Add Student toggle & submit
    document.getElementById("add-student-toggle-btn").addEventListener("click", () => {
        document.getElementById("add-student-panel").classList.toggle("hidden");
    });
    document.getElementById("add-student-form").addEventListener("submit", handleAddStudent);
}

// Handle Student Name Selection & Grade Matching
function handleStudentNameChange(e) {
    const typedName = e.target.value.trim();
    const matched = studentsData.find(s => s.name.toLowerCase() === typedName.toLowerCase());

    const gradeBadge = document.getElementById("grade-badge");
    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");
    const r1Text = document.getElementById("response1-text");
    const r2Text = document.getElementById("response2-text");
    const submitBtn = document.getElementById("submit-btn");

    if (matched) {
        currentSelectedStudent = matched;
        gradeBadge.textContent = `${matched.grade} Grade`;
        gradeBadge.classList.remove("hidden");

        // Enable prompt selects and response fields
        p1Select.disabled = false;
        p2Select.disabled = false;
        r1Text.disabled = false;
        r2Text.disabled = false;
        submitBtn.disabled = false;

        populateGradePrompts(matched.grade);
    } else {
        currentSelectedStudent = null;
        gradeBadge.classList.add("hidden");
        p1Select.disabled = true;
        p2Select.disabled = true;
        r1Text.disabled = true;
        r2Text.disabled = true;
        submitBtn.disabled = true;

        p1Select.innerHTML = `<option value="">-- Select your student name first --</option>`;
        p2Select.innerHTML = `<option value="">-- Select your student name first --</option>`;
        document.getElementById("prompt1-text").classList.add("hidden");
        document.getElementById("prompt2-text").classList.add("hidden");
    }
}

// Populate prompts filtered by student grade level
function populateGradePrompts(grade) {
    const filteredPrompts = promptsData.filter(p => p.grade.toLowerCase() === grade.toLowerCase());

    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");

    let optionsHTML = `<option value="">-- Select a prompt --</option>`;
    filteredPrompts.forEach(p => {
        optionsHTML += `<option value="${p.title}" data-id="${p.id}">${p.standard}: ${p.title}</option>`;
    });

    p1Select.innerHTML = optionsHTML;
    p2Select.innerHTML = optionsHTML;
}

// Update prompt text descriptions and prevent duplicate choices
function handlePromptSelect(promptNum) {
    const p1Select = document.getElementById("prompt1-select");
    const p2Select = document.getElementById("prompt2-select");

    const selectedSelect = promptNum === 1 ? p1Select : p2Select;
    const targetDesc = document.getElementById(`prompt${promptNum}-text`);

    const selectedTitle = selectedSelect.value;
    const promptObj = promptsData.find(p => p.title === selectedTitle && p.grade.toLowerCase() === currentSelectedStudent.grade.toLowerCase());

    if (promptObj) {
        targetDesc.textContent = promptObj.text;
        targetDesc.classList.remove("hidden");
    } else {
        targetDesc.classList.add("hidden");
    }

    // Prevent selecting same prompt in both dropdowns
    if (promptNum === 1 && p2Select.value === p1Select.value && p1Select.value !== "") {
        p2Select.value = "";
        document.getElementById("prompt2-text").classList.add("hidden");
    }
}

// Submit Response Form to Google Apps Script
async function handleFormSubmit(e) {
    e.preventDefault();

    if (!currentSelectedStudent) {
        showStatus("Please select a valid student from the roster.", "error");
        return;
    }

    const p1Value = document.getElementById("prompt1-select").value;
    const p2Value = document.getElementById("prompt2-select").value;

    if (p1Value === p2Value) {
        showStatus("Please choose two different prompts for your response.", "error");
        return;
    }

    const payload = {
        action: "submitResponse",
        studentName: currentSelectedStudent.name,
        gradeLevel: currentSelectedStudent.grade,
        bookTitle: document.getElementById("book-title").value.trim(),
        bookAuthor: document.getElementById("book-author").value.trim(),
        prompt1Title: p1Value,
        response1: document.getElementById("response1-text").value.trim(),
        prompt2Title: p2Value,
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
            document.getElementById("response-form").reset();
            handleStudentNameChange({ target: { value: "" } });
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

function renderResponses(responses) {
    const container = document.getElementById("responses-container");
    if (responses.length === 0) {
        container.innerHTML = "<p>No responses submitted yet.</p>";
        return;
    }

    container.innerHTML = "";
    responses.reverse().forEach(resp => {
        const card = document.createElement("div");
        card.className = "response-card";

        const formattedDate = resp.timestamp ? new Date(resp.timestamp).toLocaleDateString() : "N/A";

        card.innerHTML = `
      <div class="card-header">
        <strong>${escapeHtml(resp.studentName)} (${escapeHtml(resp.gradeLevel)})</strong>
        <span class="date">${formattedDate}</span>
      </div>
      <p class="book-info">📖 <em>${escapeHtml(resp.bookTitle)}</em> by ${escapeHtml(resp.bookAuthor)}</p>
      <div class="resp-block">
        <strong>Prompt 1: ${escapeHtml(resp.prompt1Title)}</strong>
        <p>${escapeHtml(resp.response1)}</p>
      </div>
      <div class="resp-block">
        <strong>Prompt 2: ${escapeHtml(resp.prompt2Title)}</strong>
        <p>${escapeHtml(resp.response2)}</p>
      </div>
    `;
        container.appendChild(card);
    });
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