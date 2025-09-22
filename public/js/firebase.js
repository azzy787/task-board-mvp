// /public/js/firebase.js
export const firebaseConfig = {
    apiKey: "AIzaSyBJGz-CNCvVmIp0eHtG4O41ZsfIOXBg21g",
    authDomain: "task-board-mvp.firebaseapp.com",
    projectId: "task-board-mvp",
    storageBucket: "task-board-mvp.appspot.com",
    messagingSenderId: "499612502328",
    appId: "1:499612502328:web:7c0706d24a737b931f9cd"
  };
  
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import { getFirestore, serverTimestamp } 
                            from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
  
  export const app = initializeApp(firebaseConfig);
  export const auth = getAuth(app);
  export const db   = getFirestore(app);
  export const ts   = serverTimestamp;