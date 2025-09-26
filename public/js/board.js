// public/js/board.js
"use strict";

import { ensureAuthed, wireLogout } from "./auth.js";
import {
  listenAll,
  createTask,
  getBoardTitle,
  setBoardTitle,
  getTasksByTitles,
  deleteTasks,
  updateTask
} from "./tasks.js";
import { openTaskModal } from "./ui.js";
import { enableDragAndDrop } from "./dnd.js";
import { db } from "./firebase.js";


document.addEventListener("DOMContentLoaded", () => {
  // ---------------- Board title: load + persist ----------------
  (async () => {
    const titleEl = document.getElementById("board-title");
    const editBtn = document.getElementById("edit-title-btn");
    if (!titleEl || !editBtn) return;

    // load saved title
    try {
      const saved = await getBoardTitle();
      const current = (titleEl.value ?? titleEl.textContent ?? "").trim();
      if (!current || current === "Team Board") {
        if ("value" in titleEl) titleEl.value = saved || "Team Board";
        else titleEl.textContent = saved || "Team Board";
      }
    } catch {}

    // UI helpers
    const setReadonly = (ro) => {
      if (ro) {
        titleEl.setAttribute("readonly", "true");
        titleEl.setAttribute("tabindex", "-1");
        titleEl.style.pointerEvents = "none"; // not clickable
        titleEl.classList.add("cursor-default", "select-none");
        titleEl.classList.remove("border-b", "border-gray-300");
      } else {
        titleEl.removeAttribute("readonly");
        titleEl.removeAttribute("tabindex");
        titleEl.style.pointerEvents = "auto";
        titleEl.classList.remove("cursor-default", "select-none");
        titleEl.classList.add("border-b", "border-gray-300");
      }
    };

    let originalValue = titleEl.value;
    let editing = false;

    function enterEditMode() {
      editing = true;
      originalValue = titleEl.value;
      setReadonly(false);
      editBtn.textContent = "Save";
      editBtn.classList.add("bg-[#FF99C8]", "text-white");
      // focus & place cursor at end
      titleEl.focus();
      try {
        const v = titleEl.value;
        titleEl.value = "";
        titleEl.value = v;
      } catch {}
    }

    async function exitEditMode({ save }) {
      try {
        if (save) {
          const newVal = (titleEl.value || "").trim() || "Team Board";
          await setBoardTitle(newVal);
          titleEl.value = newVal;
        } else {
          // revert
          titleEl.value = originalValue;
        }
      } finally {
        editing = false;
        setReadonly(true);
        editBtn.textContent = "Edit";
        editBtn.classList.remove("bg-[#FF99C8]", "text-white");
      }
    }

    // initial state
    setReadonly(true);

    // Button toggles between Edit and Save
    editBtn.addEventListener("click", async () => {
      if (!editing) return enterEditMode();
      await exitEditMode({ save: true });
    });

    // Keyboard shortcuts while editing
    titleEl.addEventListener("keydown", async (e) => {
      if (!editing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        await exitEditMode({ save: true });
      } else if (e.key === "Escape") {
        e.preventDefault();
        await exitEditMode({ save: false });
      }
    });
  })();

  // ---------------- Column handles (inner lists only for rendering) ----------------
  const altIds = {
    todo: ["todo"],
    in_progress: ["in_progress"],
    done: ["done"],
  };

  function firstPresent(ids = []) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  const columns = {
    todo: firstPresent(altIds.todo),
    in_progress: firstPresent(altIds.in_progress),
    done: firstPresent(altIds.done),
  };

  // ---------------- Selection state (multi-delete) ----------------
  let selectionMode = false;
  const selectedIds = new Set();
  let lastItems = [];

  const selectBtn = document.getElementById("select-mode-btn");
  const deleteSelectedBtn = document.getElementById("delete-selected-btn");

  function updateDeleteSelectedState() {
    if (!deleteSelectedBtn) return;
    const count = selectedIds.size;
    deleteSelectedBtn.disabled = count === 0;
    deleteSelectedBtn.textContent = count > 0 ? `Delete Selected (${count})` : "Delete Selected";
  }

  function setSelectionMode(on) {
    selectionMode = !!on;
    if (!selectionMode) selectedIds.clear();
    // re-render to show/hide checkboxes
    if (lastItems.length) render(lastItems);
    // update Select button styling/text
    if (selectBtn) {
      if (selectionMode) {
        selectBtn.textContent = "Cancel Selection";
        selectBtn.classList.add("bg-gray-800", "text-white");
      } else {
        selectBtn.textContent = "Select";
        selectBtn.classList.remove("bg-gray-800", "text-white");
      }
    }
    updateDeleteSelectedState();
  }

  // ---------------- Card renderer ----------------
  function createCard(task) {
    const card = document.createElement("div");
    card.className = "task-card";
    card.dataset.taskId = task.id;
    card.dataset.id = task.id; // for DnD lookup
    card.dataset.status = task.status;
    if (typeof task.order !== "undefined") card.dataset.order = String(task.order);
    card.draggable = true;

    // Selection checkbox (only in selection mode)
    let checkbox = null;
    if (selectionMode) {
      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "mr-2 align-middle";
      checkbox.checked = selectedIds.has(task.id);
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedIds.add(task.id);
        else selectedIds.delete(task.id);
        updateDeleteSelectedState();
      });
    }

    const title = document.createElement("h3");
    title.className = "task-title font-bold";
    title.textContent = task.title;

    const dueSrc = task.due_date || task.due || null;
    const assigneeLine = document.createElement("p");
    assigneeLine.innerHTML = `<strong>Assignee:</strong> ${task.assignee || ""}`;

    const dueLine = document.createElement("p");
    dueLine.innerHTML = `<strong>Due Date:</strong> ${formatDue(dueSrc)}`;

    const assigneeNode = document.createElement("span");
    assigneeNode.className = "task-assignee hidden";
    assigneeNode.textContent = task.assignee || "";

    const pr = (task.priority || "medium").toLowerCase();
    card.classList.add(`priority-${pr}`);
    const priorityP = document.createElement("p");
    priorityP.className = `priority ${pr}`;
    priorityP.textContent =
      pr === "high" ? "High Priority" : pr === "low" ? "Low Priority" : "Medium Priority";

    const titleRow = document.createElement("div");
    titleRow.className = "flex items-start";
    if (checkbox) titleRow.appendChild(checkbox);
    titleRow.appendChild(title);

    card.appendChild(titleRow);
    card.appendChild(assigneeLine);
    card.appendChild(dueLine);
    card.appendChild(assigneeNode);
    card.appendChild(priorityP);

    // Open modal on card click (edit mode)
    card.addEventListener("click", () => {
      if (selectionMode) {
        // Toggle selection
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change"));
        }
        return;
      }
      const data = {
        title: task.title,
        description: task.description || "",
        assignee: task.assignee || "",
        due_date: task.due_date || task.due || null,
        priority: task.priority || "medium",
      };
      openTaskModal(task.id, data);
    });

    // Minimal drag affordances (DnD drop logic lives in dnd.js)
    card.addEventListener("dragstart", (e) => {
      try {
        e.dataTransfer.setData("text/plain", task.id);
      } catch {}
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    return card;
  }

  function formatDue(src) {
    try {
      const d = src?.toDate ? src.toDate() : src instanceof Date ? src : new Date(src);
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    } catch {
      return src || "";
    }
  }

  function render(list) {
    // Clear columns
    Object.values(columns).forEach((el) => el && (el.innerHTML = ""));
    // Ensure order and sort
    const ordered = list
      .map((t, i) => ({
        ...t,
        order: Number.isFinite(t.order) ? t.order : (i + 1) * 1000,
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    lastItems = ordered;
    // Render
    for (const task of ordered) {
      const colEl = columns[task.status];
      if (colEl) colEl.appendChild(createCard(task));
    }
    // Re-apply active filters + refresh counts
    applyFilters();
  }

  // ---------------- Auth guard + live data ----------------
  (async () => {
    await ensureAuthed(); // redirects to index.html if not signed in
    wireLogout(); // hooks #logout-btn if present

    // Now it’s safe to subscribe to Firestore and render
    const unsubscribe = listenAll((docs) => {
      const items = docs.map((d) => ({
        id: d.id,
        title: d.title || "Untitled",
        description: d.description || "",
        assignee: d.assignee || "",
        priority: d.priority || "medium",
        status: d.status || "todo",
        due_date: d.due_date || null,
        order: Number.isFinite(d.order) ? d.order : undefined,
      }));
      render(items);
    });

    // optional: clean up on unload
    window.addEventListener("beforeunload", () => {
      try {
        unsubscribe?.();
      } catch {}
    });
  })();

  // ---------------- Seeder (optional) ----------------
  // ---------------- Refresh (pull + reconcile updates, no creates) ----------------
const seedBtn = document.getElementById("seed-btn");
if (seedBtn) {
  seedBtn.textContent = "Refresh";
  seedBtn.title = "Pull latest from Firestore and normalize any bad/missing fields";

  seedBtn.addEventListener("click", async () => {
    try {
      seedBtn.disabled = true;

      const { getDocs, collection } =
        await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

      // 1) Pull everything from Firestore
      const snap = await getDocs(collection(db, "tasks"));
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // 2) Build minimal patches (no creates)
      const validStatus = new Set(["todo", "in_progress", "done"]);
      const validPriority = new Set(["low", "medium", "high"]);

      let updated = 0, unchanged = 0;

      for (const d of docs) {
        const patch = {};

        // title: ensure non-empty string
        const title = typeof d.title === "string" ? d.title.trim() : "";
        if (!title) patch.title = "Untitled";

        // status: coerce/validate
        const status = typeof d.status === "string" ? d.status : "todo";
        if (!validStatus.has(status)) patch.status = "todo";

        // priority: coerce/validate
        const priority = typeof d.priority === "string" ? d.priority.toLowerCase() : "medium";
        if (!validPriority.has(priority)) patch.priority = "medium";

        // order: ensure number (stable ascending default if missing)
        if (!Number.isFinite(d.order)) {
          // if missing, default to Date.now() so it sorts after existing ones
          patch.order = Date.now();
        }

        // due_date: accept Firestore Timestamp or Date or ISO string; normalize to Date
        // (Firestore JS SDK will convert Date to Timestamp on write)
        const due = d.due_date ?? d.due ?? null;
        if (due && !(due instanceof Date) && !due?.toDate) {
          // If it is an ISO/string/number, normalize to Date
          const maybe = new Date(due);
          if (!Number.isNaN(maybe.valueOf())) patch.due_date = maybe;
        }

        if (Object.keys(patch).length > 0) {
          await updateTask(d.id, patch);
          updated++;
        } else {
          unchanged++;
        }
      }

      // 3) Re-render current snapshot (read-only items)
      const items = docs.map((d) => ({
        id: d.id,
        title: (typeof d.title === "string" ? d.title.trim() : "Untitled") || "Untitled",
        description: d.description || "",
        assignee: d.assignee || "",
        priority: validPriority.has((d.priority || "medium").toLowerCase())
          ? d.priority.toLowerCase()
          : "medium",
        status: validStatus.has(d.status || "") ? d.status : "todo",
        due_date: d.due_date || d.due || null,
        order: Number.isFinite(d.order) ? d.order : Date.now(),
      }));
      render(items); // your existing renderer (also refreshes counts via applyFilters)

      alert(`Refresh complete:\n• Updated: ${updated}\n• Unchanged: ${unchanged}`);
    } catch (err) {
      console.error("Refresh failed", err);
      alert("Failed to refresh from Firestore. Check console.");
    } finally {
      seedBtn.disabled = false;
    }
  });
}

  // Selection buttons wiring
  if (selectBtn) {
    selectBtn.addEventListener("click", () => setSelectionMode(!selectionMode));
  }
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      if (selectedIds.size === 0) return;
      if (!confirm(`Delete ${selectedIds.size} selected task(s)?`)) return;
      try {
        deleteSelectedBtn.disabled = true;
        await deleteTasks(Array.from(selectedIds));
        setSelectionMode(false);
      } catch (e) {
        console.error("Batch delete failed", e);
        alert("Failed to delete selected tasks");
      } finally {
        deleteSelectedBtn.disabled = false;
      }
    });
  }

  // ---------------- Filters + counts ----------------
  const searchInputEl =
    document.getElementById("search-input") || document.getElementById("searchInput");
  const statusFilterEl =
    document.getElementById("status-filter") || document.getElementById("statusFilter");
  const assigneeFilterEl =
    document.getElementById("assignee-filter") || document.getElementById("assigneeFilter");

  function applyFilters() {
    const searchText = (searchInputEl?.value || "").toLowerCase().trim();
    const statusFilter = (statusFilterEl?.value || "").trim();
    const assigneeFilter = (assigneeFilterEl?.value || "").toLowerCase().trim();

    const allTasks = document.querySelectorAll(".task-card");
    allTasks.forEach((taskEl) => {
      const titleText =
        taskEl.querySelector(".task-title")?.textContent?.toLowerCase() || "";
      const status = taskEl.dataset.status || "";
      const assigneeText =
        taskEl.querySelector(".task-assignee")?.textContent?.toLowerCase() || "";

      let visible = true;
      if (searchText && !titleText.includes(searchText)) visible = false;
      if (statusFilter && status !== statusFilter) visible = false;
      if (assigneeFilter && !assigneeText.includes(assigneeFilter)) visible = false;

      taskEl.style.display = visible ? "" : "none";
    });

    // Tailwind layout show/hide + centering
    const todoColTW = document.getElementById("col-todo");
    const inProgressColTW = document.getElementById("col-in_progress");
    const doneColTW = document.getElementById("col-done");
    const boardTW = document.getElementById("board-columns");

    if (todoColTW && inProgressColTW && doneColTW && boardTW) {
      todoColTW.style.display = !statusFilter || statusFilter === "todo" ? "" : "none";
      inProgressColTW.style.display =
        !statusFilter || statusFilter === "in_progress" ? "" : "none";
      doneColTW.style.display = !statusFilter || statusFilter === "done" ? "" : "none";

      const visibleCols = [todoColTW, inProgressColTW, doneColTW].filter(
        (c) => c.style.display !== "none"
      );
      if (visibleCols.length === 1) {
        boardTW.classList.remove("justify-between");
        boardTW.classList.add("justify-center");
        visibleCols[0].classList.remove("w-1/3");
        visibleCols[0].classList.add("w-1/2");
      } else {
        boardTW.classList.remove("justify-center");
        boardTW.classList.add("justify-between");
        [todoColTW, inProgressColTW, doneColTW].forEach((c) => {
          c.classList.add("w-1/3");
          c.classList.remove("w-1/2");
        });
      }
    } else {
      // Fallback for plain columns
      const map = { todo: columns.todo, in_progress: columns.in_progress, done: columns.done };
      Object.entries(map).forEach(([status, el]) => {
        if (!el) return;
        el.style.display = !statusFilter || statusFilter === status ? "" : "none";
      });
    }

    updateColumnCounts();
  }

  if (searchInputEl) searchInputEl.addEventListener("input", applyFilters);
  if (statusFilterEl) statusFilterEl.addEventListener("change", applyFilters);
  if (assigneeFilterEl) assigneeFilterEl.addEventListener("input", applyFilters);

  function updateColumnCounts() {
    const isVisible = (el) => el instanceof HTMLElement && el.style.display !== "none";
    const todoVisible = Array.from((columns.todo || document).querySelectorAll(".task-card")).filter(isVisible).length;
    const inProgVisible = Array.from((columns.in_progress || document).querySelectorAll(".task-card")).filter(isVisible).length;
    const doneVisible = Array.from((columns.done || document).querySelectorAll(".task-card")).filter(isVisible).length;

    const todoElById = document.getElementById("count-todo");
    const inProgElById = document.getElementById("count-in_progress");
    const doneElById = document.getElementById("count-done");

    if (todoElById) todoElById.textContent = String(todoVisible);
    if (inProgElById) inProgElById.textContent = String(inProgVisible);
    if (doneElById) doneElById.textContent = String(doneVisible);

    if (!todoElById && columns.todo) {
      const c = columns.todo.querySelector(".task-count");
      if (c) c.textContent = String(todoVisible);
    }
    if (!inProgElById && columns.in_progress) {
      const c = columns.in_progress.querySelector(".task-count");
      if (c) c.textContent = String(inProgVisible);
    }
    if (!doneElById && columns.done) {
      const c = columns.done.querySelector(".task-count");
      if (c) c.textContent = String(doneVisible);
    }
  }

  // Initial pass so counts reflect default filters
  applyFilters();

  // ---------------- Enable DnD (moved to dnd.js) ----------------
  // IMPORTANT: include BOTH the inner list and the outer col-* wrapper as drop zones
  enableDragAndDrop({
    altIds: {
      todo: ["todo", "col-todo"],
      in_progress: ["in_progress", "col-in_progress"],
      done: ["done", "col-done"],
    },
    onCountsChange: applyFilters, // refresh counts/filters after a drop
  });
});

export {};