// Local UI State & Handles
document.addEventListener("DOMContentLoaded", () => {
  const teacherBtn = document.getElementById("teacher-access-btn");
  const modal = document.getElementById("passcode-modal");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const verifyBtn = document.getElementById("verify-passcode-btn");
  const passInput = document.getElementById("passcode-input");
  const studentView = document.getElementById("student-view");
  const teacherView = document.getElementById("teacher-view");
  const logoutBtn = document.getElementById("logout-btn");

  // Modal Toggles
  teacherBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));

  // Placeholder Password Verification (We will connect this to Google Sheets in Phase 2)
  verifyBtn.addEventListener("click", () => {
    if (passInput.value === "1234") { // Temporary passcode
      modal.classList.add("hidden");
      studentView.classList.add("hidden");
      teacherView.classList.remove("hidden");
      passInput.value = "";
    } else {
      document.getElementById("modal-error").classList.remove("hidden");
    }
  });

  logoutBtn.addEventListener("click", () => {
    teacherView.classList.add("hidden");
    studentView.classList.remove("hidden");
  });
});