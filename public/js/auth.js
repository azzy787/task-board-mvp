// auth.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/** Call this from protected pages (e.g., board.js) */
export function ensureAuthed() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        try { window.location.href = "./index.html"; } catch {}
      } else {
        unsub();            // stop listening once confirmed
        resolve(user);
      }
    });
  });
}

/** Optional helper for logout buttons on protected pages */
export function wireLogout(btnId = "logout-btn") {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "./index.html";
    } catch (e) {
      console.error("Failed to logout", e);
      alert("Failed to logout");
    }
  });
}

/* -------- Existing login code (index.html only) -------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const errorEl = document.getElementById("login-error");

  // Only auto-redirect to board if we're on the login page
  if (location.pathname.endsWith("/index.html") || location.pathname.endsWith("/")) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        try { window.location.href = "./board.html"; } catch {}
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailEl?.value?.trim();
      const password = passwordEl?.value || "";
      try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "./board.html";
      } catch (err) {
        console.error("Login failed", err);
        if (errorEl) {
          errorEl.textContent = humanizeAuthError(err?.code) || "Login failed. Please check your credentials.";
          errorEl.classList.remove("hidden");
        } else {
          alert("Login failed");
        }
      }
    });
  }
});

function humanizeAuthError(code) {
  switch (code) {
    case "auth/invalid-email": return "Invalid email format.";
    case "auth/user-disabled": return "This user has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password": return "Incorrect email or password.";
    case "auth/too-many-requests": return "Too many attempts. Please try again later.";
    default: return null;
  }
}

export {};