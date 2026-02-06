// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ================= CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyAPoD70p24PRrl0gdXIpX2olMNS09kciwU",
  authDomain: "agenda-wanda.firebaseapp.com",
  projectId: "agenda-wanda",
  storageBucket: "agenda-wanda.firebasestorage.app",
  messagingSenderId: "875784453137",
  appId: "1:875784453137:web:50abc6d2cf58c4879ac5b0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ================= VARIÁVEIS =================
const START_DAY = 8;
const END_DAY = 17;
const SLOT = 60;

let adminLogado = false;
let cacheAgenda = [];

// ================= SERVIÇOS =================
const servicos = [
  { id: "estetica_pes", nome: "Estética dos Pés", precoTexto: "R$ 40,00", duracao: 60 },
  { id: "estetica_maos", nome: "Estética das Mãos", precoTexto: "R$ 35,00", duracao: 60 },
  { id: "podologia", nome: "Podologia Completa", precoTexto: "R$ 100,00", duracao: 60 }
];

// ================= UTILS =================
const toDateInput = d =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

const minutos = h => h.split(":").reduce((a,b,i)=>i? a+Number(b):Number(b)*60,0);
const hora = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

// ================= UI =================
function popularServicos(){
  const sel = document.getElementById("servico");
  sel.innerHTML = `<option value="" disabled selected>Selecione</option>`;
  servicos.forEach(s=>{
    const op = document.createElement("option");
    op.value = s.id;
    op.textContent = `${s.nome} (${s.precoTexto})`;
    sel.appendChild(op);
  });
}

async function atualizarHorarios(){
  const data = document.getElementById("data").value;
  const servicoID = document.getElementById("servico").value;
  const horaSel = document.getElementById("hora");
  const msg = document.getElementById("msgHorarios");

  horaSel.innerHTML = "";

  if(!data || !servicoID){
    msg.textContent = "Selecione data e serviço.";
    return;
  }

  const servico = servicos.find(s=>s.id===servicoID);
  const res = await getDocs(query(collection(db,"agendamentos"), where("data","==",data)));
  const ocupados = res.docs.map(d=>minutos(d.data().hora));

  for(let m=START_DAY*60; m<END_DAY*60; m+=SLOT){
    if(!ocupados.includes(m)){
      const op = document.createElement("option");
      op.value = hora(m);
      op.textContent = hora(m);
      horaSel.appendChild(op);
    }
  }

  msg.textContent = horaSel.children.length ? "Horários disponíveis" : "Sem horários";
}

async function agendar(){
  const nome = document.getElementById("nome").value.trim();
  const contato = document.getElementById("contato").value.replace(/\D/g,"");
  const data = document.getElementById("data").value;
  const horaSel = document.getElementById("hora").value;
  const servicoID = document.getElementById("servico").value;

  if(!nome || !contato || !data || !horaSel || !servicoID){
    alert("Preencha todos os campos");
    return;
  }

  const servico = servicos.find(s=>s.id===servicoID);

  await addDoc(collection(db,"agendamentos"),{
    nome,
    nome_normalizado: nome.toLowerCase().trim(),
    contato,
    data,
    hora: horaSel,
    servico: servico.nome,
    precoTexto: servico.precoTexto,
    duracao: servico.duracao
  });

  document.getElementById("sucesso").style.display="block";
  setTimeout(()=>document.getElementById("sucesso").style.display="none",3000);
}

// ================= AGENDA =================
function mostrarAgenda(){
  const wrap = document.getElementById("agenda");
  wrap.innerHTML = "";
  cacheAgenda.forEach(a=>{
    wrap.innerHTML += `
      <div>
        <strong>${a.nome}</strong><br>
        ${a.servico}<br>
        ${a.data} às ${a.hora}
      </div><hr>`;
  });
}

// ================= ADMIN =================
function mostrarLogin(){
  document.getElementById("adminLogin").style.display="block";
}

async function loginAdmin(){
  const email = adminUser.value;
  const pass = adminPass.value;
  await signInWithEmailAndPassword(auth,email,pass);
}

async function logoutAdmin(){
  await signOut(auth);
}

onAuthStateChanged(auth,user=>{
  adminLogado = !!user;
  document.getElementById("adminArea").style.display = user ? "block":"none";
});

function subscribeAgenda(){
  const q = query(collection(db,"agendamentos"), orderBy("data"), orderBy("hora"));
  onSnapshot(q,snap=>{
    cacheAgenda = snap.docs.map(d=>({id:d.id,...d.data()}));
    mostrarAgenda();
  });
}

// ================= INIT =================
window.onload = ()=>{
  document.getElementById("data").min = toDateInput(new Date());
  popularServicos();
  subscribeAgenda();
};

// ================= EXPORT =================
window.agendar = agendar;
window.atualizarHorarios = atualizarHorarios;
window.mostrarLogin = mostrarLogin;
window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
