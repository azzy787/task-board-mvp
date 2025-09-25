// /public/js/ui.js
// Modal open/close + edit/create logic
import { updateTask, createTask, deleteTask } from "./tasks.js";

const modal = document.getElementById("task-modal");
const newTaskBtn = document.getElementById("new-task-btn");
const closeModalBtn = document.getElementById("close-modal");
const cancelTaskBtn = document.getElementById("cancel-task");
const taskForm = document.getElementById("task-form");
const modalTitle = document.getElementById("modal-title");
const deleteBtn = document.getElementById("delete-task");

let currentTaskId = null;

export function openTaskModal(taskId = null, data = {}) {
  if (!modal) return;
  currentTaskId = taskId;

  if (modalTitle) modalTitle.textContent = taskId ? "Edit Task" : "New Task";

  // Prefill fields (supports Firestore Timestamp via toDate, JS Date, or ISO string)
  const titleEl = document.getElementById("task-title");
  const descEl = document.getElementById("task-desc");
  const assigneeEl = document.getElementById("task-assignee");
  const dueEl = document.getElementById("task-due");
  const priorityEl = document.getElementById("task-priority");

  if (titleEl) titleEl.value = data.title || "";
  if (descEl) descEl.value = data.description || "";
  if (assigneeEl) assigneeEl.value = data.assignee || "";

  let dueInput = "";
  const src = data.due_date || data.due || null;
  try {
    if (src?.toDate) {
      dueInput = src.toDate().toISOString().split("T")[0];
    } else if (src instanceof Date) {
      dueInput = src.toISOString().split("T")[0];
    } else if (typeof src === "string" && src) {
      const d = new Date(src);
      if (!isNaN(d)) dueInput = d.toISOString().split("T")[0];
    }
  } catch {}
  if (dueEl) dueEl.value = dueInput;

  if (priorityEl) priorityEl.value = data.priority || "medium";
  // Toggle Delete button for edit mode only
  if (deleteBtn) {
    if (taskId) deleteBtn.classList.remove("hidden");
    else deleteBtn.classList.add("hidden");
  }
  modal.classList.remove("hidden");
}

function closeModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  currentTaskId = null;
}

// Wire open/close buttons and backdrop
if (newTaskBtn) newTaskBtn.addEventListener("click", () => openTaskModal(null, {}));
if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
if (cancelTaskBtn) cancelTaskBtn.addEventListener("click", closeModal);
if (modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Handle form submit (create or update)
if (taskForm) {
  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-desc").value.trim();
    const assignee = document.getElementById("task-assignee").value.trim();
    const dueVal = document.getElementById("task-due").value;
    const due_date = dueVal ? new Date(dueVal) : null;
    const priority = document.getElementById("task-priority").value;

    if (!title) {
      alert("Title is required");
      return;
    }

    try {
      if (currentTaskId) {
        await updateTask(currentTaskId, {
          title,
          description,
          assignee,
          due_date,
          priority,
        });
        showToast("Task updated", "success");
      } else {
        await createTask({
          title,
          description,
          assignee,
          due_date,
          priority,
        });
        showToast("Task created", "success");
      }
      taskForm.reset();
      closeModal();
    } catch (err) {
      console.error("Error saving task:", err);
      alert("Failed to save task");
    }
  });
}

// Delete handler
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    if (currentTaskId && confirm("Delete this task?")) {
      try {
        await deleteTask(currentTaskId);
        showToast("Task deleted", "info", "center", 4000);
        taskForm?.reset?.();
        closeModal();
      } catch (err) {
        console.error("Error deleting task:", err);
        alert("Failed to delete task");
      } finally {
        currentTaskId = null;
      }
    }
  });
}

// Simple toast/notification
function showToast(message, type = "info", position = "bottom-center", durationMs = 1500) {
  // positioning presets: bottom-center (default), center, top-left, top-right, bottom-left, bottom-right
  let posClass = "fixed z-[60] bottom-4 left-1/2 -translate-x-1/2";
  switch (position) {
    case "center":
      posClass = "fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"; break;
    case "top-left":
      posClass = "fixed z-[60] top-4 left-4"; break;
    case "top-right":
      posClass = "fixed z-[60] top-4 right-4"; break;
    case "bottom-left":
      posClass = "fixed z-[60] bottom-4 left-4"; break;
    case "bottom-right":
      posClass = "fixed z-[60] bottom-4 right-4"; break;
    default:
      posClass = "fixed z-[60] bottom-4 left-1/2 -translate-x-1/2";
  }

  const base = `${posClass} px-4 py-2 rounded-lg shadow-md text-sm font-medium transition-opacity`;
  const colors =
    type === "success"
      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
      : type === "error"
      ? "bg-red-100 text-red-800 border border-red-200"
      : "bg-gray-100 text-gray-800 border border-gray-200";

  const el = document.createElement("div");
  el.className = `${base} ${colors}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("opacity-0");
    setTimeout(() => el.remove(), 250);
  }, Math.max(0, Number(durationMs) || 0));
}

export {};

