// ------------------------
// Firebase (CDN modular)
// ------------------------
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
  doc,
  getDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ------------------------
// SUA CONFIG DO FIREBASE
// ------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAPoD70p24PRrl0gdXIpX2olMNS09kciwU",
  authDomain: "agenda-wanda.firebaseapp.com",
  projectId: "agenda-wanda",
  storageBucket: "agenda-wanda.firebasestorage.app",
  messagingSenderId: "875784453137",
  appId: "1:875784453137:web:50abc6d2cf58c4879ac5b0"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ------------------------
// Config do App
// ------------------------
const telefoneWhatsApp = "5519992880591"; // Admin
const START_DAY_MIN = 8 * 60;
const END_DAY_MIN   = 17 * 60;
const SLOT_MIN      = 60;

const servicos = [
  { id: "estetica_pes",       nome: "Estética dos Pés",         precoTexto: "R$ 40,00",              duracao: 60 },
  { id: "estetica_maos",      nome: "Estética das Mãos",        precoTexto: "R$ 35,00",              duracao: 60 },
  { id: "podologia_completa", nome: "Podologia Completa",       precoTexto: "a partir de R$ 100,00", duracao: 60 },
  { id: "plastica_pes",       nome: "Plástica dos Pés",         precoTexto: "R$ 80,00",              duracao: 60 }
];

let adminLogado = false;
let cacheAgenda = [];
let unsubscribeAgenda = null;

