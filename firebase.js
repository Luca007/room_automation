// firebase.js
// Substitua os valores abaixo pela sua configuração do Firebase.
// Mantenha este arquivo fora de controle de versão público se contiver chaves sensíveis.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// TODO: PREENCHER - copie do console do Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyBBCT86T515f2u-ANG949xH9UhoRyP6AhI',
  authDomain: 'projeto-teste-75626.firebaseapp.com',
  projectId: 'projeto-teste-75626',
  storageBucket: 'projeto-teste-75626.appspot.com',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
