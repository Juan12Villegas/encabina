import { initializeApp } from "firebase/app";
import {
    getFirestore,
    where,
    query,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    onSnapshot,
    QuerySnapshot
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Opcional: Conexión al emulador en desarrollo
/* if (process.env.NODE_ENV === 'development') {
    connectFirestoreEmulator(db, 'localhost', 8080);
} */

console.log(process.env.NEXT_PUBLIC_API_KEY); // Para verificar que la clave de API esté cargando correctamente

export {
    db,
    where,
    query,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    onSnapshot,
    QuerySnapshot
};

// Tipos útiles para TypeScript
/* export type { Firestore }; */