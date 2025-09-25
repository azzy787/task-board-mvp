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

        // Optimistic DOM placement at the drop position
        const afterElement = getDragAfterElement(columnEl, e.clientY);
        if (afterElement == null) columnEl.appendChild(card);
        else columnEl.insertBefore(card, afterElement);

        // Figure out neighbors to compute a stable fractional order
        const siblings = Array.from(columnEl.querySelectorAll("div[draggable]"));
        const index = siblings.indexOf(card);
        const prevOrder = index > 0 ? numberOrUndef(siblings[index - 1].dataset.order) : undefined;
        const nextOrder = index < siblings.length - 1 ? numberOrUndef(siblings[index + 1].dataset.order) : undefined;
        const newOrder = computeOrder(prevOrder, nextOrder);

        try {
          // Persist using Dev-A helper (also updates status)
          await moveTask(taskId, { newStatus, newOrder });
          card.dataset.status = newStatus;
          card.dataset.order = String(newOrder);
        } catch (err) {
          console.error("Failed to move task:", err);
          alert("Failed to move task, try again.");
          // Revert DOM if Firestore write failed
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

  // Find the element we should insert before, based on pointer Y
  function getDragAfterElement(container, y) {
    const items = [...container.querySelectorAll("div[draggable]")].filter(
      (el) => !el.classList.contains("dragging")
    );
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