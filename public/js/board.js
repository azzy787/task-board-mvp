// public/js/board.js
"use strict";

import { ensureAuthed, wireLogout } from "./auth.js";
import { listenAll, createTask, getBoardTitle, setBoardTitle, getTasksByTitles, deleteTasks } from "./tasks.js";
import { openTaskModal } from "./ui.js";
import { enableDragAndDrop } from "./dnd.js";

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

  // ---------------- Column handles ----------------
  const altIds = {
    todo: ["todo", "todo-column"],
    in_progress: ["in_progress", "in-progress-column"],
    done: ["done", "done-column"],
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
    wireLogout();        // hooks #logout-btn if present

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
  const seedBtn = document.getElementById("seed-btn");
  if (seedBtn) {
    seedBtn.addEventListener("click", async () => {
      try {
        if (!confirm("Seed sample tasks to Firestore?")) return;
        seedBtn.disabled = true;
        const toDate = (s) => new Date(s);
        const samples = [
          { title: "Review Q3 Marketing Strategy", assignee: "Jingyuan", due_date: toDate("2025-10-15"), priority: "high",   status: "todo",        order: 1000 },
          { title: "Draft User Onboarding Flow",   assignee: "Angela",   due_date: toDate("2025-10-20"), priority: "medium", status: "todo",        order: 2000 },
          { title: "Research Competitor Pricing",  assignee: "Sanchez",  due_date: toDate("2025-10-25"), priority: "low",    status: "todo",        order: 3000 },
          { title: "Finalize Team Board UI Design",assignee: "Angela",   due_date: toDate("2025-10-10"), priority: "high",   status: "in_progress", order: 1000 },
          { title: "Write API Documentation",      assignee: "Jingyuan", due_date: toDate("2025-10-18"), priority: "medium", status: "in_progress", order: 2000 },
          { title: "Set up Firestore Database",    assignee: "Sanchez",  due_date: toDate("2025-09-22"), priority: "high",   status: "done",        order: 1000 },
          { title: "Build Drag & Drop Functionality",assignee: "Angela", due_date: toDate("2025-09-24"), priority: "high",   status: "done",        order: 2000 },
        ];
        // Fetch existing tasks that have the same titles as samples
        const existing = await getTasksByTitles(samples.map((s) => s.title));
        const key = (t) => `${t.title}:::${(t.assignee || "").toLowerCase()}:::${t.status}`;
        const existingKeys = new Set(existing.map(key));
        let created = 0;
        for (const t of samples) {
          const k = key(t);
          if (existingKeys.has(k)) continue; // skip duplicates
          await createTask(t);
          existingKeys.add(k);
          created += 1;
        }
        if (created === 0) {
          alert("No tasks added. Seed items already exist.");
        } else {
          alert(`Seeded ${created} sample task(s).`);
        }
      } catch (err) {
        console.error("Seeding failed", err);
        alert("Failed to seed tasks. Check console.");
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
  enableDragAndDrop({
    altIds: {
      todo: ["todo"],
      in_progress: ["in_progress"],
      done: ["done"],
    },
    onCountsChange: applyFilters, // refresh counts/filters after a drop
  });
});

export {};