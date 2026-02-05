/* =========================
   CONFIG
========================= */
// Telefone do ADMIN no WhatsApp (somente dígitos, com DDI)
const telefoneWhatsApp = "5519992880591";

// Funcionamento: Seg(1) a Sáb(6), 08:00–17:00 | slots de 1h (último início 16:00)
const START_DAY_MIN = 8 * 60;
const END_DAY_MIN   = 17 * 60;
const SLOT_MIN      = 60;

// Serviços
const servicos = [
  { id: "estetica_pes",       nome: "Estética dos Pés",         precoTexto: "R$ 40,00",              duracao: 60 },
  { id: "estetica_maos",      nome: "Estética das Mãos",        precoTexto: "R$ 35,00",              duracao: 60 },
  { id: "podologia_completa", nome: "Podologia Completa",       precoTexto: "a partir de R$ 100,00", duracao: 60 },
  { id: "plastica_pes",       nome: "Plástica dos Pés",         precoTexto: "R$ 80,00",              duracao: 60 }
];

let adminLogado = false;

/* =========================
   Utils
========================= */
function hhmmParaMinutos(hhmm){ const [h,m] = (hhmm||"").split(":").map(Number); return (isNaN(h)||isNaN(m)) ? NaN : h*60+m; }
function minutosParaHHMM(min){
  if (typeof min !== "number" || isNaN(min)) return "";
  const h = String(Math.floor(min/60)).padStart(2,"0");
  const m = String(min%60).padStart(2,"0");
  return `${h}:${m}`;
}
function intervalosSobrepoem(aInicio, aDur, bInicio, bDur){
  if ([aInicio,aDur,bInicio,bDur].some(v => typeof v!=="number" || isNaN(v))) return false;
  return (aInicio < bInicio+bDur) && (bInicio < aInicio+aDur);
}
function toDateInputValue(d){
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function gerarId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function soDigitos(s){ return (s||"").replace(/\D/g,""); }
function isSunday(dateStr){
  if(!dateStr) return false;
  const [y,m,d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return dt.getDay() === 0;
}
function isPastDate(dateStr){
  if(!dateStr) return false;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const d = new Date(dateStr+"T00:00:00");
  return d < hoje;
}
function isPastTimeOnDate(dateStr, hhmm){
  if(!dateStr || !hhmm) return false;
  const now = new Date();
  const [h,m] = hhmm.split(":").map(Number);
  const target = new Date(dateStr+"T00:00:00");
  target.setHours(h||0, m||0, 0, 0);
  return target <= now;
}
function gerarHorariosBase(){
  const arr = [];
  for(let m=START_DAY_MIN; m + SLOT_MIN <= END_DAY_MIN; m += SLOT_MIN){
    arr.push(minutosParaHHMM(m));
  }
  return arr;
}
const horariosBase = gerarHorariosBase();

/* =========================
   Storage (migração e saneamento)
========================= */
function saneaRegistro(a){
  // Corrige tipos e defaults
  const sane = {...a};
  if(!sane.id) sane.id = gerarId();
  if(!sane.duracao || typeof sane.duracao!=="number") sane.duracao = 60;
  if(typeof sane.nome !== "string") sane.nome = String(sane.nome||"").trim();
  if(typeof sane.contato !== "string") sane.contato = soDigitos(sane.contato);
  if(typeof sane.servico !== "string") sane.servico = String(sane.servico||"").trim();
  if(typeof sane.precoTexto !== "string") sane.precoTexto = String(sane.precoTexto||"").trim();
  if(typeof sane.data !== "string") sane.data = String(sane.data||"").trim();
  if(typeof sane.hora !== "string") sane.hora = String(sane.hora||"").trim();
  return sane;
}
function isRegistroValido(a){
  // Considero válido apenas se tiver data e hora no formato básico
  return a && /^\d{4}-\d{2}-\d{2}$/.test(a.data||"") && /^\d{2}:\d{2}$/.test(a.hora||"");
}
function getAgenda(){
  let raw;
  try { raw = localStorage.getItem("agenda"); } catch(e){ raw = null; }
  let lista = [];
  if(raw){
    try { lista = JSON.parse(raw) || []; } catch(e){
      console.warn("⚠️ agenda corrompida no localStorage; limpando…", e);
      lista = [];
      try { localStorage.removeItem("agenda"); } catch(_) {}
    }
  }
  // saneamento
  const saneados = lista.map(saneaRegistro);
  // separa inválidos
  const validos = [], invalidos = [];
  saneados.forEach(a => (isRegistroValido(a) ? validos : invalidos).push(a));
  if(invalidos.length){
    console.warn(`⚠️ Removendo ${invalidos.length} registro(s) inválido(s) do localStorage (sem data/hora).`, invalidos);
    try { localStorage.setItem("agenda", JSON.stringify(validos)); } catch(_) {}
  }
  return validos;
}
function setAgenda(agenda){
  try { localStorage.setItem("agenda", JSON.stringify(agenda)); } catch(e){
    console.error("Erro ao salvar agenda:", e);
  }
}

/* =========================
   Cliente — serviços e horários
========================= */
function popularServicos(){
  const sel = document.getElementById("servico");
  sel.innerHTML = `<option value="" disabled selected>Selecione o serviço</option>`;
  servicos.forEach(s=>{
    const op = document.createElement("option");
    op.value = s.id;
    op.textContent = `${s.nome} — ${s.precoTexto} (${s.duracao/60}h)`;
    sel.appendChild(op);
  });
  sel.onchange = atualizarHorarios;
}

function atualizarHorarios(){
  const data = document.getElementById("data").value;
  const selServico = document.getElementById("servico").value;
  const horaSel = document.getElementById("hora");
  const msg = document.getElementById("msgHorarios");

  horaSel.innerHTML = "";

  if(!data || !selServico){
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

  const servico = servicos.find(s=>s.id===selServico);
  const agenda = getAgenda();
  const ocupados = agenda
    .filter(a => a.data === data)
    .map(a => ({inicio: hhmmParaMinutos(a.hora), dur: a.duracao}));

  let disponiveis = 0;
  for(const hr of horariosBase){
    // Oculta horas passadas hoje
    if(!isPastDate(data) && isPastTimeOnDate(data, hr)) continue;

    const inicio = hhmmParaMinutos(hr);
    const conflita = ocupados.some(o=>intervalosSobrepoem(inicio, servico.duracao, o.inicio, o.dur));
    if(!conflita){
      const op = document.createElement("option");
      op.value = hr; op.textContent = hr;
      horaSel.appendChild(op);
      disponiveis++;
    }
  }
  msg.textContent = (disponiveis>0) ? "Horários disponíveis:" : "Nenhum horário disponível nesta data.";
}

/* =========================
   Cliente — agendar / cancelar
========================= */
function agendar(){
  const nome = (document.getElementById("nome").value||"").trim();
  const contatoRaw = (document.getElementById("contato").value||"").trim();
  const data = document.getElementById("data").value;
  const hora = document.getElementById("hora").value;
  const servicoID = document.getElementById("servico").value;

  if(!nome || !contatoRaw || !data || !hora || !servicoID){
    alert("Preencha todos os campos."); return;
  }
  if(isPastDate(data)){ alert("Data já passou."); return; }
  if(isSunday(data)){ alert("Domingo indisponível."); return; }
  if(isPastTimeOnDate(data, hora)){ alert("Horário já passou."); return; }

  const servico = servicos.find(s=>s.id===servicoID);
  const agenda = getAgenda();

  // mesmo slot (mesma data/hora) + conflito de duração (1h)
  const inicio = hhmmParaMinutos(hora);
  if(agenda.some(a => a.data===data && a.hora===hora)){
    alert("Este horário já está ocupado."); atualizarHorarios(); return;
  }
  const conflita = agenda
    .filter(a=>a.data===data)
    .some(a=>intervalosSobrepoem(inicio, servico.duracao, hhmmParaMinutos(a.hora), a.duracao));
  if(conflita){
    alert("Conflito de horário. Escolha outro horário."); atualizarHorarios(); return;
  }

  const contato = soDigitos(contatoRaw);
  const registro = {
    id: gerarId(),
    nome,
    contato, // só dígitos
    data,
    hora,
    servico: servico.nome,
    precoTexto: servico.precoTexto,
    duracao: servico.duracao
  };
  agenda.push(registro);
  setAgenda(agenda);

  document.getElementById("sucesso").style.display = "block";
  setTimeout(()=>document.getElementById("sucesso").style.display="none", 3000);

  mostrarAgenda(); atualizarHorarios();
  if(adminLogado){ renderAdminList(); }

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
}

function abrirWhatsApp(url){
  try{ window.location.href = url; } catch(e){ window.open(url, "_blank"); }
}

function mostrarAgenda(){
  const wrap = document.getElementById("agenda");
  const nomeBusca = (document.getElementById("nome").value || "").toLowerCase().trim();
  const agenda = getAgenda().filter(a => (a.nome||"").toLowerCase().trim() === nomeBusca)
                             .sort((a,b)=>{
                               const ka = `${a.data||"9999-99-99"} ${a.hora||"99:99"}`;
                               const kb = `${b.data||"9999-99-99"} ${b.hora||"99:99"}`;
                               return ka.localeCompare(kb);
                             });

  wrap.innerHTML = "";
  if(agenda.length===0){ wrap.innerHTML = `<div class="muted">Nenhum agendamento encontrado.</div>`; return; }

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

function cancelarCliente(id){
  if(!confirm("Deseja cancelar este agendamento?")) return;

  const agenda = getAgenda();
  const idx = agenda.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const item = agenda[idx];

  agenda.splice(idx,1);
  setAgenda(agenda);

  mostrarAgenda(); atualizarHorarios();
  if(adminLogado){ renderAdminList(); }

  const msg =
`⚠️ Cancelamento pelo cliente

👤 ${item.nome}
💬 Contato: +55 ${item.contato}
💆 ${item.servico}
📅 ${item.data}
⏰ ${item.hora}`;
  abrirWhatsApp(`https://wa.me/${telefoneWhatsApp}?text=${encodeURIComponent(msg)}`);
}

/* =========================
   Admin — login e UI
========================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

function mostrarLogin(){ document.getElementById("adminLogin").style.display = "block"; }
function loginAdmin(){
  const u = (document.getElementById("adminUser").value||"").trim();
  const p = (document.getElementById("adminPass").value||"").trim();
  if(u===ADMIN_USER && p===ADMIN_PASS){
    adminLogado = true;
    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminArea").style.display = "block";
    renderAdminList(); // MOSTRA TUDO (sem filtros)
  }else{
    alert("Credenciais incorretas.");
  }
}
function logoutAdmin(){
  adminLogado = false;
  document.getElementById("adminArea").style.display = "none";
}

/* =========================
   Admin — render lista (sem filtros)
========================= */
function statusBadge(item){
  const hoje = toDateInputValue(new Date());
  if(item.data < hoje) return {cls:"past", txt:"Passado"};
  if(item.data > hoje) return {cls:"future", txt:"Futuro"};
  // mesmo dia
  return isPastTimeOnDate(item.data, item.hora) ? {cls:"past", txt:"Passado"} : {cls:"today", txt:"Hoje"};
}

function formatarDataBr(yyyyMMdd){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMMdd||"")) return yyyyMMdd||"-";
  const [y,m,d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  const semana = dt.toLocaleDateString('pt-BR', { weekday:'long' });
  const dia = String(d).padStart(2,"0");
  const mes = dt.toLocaleDateString('pt-BR', { month:'long' });
  const ano = y;
  return `${semana}, ${dia} de ${mes} de ${ano}`;
}

function renderAdminList(){
  const wrap = document.getElementById("adminList");
  const countEl = document.getElementById("adminCount");

  let agenda = getAgenda();

  // Ordenação resiliente
  agenda.sort((a,b)=>{
    const ka = `${a.data||"9999-99-99"} ${a.hora||"99:99"}`;
    const kb = `${b.data||"9999-99-99"} ${b.hora||"99:99"}`;
    return ka.localeCompare(kb);
  });

  wrap.innerHTML = "";
  countEl.textContent = `${agenda.length} registro(s)`;

  if(agenda.length === 0){
    wrap.innerHTML = `<div class="muted">Nenhum agendamento encontrado.</div>`;
    return;
  }

  // Agrupar por data
  let atual = "";
  let grupoEl = null;
  agenda.forEach(item=>{
    if(!isRegistroValido(item)){
      console.warn("Ignorando registro inválido (sem data/hora):", item);
      return;
    }
    if(item.data !== atual){
      atual = item.data;
      grupoEl = document.createElement("div");
      grupoEl.className = "date-group";
      grupoEl.innerHTML = `
        <div class="group-header">
          <div class="group-title">${formatarDataBr(atual)}</div>
          <div class="group-count"></div>
        </div>
      `;
      wrap.appendChild(grupoEl);
    }

    const badge = statusBadge(item);
    const row = document.createElement("div");
    row.className = "admin-item";
    row.innerHTML = `
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
      </div>
    `;
    grupoEl.appendChild(row);
  });

  // Atualiza contagem por grupo
  [...wrap.querySelectorAll(".date-group")].forEach(group=>{
    const items = group.querySelectorAll(".admin-item").length;
    group.querySelector(".group-count").textContent = `${items} agendamento(s)`;
  });
}

/* =========================
   Admin — cancelar (mensagem ao cliente)
========================= */
function cancelarAdminById(id){
  if(!confirm("Deseja cancelar este horário?")) return;

  const agenda = getAgenda();
  const idx = agenda.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const item = agenda[idx];

  agenda.splice(idx,1);
  setAgenda(agenda);

  // Mensagem ao cliente
  const msgCliente =
`Olá ${item.nome}! ❌
Seu agendamento foi cancelado pelo administrador.
${item.servico}
📅 ${item.data} ⏰ ${item.hora}

Se quiser remarcar, é só responder esta mensagem.`;
  const foneCliente = `55${soDigitos(item.contato)}`;
  if(foneCliente.length >= 12){
    abrirWhatsApp(`https://wa.me/${foneCliente}?text=${encodeURIComponent(msgCliente)}`);
  }else{
    alert("Não foi possível enviar ao cliente (WhatsApp inválido).");
  }

  // Atualiza lista admin
  renderAdminList();
}

/* =========================
   Exportar CSV (sem filtros)
========================= */
function exportarCSV(){
  const agenda = getAgenda()
    .sort((a,b)=>{
      const ka = `${a.data||"9999-99-99"} ${a.hora||"99:99"}`;
      const kb = `${b.data||"9999-99-99"} ${b.hora||"99:99"}`;
      return ka.localeCompare(kb);
    });

  if(agenda.length === 0){
    alert("Não há agendamentos para exportar.");
    return;
  }

  const headers = ["id","nome","contato","servico","preco","duracao_min","data","hora"];
  const linhas = agenda.map(a => ([
    a.id,
    `"${(a.nome||"").replace(/"/g,'""')}"`,
    `"${(a.contato||"").replace(/"/g,'""')}"`,
    `"${(a.servico||"").replace(/"/g,'""')}"`,
    `"${(a.precoTexto||"").replace(/"/g,'""')}"`,
    a.duracao || 60,
    a.data || "",
    a.hora || ""
  ].join(",")));

  const csv = [headers.join(","), ...linhas].join("\n");
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `agendamentos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

/* =========================
   Inicialização
========================= */
window.addEventListener('DOMContentLoaded', ()=>{
  popularServicos();
  document.getElementById("msgHorarios").textContent = "Selecione data e serviço.";
  // migra + saneia imediatamente (evita travar o admin)
  getAgenda();
  mostrarAgenda();
});
