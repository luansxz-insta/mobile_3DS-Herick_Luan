const loginSection = document.querySelector("#panel-login-section");
const loginForm = document.querySelector("#panel-login");
const panelContent = document.querySelector("#panel-content");
const requestList = document.querySelector("#emergency-request-list");
const panelStatus = document.querySelector("#panel-status");
let panelPassword = "";

function encodeCredentials(password) {
  const bytes = new TextEncoder().encode(`clinica:${password}`);
  return btoa(String.fromCharCode(...bytes));
}

function renderRequests(requests) {
  requestList.replaceChildren();
  if (!requests.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Ainda não há pedidos ou cadastros de tutor.";
    requestList.append(empty);
    return;
  }

  requests.forEach((request) => {
    const article = document.createElement("article");
    article.className = "emergency-request";
    const heading = document.createElement("h2");
    heading.textContent = request.type === "tutor-registration" ? request.tutorName : request.pet;
    if (request.type === "tutor-registration") {
      const petName = document.createElement("p");
      petName.textContent = `Pet: ${request.petName || "Não informado"}`;
      const whatsapp = document.createElement("p");
      whatsapp.textContent = `WhatsApp: ${request.whatsapp}`;
      const neighborhood = document.createElement("p");
      neighborhood.textContent = `Bairro: ${request.neighborhood}`;
      const situation = document.createElement("p");
      situation.textContent = `Situação do pet: ${request.problem}`;
      article.append(heading, petName, whatsapp, neighborhood, situation);
    } else {
      const problem = document.createElement("p");
      problem.textContent = request.problem;
      article.append(heading, problem);
    }
    const date = document.createElement("time");
    date.dateTime = request.createdAt;
    date.textContent = new Date(request.createdAt).toLocaleString("pt-BR");
    article.append(date);
    requestList.append(article);
  });
}

async function loadRequests() {
  panelStatus.textContent = "Carregando pedidos...";
  const response = await fetch("/api/emergency-requests", {
    headers: { Authorization: `Basic ${encodeCredentials(panelPassword)}` },
    cache: "no-store"
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      panelPassword = "";
      loginSection.hidden = false;
      panelContent.hidden = true;
      document.querySelector("#panel-password").value = "";
      document.querySelector("#panel-login-status").textContent = "Senha incorreta. Tente novamente.";
      throw new Error("Acesso não autorizado.");
    }
    throw new Error(result.error || "Não foi possível carregar os pedidos.");
  }
  renderRequests(result.requests);
  panelStatus.textContent = `${result.requests.length} ${result.requests.length === 1 ? "pedido" : "pedidos"}`;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  panelPassword = loginForm.elements.password.value;
  const submitButton = loginForm.querySelector('button[type="submit"]');
  const status = document.querySelector("#panel-login-status");
  submitButton.disabled = true;
  status.textContent = "Verificando acesso...";
  try {
    await loadRequests();
    loginSection.hidden = true;
    panelContent.hidden = false;
    status.textContent = "";
  } catch (error) {
    if (error.message !== "Acesso não autorizado.") status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#panel-refresh").addEventListener("click", async () => {
  const button = document.querySelector("#panel-refresh");
  button.disabled = true;
  try {
    await loadRequests();
  } catch (error) {
    panelStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#panel-logout").addEventListener("click", () => {
  panelPassword = "";
  loginForm.reset();
  loginSection.hidden = false;
  panelContent.hidden = true;
  document.querySelector("#panel-login-status").textContent = "";
});
