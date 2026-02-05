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
function hhmmParaMinutos(hhmm){ const [h,m] = hhmm.split(":").map(Number); return h*60+m; }
function minutosParaHHMM(min){ const h = String(Math.floor(min/60)).padStart(2,"0"); const m = String(min%60).padStart(2,"0"); return `${h}:${m}`; }
function intervalosSobrepoem(aInicio, aDur, bInicio, bDur){ return (aInicio < bInicio+bDur) && (bInicio < aInicio+aDur); }
function toDateInputValue(d){
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function gerarId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function soDigitos(s){ return (s||"").replace(/\D/g,""); }
function isSunday(dateStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d).getDay() === 0;
}
function isPastDate(dateStr){
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const d = new Date(dateStr+"T00:00:00");
  return d < hoje;
}
function isPastTimeOnDate(dateStr, hhmm){
  const now = new Date();
  const [h,m] = hhmm.split(":").map(Number);
  const target = new Date(dateStr+"T00:00:00");
  target.setHours(h, m, 0, 0);
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
   Storage (migração)
========================= */
function getAgenda(){
  let agenda = JSON.parse(localStorage.getItem("agenda")) || [];
  let changed = false;
  agenda = agenda.map(a=>{
    if(!a.id){ a.id = gerarId(); changed = true; }
    if(!a.duracao){ a.duracao = 60; changed = true; }
    return a;
  });
  if(changed) localStorage.setItem("agenda", JSON.stringify(agenda));
  return agenda;
}
function setAgenda(agenda){ localStorage.setItem("agenda", JSON.stringify(agenda)); }

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
  const nome = document.getElementById("nome").value.trim();
  const contatoRaw = document.getElementById("contato").value.trim();
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
  const agenda = getAgenda().filter(a => a.nome.toLowerCase() === nomeBusca)
                             .sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));

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
  const u = document.getElementById("adminUser").value;
  const p = document.getElementById("adminPass").value;
  if(u===ADMIN_USER && p===ADMIN_PASS){
    adminLogado = true;
    document.getElementById("adminLogin").style.display = "none";
    document.getElementById("adminArea").style.display = "block";
    renderAdminList(); // lista cronológica
  }else{
    alert("Credenciais incorretas.");
  }
}
function logoutAdmin(){
  adminLogado = false;
  document.getElementById("adminArea").style.display = "none";
}

function limparFiltrosAdmin(){
  document.getElementById("adminSearch").value = "";
  document.getElementById("adminOnlyFuture").checked = false;
  document.getElementById("adminDateStart").value = "";
  document.getElementById("adminDateEnd").value = "";
  renderAdminList();
}

/* =========================
   Admin — render lista cronológica
========================= */
function passesFilters(item){
  const q = (document.getElementById("adminSearch").value || "").toLowerCase().trim();
  const onlyFuture = document.getElementById("adminOnlyFuture").checked;
  const ds = document.getElementById("adminDateStart").value;
  const de = document.getElementById("adminDateEnd").value;

  // filtro texto
  if(q){
    const alvo = `${item.nome} ${item.servico} ${item.contato}`.toLowerCase();
    if(!alvo.includes(q)) return false;
  }
  // filtro intervalo
  if(ds && item.data < ds) return false;
  if(de && item.data > de) return false;

  // filtro somente futuros (considera data e hora)
  if(onlyFuture){
    if(item.data < toDateInputValue(new Date())) return false;
    if(item.data === toDateInputValue(new Date()) && isPastTimeOnDate(item.data, item.hora)) return false;
  }

  return true;
}

function statusBadge(item){
  const hoje = toDateInputValue(new Date());
  if(item.data < hoje) return {cls:"past", txt:"Passado"};
  if(item.data > hoje) return {cls:"future", txt:"Futuro"};
  // mesmo dia
  return isPastTimeOnDate(item.data, item.hora) ? {cls:"past", txt:"Passado"} : {cls:"today", txt:"Hoje"};
}

function renderAdminList(){
  const wrap = document.getElementById("adminList");
  const countEl = document.getElementById("adminCount");
  const agenda = getAgenda()
    .sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora))
    .filter(passesFilters);

  wrap.innerHTML = "";
  countEl.textContent = `${agenda.length} registro(s)`;

  if(agenda.length === 0){
    wrap.innerHTML = `<div class="muted">Nenhum agendamento encontrado para os filtros aplicados.</div>`;
    return;
  }

  // Agrupar por data
  let atual = "";
  let grupoEl = null;
  agenda.forEach(item=>{
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

function formatarDataBr(yyyyMMdd){
  const [y,m,d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  const semana = dt.toLocaleDateString('pt-BR', { weekday:'long' });
  const dia = String(d).padStart(2,"0");
  const mes = dt.toLocaleDateString('pt-BR', { month:'long' });
  const ano = y;
  return `${semana}, ${dia} de ${mes} de ${ano}`;
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