// ------------------------
// Utils (corrigido: parser local, sem UTC)
// ------------------------
function parseDateLocal(dateStr){
  // dateStr 'YYYY-MM-DD' -> Date local 00:00
  const [y,m,d] = (dateStr||"").split("-").map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m-1, d, 0, 0, 0, 0);
}
function hhmmParaMinutos(hhmm){ const [h,m] = (hhmm||"").split(":").map(Number); return (isNaN(h)||isNaN(m)) ? NaN : h*60+m; }
function minutosParaHHMM(min){ if (typeof min !== "number" || isNaN(min)) return ""; const h = String(Math.floor(min/60)).padStart(2,"0"); const m = String(min%60).padStart(2,"0"); return `${h}:${m}`; }
function intervalosSobrepoem(aInicio, aDur, bInicio, bDur){ if([aInicio,aDur,bInicio,bDur].some(v => typeof v!=="number"||isNaN(v))) return false; return (aInicio < bInicio+bDur) && (bInicio < aInicio+aDur); }
function toDateInputValue(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
function soDigitos(s){ return (s||"").replace(/\D/g,""); }
function isSunday(dateStr){ const dt=parseDateLocal(dateStr); if(!dt) return false; return dt.getDay()===0; }
function isPastDate(dateStr){ const hoje=new Date(); hoje.setHours(0,0,0,0); const d=parseDateLocal(dateStr); if(!d) return false; return d < hoje; }
function isPastTimeOnDate(dateStr,hhmm){
  const dt = parseDateLocal(dateStr);
  if(!dt || !hhmm) return false;
  const [h,m] = hhmm.split(":").map(Number);
  dt.setHours(h||0, m||0, 0, 0); // local
  return dt <= new Date();
}
function isToday(dateStr){ const dt=parseDateLocal(dateStr); if(!dt) return false; return toDateInputValue(dt) === toDateInputValue(new Date()); }
function orderByDataHora(a,b){ const ka = `${a.data||"9999-99-99"} ${a.hora||"99:99"}`; const kb = `${b.data||"9999-99-99"} ${b.hora||"99:99"}`; return ka.localeCompare(kb); }
const horariosBase = (()=>{ const a=[]; for(let m=START_DAY_MIN; m + SLOT_MIN <= END_DAY_MIN; m+=SLOT_MIN){ a.push(minutosParaHHMM(m)); } return a; })();

// ------------------------
// UI Helpers
// ------------------------
function popularServicos(){
  const sel = document.getElementById("servico");
  // Placeholder (mantém até o usuário escolher)
  sel.innerHTML = `<option value="" disabled selected>Selecione o serviço</option>`;
  servicos.forEach(s=>{
    const op=document.createElement("option");
    op.value=s.id; op.textContent=`${s.nome} — ${s.precoTexto} (${s.duracao/60}h)`;
    sel.appendChild(op);
  });

  // Ao trocar serviço, limpamos horários e pedimos data+serviço
  sel.onchange = ()=>{
    const horaSel = document.getElementById("hora");
    if (horaSel) horaSel.innerHTML = "";
    const msg = document.getElementById("msgHorarios");
    if (msg) msg.textContent = "Selecione data e serviço.";
    atualizarHorarios();
  };
}

function abrirWhatsApp(url){ try{ window.location.href=url; }catch(e){ window.open(url,"_blank"); } }

// ------------------------
// Firestore — tempo real
// ------------------------
function subscribeAgenda(){
  if (unsubscribeAgenda) unsubscribeAgenda();
  const col = collection(db, "agendamentos");
  const q = query(col, orderBy('data'), orderBy('hora'));
  unsubscribeAgenda = onSnapshot(q, (snap)=>{
    cacheAgenda = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    mostrarAgenda();
    if(adminLogado) renderAdminList();
  }, (err)=>{
    console.error("onSnapshot (agenda) erro:", err);
  });
}

// ------------------------
// Cliente — horários e agenda
// ------------------------
async function atualizarHorarios(){
  const data = document.getElementById("data")?.value;
  const servicoID = document.getElementById("servico")?.value;
  const horaSel = document.getElementById("hora");
  const msg = document.getElementById("msgHorarios");

  if(!horaSel || !msg) return;

  // Limpa a combo antes
  horaSel.innerHTML = "";

  // Validar entrada
  if(!data || !servicoID || servicoID === ""){
    msg.textContent = "Selecione data e serviço.";
    return;
  }
  if(isPastDate(data)){
    msg.textContent = "Data já passou. Escolha outra.";
    return;
  }
  if(isSunday(data)){
    msg.textContent = "Domingo indisponível. Escolha outro dia.";
    return;
  }

  msg.textContent = "Carregando horários…";
  const servico = servicos.find(s=>s.id===servicoID);
  if(!servico){
    msg.textContent="Serviço inválido. Escolha novamente.";
    return;
  }

  // Ocupados do dia
  let ocupados=[];
  try{
    const res = await getDocs(query(collection(db,"agendamentos"), where('data','==',data)));
    ocupados = res.docs.map(d=>({ inicio: hhmmParaMinutos(d.data().hora), dur: d.data().duracao||60 }));
  }catch(e){
    console.error("Erro ao obter ocupados:", e);
    // segue com ocupados=[]
  }

  const sameDay = isToday(data);
  let disponiveis=0;

  for(const hr of horariosBase){
    if(sameDay && isPastTimeOnDate(data, hr)) continue; // só filtra horas passadas se a data for hoje

    const inicio = hhmmParaMinutos(hr);
    const conflita = ocupados.some(o=>intervalosSobrepoem(inicio, servico.duracao, o.inicio, o.dur));
    if(!conflita){
      const op=document.createElement("option");
      op.value=hr; op.textContent=hr;
      horaSel.appendChild(op);
      disponiveis++;
    }
  }

  if(disponiveis>0){
    msg.textContent = "Horários disponíveis:";
  }else{
    msg.textContent = "Nenhum horário disponível nesta data.";
    // Mostra placeholder desabilitado para deixar claro
    const op=document.createElement("option");
    op.value=""; op.textContent="— sem horários —"; op.disabled=true; op.selected=true;
    horaSel.appendChild(op);
  }
}

async function agendar(){
  const nome = (document.getElementById("nome").value||"").trim();
  const contatoRaw = (document.getElementById("contato").value||"").trim();
  const data = document.getElementById("data").value;
  const hora = document.getElementById("hora").value;
  const servicoID = document.getElementById("servico").value;

  if(!nome || !contatoRaw || !data || !hora || !servicoID){ alert("Preencha todos os campos."); return; }
  if(isPastDate(data)){ alert("Data já passou."); return; }
  if(isSunday(data)){ alert("Domingo indisponível."); return; }
  if(isToday(data) && isPastTimeOnDate(data,hora)){ alert("Horário já passou."); return; }

  const servico = servicos.find(s=>s.id===servicoID);
  if(!servico){ alert("Serviço inválido."); return; }

  // Checar conflito
  try{
    const res = await getDocs(query(collection(db,"agendamentos"), where('data','==',data)));
    const inicio = hhmmParaMinutos(hora);
    const conflita = res.docs.some(doc=>{
      const a = doc.data();
      return intervalosSobrepoem(inicio, servico.duracao, hhmmParaMinutos(a.hora), a.duracao||60);
    });
    if(conflita){ alert("Conflito de horário. Escolha outro horário."); atualizarHorarios(); return; }
  }catch(e){
    console.error("Erro ao checar conflito:", e);
    alert("Não foi possível verificar conflitos agora. Tente novamente.");
    return;
  }

  const contato = soDigitos(contatoRaw);
  const registro = {
    nome, contato, data, hora,
    servico: servico.nome,
    precoTexto: servico.precoTexto,
    duracao: servico.duracao
  };

  try{
    await addDoc(collection(db,"agendamentos"), registro);

    const success=document.getElementById("sucesso");
    if(success){ success.style.display="block"; setTimeout(()=>success.style.display="none",3000); }

    atualizarHorarios();

    const msg =
`Olá! 💅
Novo agendamento:

👤 ${nome}
💬 Contato: +55 ${contato}
💆 ${servico.nome}
💵 ${servico.precoTexto}
⏱️ ${servico.duracao/60}h
📅 ${data}
⏰ ${hora}`;
    abrirWhatsApp(`https://wa.me/${telefoneWhatsApp}?text=${encodeURIComponent(msg)}`);

  }catch(e){
    console.error("Erro ao salvar agendamento:", e);
    alert("Não foi possível salvar o agendamento agora. Tente novamente.");
  }
}

async function cancelarCliente(id){
  if(!confirm("Deseja cancelar este agendamento?")) return;
  try{
    await deleteDoc(doc(db,"agendamentos",id));
  }catch(e){
    console.error("Erro ao cancelar (cliente):", e);
    alert("Não foi possível cancelar agora.");
  }
}

// ------------------------
// Lista pública (sem filtro)
// ------------------------
function mostrarAgenda(){
  const wrap=document.getElementById("agenda");
  const agenda=cacheAgenda.slice().sort(orderByDataHora);

  wrap.innerHTML="";
  if(agenda.length===0){ wrap.innerHTML=`<div class="muted">Nenhum agendamento encontrado.</div>`; return; }

  wrap.innerHTML += `<div class="muted" style="margin-bottom:8px">${agenda.length} agendamento(s)</div>`;
  agenda.forEach(a=>{
    wrap.innerHTML += `
      <div class="item">
        <strong>${a.nome}</strong><br/>
        ${a.servico} — ${a.precoTexto}<br/>
        WhatsApp: +55 ${a.contato}<br/>
        ${a.data} às ${a.hora}<br/>
        <button class="btn-danger" onclick="cancelarCliente('${a.id}')">Cancelar</button>
      </div>`;
  });
}

// ------------------------
// Admin — Auth + UI
// ------------------------
function mostrarLogin(){
  const loginBox = document.getElementById("adminLogin");
  const adminArea = document.getElementById("adminArea");
  if(!loginBox) return;
  if(adminArea && adminArea.style.display==="block") return;
  loginBox.style.display="block";
  document.getElementById("adminUser")?.focus();
}

async function loginAdmin(){
  const email = (document.getElementById("adminUser")?.value||"").trim();
  const pass  = (document.getElementById("adminPass")?.value||"").trim();
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    console.error("Login falhou:", e);
    alert("Credenciais incorretas ou erro de rede.");
  }
}

