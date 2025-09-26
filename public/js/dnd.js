// public/js/dnd.js
"use strict";

import { computeOrder, moveTask } from "./tasks.js";

/**
 * Enable drag-and-drop on the task columns.
 * @param {Object} opts
 * @param {Record<string,string[]>} opts.altIds - mapping of status -> possible element IDs (drop zones)
 * @param {Function} opts.onCountsChange - callback after successful move (e.g., applyFilters or updateColumnCounts)
 */
export function enableDragAndDrop({ altIds, onCountsChange } = {}) {
  const defaultAltIds = {
    todo: ["todo", "todo-column"],
    in_progress: ["in_progress", "in-progress-column"],
    done: ["done", "done-column"],
  };
  const map = altIds || defaultAltIds;

  function firstPresent(ids = []) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  const statuses = ["todo", "in_progress", "done"];

  statuses.forEach((statusKey) => {
    const possibleIds = map[statusKey] || [statusKey];
    possibleIds.forEach((id) => {
      const columnEl = document.getElementById(id);
      if (!columnEl) return;

      // Make empty columns easier to hit
      columnEl.style.minHeight = columnEl.style.minHeight || "40px";

      columnEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        columnEl.classList.add("drag-over");
      });

      columnEl.addEventListener("dragenter", () => {
        columnEl.classList.add("drag-over");
      });

      columnEl.addEventListener("dragleave", (e) => {
        if (e.target === columnEl) columnEl.classList.remove("drag-over");
      });

      columnEl.addEventListener("drop", async (e) => {
        e.preventDefault();

        const taskId = e.dataTransfer?.getData("text/plain");
        if (!taskId) return;

        const card = document.querySelector(`[data-id='${taskId}']`);
        if (!card) return;

        const prevStatus = card.dataset.status;
        const newStatus = statusKey;

        // Determine neighbors BEFORE inserting (card still has .dragging)
        const afterElement = getDragAfterElement(columnEl, e.clientY);

        // next = the element we’re dropping before (if any)
        const nextOrder = numberOrUndef(afterElement?.dataset?.order);

        // prev = the last draggable BEFORE `afterElement` (or the last child if afterElement is null)
        let prevOrder;
        if (afterElement) {
          // previous draggable sibling of afterElement (skip any 'dragging' item)
          const prev = previousDraggableSibling(afterElement);
          prevOrder = numberOrUndef(prev?.dataset?.order);
        } else {
          // dropping to the end: take the last non-dragging child
          const last = lastNonDraggingDraggable(columnEl);
          prevOrder = numberOrUndef(last?.dataset?.order);
        }

        const newOrder = computeOrder(prevOrder, nextOrder);

        // Now insert optimistically in the DOM
        if (afterElement == null) columnEl.appendChild(card);
        else columnEl.insertBefore(card, afterElement);

        try {
          // Persist (updates status + order)
          await moveTask(taskId, { newStatus, newOrder });
          card.dataset.status = newStatus;
          card.dataset.order = String(newOrder);
        } catch (err) {
          console.error("Failed to move task:", err);
          alert("Failed to move task, try again.");
          // Revert DOM on failure
          const prevColEl = firstPresent(map[prevStatus] || [prevStatus]);
          if (prevColEl) prevColEl.appendChild(card);
        } finally {
          columnEl.classList.remove("drag-over");
          if (typeof onCountsChange === "function") {
            try { onCountsChange(); } catch {}
          }
        }
      });
    });
  });

  function numberOrUndef(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  function previousDraggableSibling(el) {
    let p = el.previousElementSibling;
    while (p) {
      if (p.matches?.("div[draggable]") && !p.classList.contains("dragging")) return p;
      p = p.previousElementSibling;
    }
    return null;
  }

  function lastNonDraggingDraggable(container) {
    const all = [...container.querySelectorAll("div[draggable]")];
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i];
      if (!el.classList.contains("dragging")) return el;
    }
    return null;
  }

  // Find the element we should insert before, based on pointer Y
  function getDragAfterElement(container, y) {
    const items = [...container.querySelectorAll("div[draggable]")].filter(
      (el) => !el.classList.contains("dragging")
    );
    if (items.length === 0) return null; // empty column = append

    return items.reduce(
      (closest, el) => {
        const box = el.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);
        return offset < 0 && offset > closest.offset ? { offset, element: el } : closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }
}

export {};