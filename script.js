/* =========================
   Admin — login e UI (robusto)
========================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

function mostrarLogin(){
  const loginBox = document.getElementById("adminLogin");
  const adminArea = document.getElementById("adminArea");

  if(!loginBox){
    console.error("Elemento #adminLogin não encontrado no DOM.");
    return;
  }
  // Se a área do admin estiver aberta, não sobrepor
  if (adminArea && adminArea.style.display === "block") return;

  loginBox.style.display = "block";

  // Foco no usuário para agilizar
  const userEl = document.getElementById("adminUser");
  if(userEl){ userEl.focus(); }
}

function loginAdmin(){
  const u = (document.getElementById("adminUser")?.value || "").trim();
  const p = (document.getElementById("adminPass")?.value || "").trim();

  if(u === ADMIN_USER && p === ADMIN_PASS){
    adminLogado = true;

    // Persistir sessão apenas durante a aba (opcional)
    try { sessionStorage.setItem("adminLogado", "1"); } catch(e) {}

    const loginBox = document.getElementById("adminLogin");
    const adminArea = document.getElementById("adminArea");
    if(loginBox) loginBox.style.display = "none";
    if(adminArea) adminArea.style.display = "block";

    renderAdminList();
  }else{
    alert("Credenciais incorretas.");
    // Mantém o login aberto para tentar novamente
  }
}

function logoutAdmin(){
  adminLogado = false;
  try { sessionStorage.removeItem("adminLogado"); } catch(e) {}
  const adminArea = document.getElementById("adminArea");
  const loginBox = document.getElementById("adminLogin");
  if(adminArea) adminArea.style.display = "none";
  if(loginBox) loginBox.style.display = "none";
}

// Autologin se havia sessão ativa (opcional)
function autologinSeSessao(){
  const tem = (() => { try { return sessionStorage.getItem("adminLogado") === "1"; } catch(e){ return false; }})();
  if(tem){
    adminLogado = true;
    const loginBox = document.getElementById("adminLogin");
    const adminArea = document.getElementById("adminArea");
    if(loginBox) loginBox.style.display = "none";
    if(adminArea) adminArea.style.display = "block";
    renderAdminList();
  }
}

/* =========================
   Inicialização
========================= */
window.addEventListener('DOMContentLoaded', () => {
  // Garantir que elementos existem e estado inicial está consistente
  popularServicos();
  const msg = document.getElementById("msgHorarios");
  if (msg) msg.textContent = "Selecione data e serviço.";

  // Migra+saneia dados e atualiza UI do cliente
  getAgenda();
  mostrarAgenda();

  // Esconde telas de admin até ação do usuário ou sessão
  const loginBox = document.getElementById("adminLogin");
  const adminArea = document.getElementById("adminArea");
  if(loginBox) loginBox.style.display = "none";
  if(adminArea) adminArea.style.display = "none";

  // Se havia sessão do admin, reabre automaticamente
  autologinSeSessao();
});