async function logoutAdmin(){
  try{ await signOut(auth); }catch(e){ console.error(e); }
}

onAuthStateChanged(auth, (user)=>{
  const loginBox = document.getElementById("adminLogin");
  const adminArea = document.getElementById("adminArea");
  adminLogado = !!user;
  if(adminLogado){
    if(loginBox) loginBox.style.display="none";
    if(adminArea) adminArea.style.display="block";
    renderAdminList();
  }else{
    if(adminArea) adminArea.style.display="none";
    if(loginBox) loginBox.style.display="none";
  }
});

// ------------------------
// Admin — render + ações
// ------------------------
function statusBadge(item){
  const hoje = toDateInputValue(new Date());
  if(item.data < hoje) return {cls:"past", txt:"Passado"};
  if(item.data > hoje) return {cls:"future", txt:"Futuro"};
  return isPastTimeOnDate(item.data,item.hora) ? {cls:"past",txt:"Passado"} : {cls:"today",txt:"Hoje"};
}

function formatarDataBr(yyyyMMdd){
  const dt = parseDateLocal(yyyyMMdd);
  if(!dt) return yyyyMMdd||"-";
  const semana = dt.toLocaleDateString('pt-BR', { weekday:'long' });
  const dia    = String(dt.getDate()).padStart(2,"0");
  const mes    = dt.toLocaleDateString('pt-BR', { month:'long' });
  const ano    = dt.getFullYear();
  return `${semana}, ${dia} de ${mes} de ${ano}`;
}

