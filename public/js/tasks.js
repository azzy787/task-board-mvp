// /public/js/tasks.js
import { db } from "./firebase.js";
import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const TASKS = collection(db, "tasks");
const BOARD_META = doc(db, "meta", "board");


export async function createTask(data = {}) {
  const now = serverTimestamp();
  const task = {
    title: (data.title ?? "").toString().slice(0, 100),
    description: (data.description ?? "").toString().slice(0, 2000),
    status: data.status || "todo",
    priority: data.priority || "medium",
    assignee: (data.assignee ?? "").toString().slice(0, 60),
    due_date: data.due_date || null,        // Firestore Timestamp or null
    order: data.order ?? Date.now(),        // simple ascending default
    created_at: now,
    updated_at: now,
  };
  return await addDoc(TASKS, task);
}

export async function updateTask(id, updates = {}) {
  const ref = doc(db, "tasks", id);
  // sanitize limited fields
  const clean = {};
  if ("title" in updates) clean.title = String(updates.title).slice(0, 100);
  if ("description" in updates) clean.description = String(updates.description).slice(0, 2000);
  if ("status" in updates) clean.status = updates.status;
  if ("priority" in updates) clean.priority = updates.priority;
  if ("assignee" in updates) clean.assignee = String(updates.assignee).slice(0, 60);
  if ("due_date" in updates) clean.due_date = updates.due_date ?? null;
  if ("order" in updates) clean.order = updates.order;

  clean.updated_at = serverTimestamp();
  await updateDoc(ref, clean);
}

export async function deleteTask(id) {
  await deleteDoc(doc(db, "tasks", id));
}


export function listenColumn(status, callback) {
  const q = query(TASKS, where("status", "==", status), orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}


export function listenAll(callback) {
  const q = query(TASKS, orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}


export async function moveTask(id, { newStatus, newOrder }) {
  await updateTask(id, {
    status: newStatus,
    order: newOrder,
  });
}


export function computeOrder(prevOrder, nextOrder) {
  if (Number.isFinite(prevOrder) && Number.isFinite(nextOrder)) {
    return (prevOrder + nextOrder) / 2;
  }
  if (!Number.isFinite(prevOrder) && Number.isFinite(nextOrder)) {
    // dropped at top
    return nextOrder - 1000;
  }
  if (Number.isFinite(prevOrder) && !Number.isFinite(nextOrder)) {
    // dropped at bottom
    return prevOrder + 1000;
  }
  // single item in column
  return Date.now();
}

// ---------- Board title meta ----------
export async function getBoardTitle() {
  const snap = await getDoc(BOARD_META);
  return snap.exists() ? snap.data().title : "Team Board";
}
export async function setBoardTitle(title) {
  await setDoc(BOARD_META, { title: String(title).slice(0, 100) }, { merge: true });
}