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
    todo: ["todo", "todo-column", "col-todo"],
    in_progress: ["in_progress", "in-progress-column", "col-in_progress"],
    done: ["done", "done-column", "col-done"],
  };
  const map = altIds || defaultAltIds;

  // Returns the *inner list* (#todo/#in_progress/#done) for a given base element
  function resolveList(baseEl, statusKey) {
    const ids = map[statusKey] || [statusKey];
    // Prefer the inner list if it's inside the base element
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el === baseEl) return el;
      if (baseEl.contains(el)) return el;
    }
    // Fallback to the base element (still works if listeners are attached directly to the list)
    return baseEl;
  }

  function firstPresentId(ids = []) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  const statuses = ["todo", "in_progress", "done"];

  statuses.forEach((statusKey) => {
    // Attach listeners to *every* plausible element for that status (outer and inner)
    const possibleIds = map[statusKey] || [statusKey];
    possibleIds.forEach((id) => {
      const hostEl = document.getElementById(id);
      if (!hostEl) return;

      hostEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        hostEl.classList.add("drag-over");
      });

      hostEl.addEventListener("dragenter", () => {
        hostEl.classList.add("drag-over");
      });

      hostEl.addEventListener("dragleave", (e) => {
        // Only remove when actually leaving the host (not entering a child)
        if (e.target === hostEl) hostEl.classList.remove("drag-over");
      });

      hostEl.addEventListener("drop", async (e) => {
        e.preventDefault();

        const taskId = e.dataTransfer?.getData("text/plain");
        if (!taskId) return;

        const card = document.querySelector(`[data-id='${taskId}']`);
        if (!card) return;

        const prevStatus = card.dataset.status;
        const newStatus = statusKey;

        // Always insert into the inner list (even if the event fired on the outer column)
        const listEl = resolveList(hostEl, statusKey);

        // Compute insert position relative to siblings in the inner list
        const afterElement = getDragAfterElement(listEl, e.clientY);
        if (afterElement == null) listEl.appendChild(card);
        else listEl.insertBefore(card, afterElement);

        // Figure out neighbors to compute a stable fractional order
        const siblings = Array.from(listEl.querySelectorAll("div[draggable]"));
        const index = siblings.indexOf(card);
        const prevOrder = index > 0 ? numOrUndef(siblings[index - 1].dataset.order) : undefined;
        const nextOrder = index < siblings.length - 1 ? numOrUndef(siblings[index + 1].dataset.order) : undefined;
        const newOrder = computeOrder(prevOrder, nextOrder);

        try {
          await moveTask(taskId, { newStatus, newOrder });
          card.dataset.status = newStatus;
          card.dataset.order = String(newOrder);
        } catch (err) {
          console.error("Failed to move task:", err);
          alert("Failed to move task, try again.");
          // Revert to previous column's inner list
          const prevHost = firstPresentId(map[prevStatus] || [prevStatus]);
          const prevList = prevHost ? resolveList(prevHost, prevStatus) : null;
          if (prevList) prevList.appendChild(card);
        } finally {
          hostEl.classList.remove("drag-over");
          if (typeof onCountsChange === "function") {
            try { onCountsChange(); } catch {}
          }
        }
      });
    });
  });

  function numOrUndef(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  // Find the element we should insert before, based on pointer Y, **within that list**
  function getDragAfterElement(listEl, y) {
    const items = [...listEl.querySelectorAll("div[draggable]")].filter(
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