async function cancelarAdminById(id){
  if(!confirm("Deseja cancelar este horário?")) return;
  try{
    const ref = doc(db,"agendamentos",id);
    const snap = await getDoc(ref);
    if(!snap.exists()) return;
    const item = { id:snap.id, ...snap.data() };

    await deleteDoc(ref);

    const msgCliente =
`Olá ${item.nome}! ❌
Seu agendamento foi cancelado pelo administrador.
${item.servico}
📅 ${item.data} ⏰ ${item.hora}

Se quiser remarcar, é só responder esta mensagem.`;
    const foneCliente = `55${soDigitos(item.contato)}`;
    if(foneCliente.length>=12){
      abrirWhatsApp(`https://wa.me/${foneCliente}?text=${encodeURIComponent(msgCliente)}`);
    }else{
      alert("Não foi possível enviar ao cliente (WhatsApp inválido).");
    }
  }catch(e){
    console.error("Erro ao cancelar (admin):", e);
    alert("Não foi possível cancelar agora.");
  }
}

function renderAdminList(){
  const wrap = document.getElementById("adminList");
  const countEl = document.getElementById("adminCount");
  const agenda = cacheAgenda.slice().sort(orderByDataHora);

  wrap.innerHTML="";
  if(countEl) countEl.textContent=`${agenda.length} registro(s)`;
  if(agenda.length===0){ wrap.innerHTML=`<div class="muted">Nenhum agendamento encontrado.</div>`; return; }

  let atual=""; let grupoEl=null;
  agenda.forEach(item=>{
    if(item.data !== atual){
      atual=item.data;
      grupoEl=document.createElement("div");
      grupoEl.className="date-group";
      grupoEl.innerHTML=`
        <div class="group-header">
          <div class="group-title">${formatarDataBr(atual)}</div>
          <div class="group-count"></div>
        </div>`;
      wrap.appendChild(grupoEl);
    }
    const badge = statusBadge(item);
    const row=document.createElement("div");
    row.className="admin-item";
    row.innerHTML=`
      <div class="slot">
        <div class="time">
          <span class="chip">${item.hora}</span>
          <span class="badge ${badge.cls}">${badge.txt}</span>
        </div>
      </div>
      <div class="details">
        <div><strong>${item.servico}</strong> — <span class="muted">${item.precoTexto}</span></div>
        <div>Cliente: <strong>${item.nome}</strong></div>
        <div>WhatsApp: +55 ${item.contato || '-'}</div>
      </div>
      <div class="actions">
        <button class="btn-danger" onclick="cancelarAdminById('${item.id}')">Cancelar</button>
      </div>`;
    grupoEl.appendChild(row);
  });

  [...wrap.querySelectorAll(".date-group")].forEach(group=>{
    const items = group.querySelectorAll(".admin-item").length;
    const el = group.querySelector(".group-count");
    if(el) el.textContent = `${items} agendamento(s)`;
  });
}

// ------------------------
// Inicialização
// ------------------------
window.addEventListener('DOMContentLoaded', ()=>{
  // Define 'min' da data = hoje (evita datas passadas no seletor)
  const dataEl = document.getElementById("data");
  if (dataEl) dataEl.min = toDateInputValue(new Date());

  popularServicos();

  const msg = document.getElementById("msgHorarios");
  if (msg) msg.textContent = "Selecione data e serviço.";

  // Assina a coleção em tempo real
  subscribeAgenda();
});

// ------------------------
// Expor funções ao HTML (script module)
// ------------------------
window.mostrarLogin       = mostrarLogin;
window.loginAdmin         = loginAdmin;
window.logoutAdmin        = logoutAdmin;
window.atualizarHorarios  = atualizarHorarios;
window.agendar            = agendar;
window.cancelarCliente    = cancelarCliente;
window.cancelarAdminById  = cancelarAdminById;
