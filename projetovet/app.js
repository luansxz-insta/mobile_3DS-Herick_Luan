const specialties = [
  "Acupuntura veterinária", "Anestesiologia", "Cardiologia", "Cirurgia veterinária",
  "Clínica geral", "Comportamento animal", "Dermatologia", "Diagnóstico por imagem",
  "Endocrinologia", "Fisioterapia e reabilitação", "Gastroenterologia", "Hematologia",
  "Medicina de animais silvestres e exóticos", "Medicina de felinos", "Medicina de grandes animais",
  "Medicina de pequenos animais", "Medicina intensiva", "Nefrologia", "Neurologia",
  "Nutrição animal", "Odontologia veterinária", "Oftalmologia", "Oncologia", "Ortopedia",
  "Patologia veterinária", "Pneumologia", "Reprodução animal", "Urologia veterinária",
  "Vacinação e prevenção", "Emergência veterinária"
];

const clinics = [
  { name: "Clínica Veterinária DoctorVet", address: "Rua Mateus Leme, 3312" },
  { name: "Pet Tutti", address: "Avenida Vereador Toaldo Túlio, 985" },
  { name: "HPet - Hospital Veterinário Municipal de Curitiba", address: "Rua Vicente Geronasso, 1480" },
  { name: "Garra", address: "Rua Padre Germano Mayer, 319" },
  { name: "Vetsan", address: "Avenida São José, 713" },
  { name: "Clínica Veterinária Fica Comigo", address: "Rua Marechal Deodoro, 1864" },
  { name: "Pathas Reabilitação Animal", address: "Rua Professor João Argemiro Loyola, 393 · Seminário" },
  { name: "Pangea Zoo", address: "Avenida Nossa Senhora Aparecida, 49" },
  { name: "S.AU.S.", address: "Rua Professor João Falarz, 1291" },
  { name: "Pet Haus", address: "Rua Antônio Costa, 486" },
  { name: "CEMEPAC", address: "Rua Padre Agostinho, 1034" },
  { name: "Vida Livre - Animais Selvagens", address: "Rua Petit Carneiro, 77" },
  { name: "Veterinária Ecoville", address: "Rua João Nicco, 99 · Mossunguê" },
  { name: "Clínica Veterinária Bolt", address: "Rua Theodoro Makiolka, 1301 · Santa Cândida" },
  { name: "Bicho Preguiça", address: "Rua Engenheiro Costa Barros · Cajuru" }
];

const exampleReviews = [
  { author: "Mariana e Pipoca", clinic: "Clínica Exemplo Paulista", rating: 5, text: "A equipe explicou tudo com calma. Comentário fictício para demonstrar esta área." },
  { author: "Rafael e Bento", clinic: "Centro Animal de Exemplo", rating: 5, text: "Foi fácil entender as opções de atendimento. Avaliação ilustrativa." },
  { author: "Cláudia e Nina", clinic: "Espaço Vet de Exemplo", rating: 4, text: "Ambiente acolhedor e atendimento atencioso. Exemplo fictício." }
];

const vetAgenda = [
  { client: "Marina Silva", pet: "Nina", service: "Consulta de rotina", date: "2026-11-05", time: "09:00", status: "Confirmado" },
  { client: "João Pereira", pet: "Thor", service: "Vacinação", date: "2026-11-05", time: "11:30", status: "Em espera" },
  { client: "Lucia Santos", pet: "Milo", service: "Exame de dermatologia", date: "2026-11-06", time: "14:00", status: "Confirmado" },
  { client: "Pedro Alves", pet: "Luna", service: "Consulta de cardiologia", date: "2026-11-06", time: "16:15", status: "Pendente" }
];

const specialtyFilter = document.querySelector("#specialty-filter");
const appointmentSpecialty = document.querySelector("#appointment-specialty");
const clinicList = document.querySelector("#clinic-list");
const resultCount = document.querySelector("#result-count");
const mapFrame = document.querySelector("#google-map-embed");
const mapOpenLink = document.querySelector("#map-open-link");
const defaultMapLocation = "Curitiba, PR";

function updateMapSearch(location, specialty = "", clinic = null) {
  const searchLocation = location.trim() || defaultMapLocation;
  const query = clinic
    ? `${clinic.name} ${clinic.address}, Curitiba, PR`
    : ["clínicas veterinárias", specialty, searchLocation].filter(Boolean).join(" ");
  const embedUrl = new URL("https://www.google.com/maps");
  embedUrl.searchParams.set("q", query);
  embedUrl.searchParams.set("output", "embed");
  mapFrame.src = embedUrl.toString();

  const searchUrl = new URL("https://www.google.com/maps/search/");
  searchUrl.searchParams.set("api", "1");
  searchUrl.searchParams.set("query", query);
  mapOpenLink.href = searchUrl.toString();
  mapOpenLink.textContent = clinic
    ? `Abrir ${clinic.name} no Google Maps`
    : `Abrir busca no Google Maps: ${searchLocation}`;
  const mapDescription = clinic ? clinic.name : `clínicas veterinárias em ${searchLocation}`;
  document.querySelector("#map-surface").setAttribute("aria-label", `Mapa: ${mapDescription}`);
  mapFrame.title = `Busca de ${mapDescription} no Google Maps`;
}

function addSpecialtyOptions() {
  specialtyFilter.add(new Option("Todas as opções", ""));
  appointmentSpecialty.add(new Option("Selecione", "", true, true));
  appointmentSpecialty.options[0].disabled = true;
  specialties.forEach((specialty) => {
    specialtyFilter.add(new Option(specialty, specialty));
    appointmentSpecialty.add(new Option(specialty, specialty));
  });
}

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
}

function filteredClinics() {
  const query = normalize(document.querySelector("#location-search").value);
  return clinics.filter((clinic) => {
    const location = normalize(`${clinic.name} ${clinic.address} Curitiba PR`);
    return !query || location.includes(query);
  });
}

function renderClinics(items) {
  resultCount.textContent = `${items.length} ${items.length === 1 ? "clínica" : "clínicas"}`;
  clinicList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma clínica cadastrada corresponde à busca. O Google Maps pode mostrar outros resultados.";
    clinicList.append(empty);
  }

  items.forEach((clinic) => {
    const clinicIndex = clinics.indexOf(clinic);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "clinic-card";
    card.dataset.clinicIndex = clinicIndex;
    card.setAttribute("aria-label", `${clinic.name}, ${clinic.address}, Curitiba, Paraná. Mostrar no Google Maps.`);
    const initial = document.createElement("span");
    initial.className = "clinic-initial";
    initial.setAttribute("aria-hidden", "true");
    initial.textContent = clinic.name.slice(0, 1);
    const details = document.createElement("span");
    const name = document.createElement("h3");
    name.textContent = clinic.name;
    const address = document.createElement("p");
    address.className = "clinic-meta";
    address.textContent = `${clinic.address} · Curitiba, PR`;
    const action = document.createElement("span");
    action.className = "clinic-map-action";
    action.textContent = "Ver no mapa";
    details.append(name, address, action);
    card.append(initial, details);
    card.addEventListener("click", () => {
      selectClinic(clinicIndex);
      updateMapSearch(document.querySelector("#location-search").value, specialtyFilter.value, clinic);
    });
    clinicList.append(card);
  });
}

function selectClinic(clinicIndex) {
  document.querySelectorAll(".clinic-card").forEach((item) => {
    const selected = Number(item.dataset.clinicIndex) === clinicIndex;
    item.classList.toggle("selected", selected);
  });
  clinicList.querySelector(`[data-clinic-index="${clinicIndex}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderSpecialties() {
  const grid = document.querySelector("#specialty-grid");
  specialties.forEach((specialty) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "specialty-option";
    const label = document.createElement("span");
    label.textContent = specialty;
    const arrow = document.createElement("span");
    arrow.className = "specialty-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    button.append(label, arrow);
    button.addEventListener("click", () => {
      specialtyFilter.value = specialty;
      renderClinics(filteredClinics());
      updateMapSearch(document.querySelector("#location-search").value, specialty);
      showView("encontrar");
    });
    grid.append(button);
  });
}

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === `view-${name}`;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showStatus(selector, message) {
  document.querySelector(selector).textContent = message;
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const message = (await response.text()).trim();
    throw new Error(message || `Resposta inesperada do servidor (${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("O servidor retornou uma resposta JSON inválida.");
  }
}

function renderReviews(reviews) {
  const reviewList = document.querySelector("#review-list");
  reviews.forEach((review) => {
    const article = document.createElement("article");
    article.className = "review-item";
    const heading = document.createElement("h3");
    const author = document.createElement("span");
    author.textContent = `${review.author} · ${review.clinic} (exemplo)`;
    const stars = document.createElement("span");
    stars.className = "review-stars";
    stars.textContent = `${"★".repeat(Number(review.rating))}${"☆".repeat(5 - Number(review.rating))}`;
    stars.setAttribute("aria-label", `Nota ilustrativa ${review.rating} de 5`);
    heading.append(author, stars);
    const text = document.createElement("p");
    text.textContent = review.text;
    article.append(heading, text);
    reviewList.append(article);
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

function setupAdCarousel() {
  const carousel = document.querySelector("#ad-carousel");
  const slides = Array.from(carousel.querySelectorAll("[data-ad-slide]"));
  const dots = Array.from(carousel.querySelectorAll(".ad-dot"));
  const track = document.querySelector("#ad-slides-track");
  const pauseButton = document.querySelector("#ad-pause");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let timer = null;
  let paused = reducedMotion.matches;

  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${activeIndex * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      const inactive = slideIndex !== activeIndex;
      slide.setAttribute("aria-hidden", String(inactive));
      slide.inert = inactive;
    });
    dots.forEach((dot, dotIndex) => dot.setAttribute("aria-current", String(dotIndex === activeIndex)));
  }

  function stopTimer() {
    window.clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    stopTimer();
    if (paused || document.hidden) return;
    timer = window.setInterval(() => showSlide(activeIndex + 1), 6000);
  }

  document.querySelector("#ad-previous").addEventListener("click", () => {
    showSlide(activeIndex - 1);
    startTimer();
  });
  document.querySelector("#ad-next").addEventListener("click", () => {
    showSlide(activeIndex + 1);
    startTimer();
  });
  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      startTimer();
    });
  });
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Reproduzir" : "Pausar";
    pauseButton.setAttribute("aria-label", paused ? "Reproduzir anúncios" : "Pausar anúncios");
    startTimer();
  });
  carousel.addEventListener("pointerenter", stopTimer);
  carousel.addEventListener("pointerleave", startTimer);
  carousel.addEventListener("focusin", stopTimer);
  carousel.addEventListener("focusout", (event) => {
    if (!carousel.contains(event.relatedTarget)) startTimer();
  });
  document.addEventListener("visibilitychange", startTimer);
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      paused = true;
      pauseButton.textContent = "Reproduzir";
      pauseButton.setAttribute("aria-label", "Reproduzir anúncios");
    }
    startTimer();
  });
  carousel.querySelector('[data-ad-action="sos"]').addEventListener("click", () => {
    document.querySelector("#sos-open-registration").click();
  });

  showSlide(0);
  startTimer();
}

function setupTutorRegistration() {
  const modal = document.querySelector("#tutor-registration-modal");
  const form = document.querySelector("#tutor-registration-form");
  const status = document.querySelector("#tutor-registration-status");
  const submitButton = document.querySelector("#tutor-registration-submit");

  document.querySelectorAll("#tutor-registration-open, #sos-open-registration").forEach((button) => {
    button.addEventListener("click", () => {
      status.textContent = "";
      modal.hidden = false;
      document.querySelector("#tutor-name").focus();
    });
  });
  document.querySelector("#tutor-registration-close").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") modal.hidden = true;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    status.textContent = "Enviando cadastro...";
    const tutorName = document.querySelector("#tutor-name").value.trim();
    const enteredPetName = document.querySelector("#tutor-pet-name").value.trim();
    const petNameForMessage = enteredPetName || "Não informado";
    const petSituation = document.querySelector("#tutor-pet-situation").value.trim();
    const message = [
      "Olá, preciso de atendimento veterinário.",
      `Nome do tutor: ${tutorName}`,
      `Nome do pet: ${petNameForMessage}`,
      `O que está acontecendo com o pet: ${petSituation}`
    ].join("\n");
    const whatsappUrl = new URL("https://wa.me/5541999964050");
    whatsappUrl.searchParams.set("text", message);
    const whatsappWindow = window.open(whatsappUrl.toString(), "_blank");
    if (whatsappWindow) whatsappWindow.opener = null;
    try {
      const response = await fetch("/api/emergency-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tutor-registration",
          tutorName,
          whatsapp: document.querySelector("#tutor-whatsapp").value,
          neighborhood: document.querySelector("#tutor-neighborhood").value,
          petName: enteredPetName,
          petSituation
        })
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o cadastro.");
      form.reset();
      status.textContent = "Cadastro recebido. Preparando o Pix...";
      window.location.assign(`/pix?registrationId=${encodeURIComponent(result.id)}`);
    } catch (error) {
      status.textContent = `${error.message || "Não foi possível salvar o cadastro."} A mensagem do WhatsApp foi aberta.`;
    } finally {
      submitButton.disabled = false;
    }
  });
}

function setupVetPortal() {
  const form = document.querySelector("#vet-auth-form");
  const access = document.querySelector("#vet-access");
  const dashboard = document.querySelector("#vet-dashboard");
  const registerFields = document.querySelectorAll(".vet-register-field");
  const specialtySelect = document.querySelector("#vet-specialty");
  const cpfInput = document.querySelector("#vet-cpf");
  const crmvInput = document.querySelector("#vet-crmv");
  const imageInput = document.querySelector("#vet-image-url");
  const defaultVetImage = "./imagens/Logo%20BuscaVet%20com%20C%C3%A3es%20e%20Gato.png";
  let registering = false;
  let account = null;

  specialtySelect.add(new Option("Selecione", "", true, true));
  specialtySelect.options[0].disabled = true;
  specialties.forEach((specialty) => specialtySelect.add(new Option(specialty, specialty)));

  function setMode(createAccount) {
    registering = createAccount;
    registerFields.forEach((field) => {
      field.hidden = !createAccount;
      const input = field.querySelector("input, select");
      if (input) input.required = createAccount;
    });
    document.querySelector("#vet-password").autocomplete = createAccount ? "new-password" : "current-password";
    document.querySelector("#vet-submit").textContent = createAccount ? "Criar perfil" : "Entrar";
    document.querySelectorAll("[data-vet-mode]").forEach((button) => {
      const active = button.dataset.vetMode === (createAccount ? "register" : "login");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    showStatus("#vet-auth-status", "");
  }

  function renderVetAgenda() {
    const agendaList = document.querySelector("#vet-agenda-list");
    const agendaTotal = document.querySelector("#vet-agenda-total");
    agendaList.replaceChildren();

    vetAgenda.forEach((appointment) => {
      const item = document.createElement("article");
      item.className = "vet-agenda-item";

      const header = document.createElement("div");
      header.className = "vet-agenda-top";

      const client = document.createElement("div");
      client.className = "vet-client-info";
      const petName = document.createElement("strong");
      petName.textContent = `${appointment.pet}`;
      const ownerName = document.createElement("span");
      ownerName.textContent = appointment.client;
      client.append(petName, ownerName);

      const status = document.createElement("span");
      status.className = `vet-appointment-status ${appointment.status.toLowerCase().replace(/\s+/g, "-")}`;
      status.textContent = appointment.status;
      header.append(client, status);

      const details = document.createElement("div");
      details.className = "vet-agenda-details";
      details.innerHTML = `
        <span>${appointment.service}</span>
        <span>${appointment.date}</span>
        <span>${appointment.time}</span>
      `;

      item.append(header, details);
      agendaList.append(item);
    });

    agendaTotal.textContent = `${vetAgenda.length} ${vetAgenda.length === 1 ? "cliente" : "clientes"}`;
  }

  document.querySelector("#vet-booking-toggle").addEventListener("click", () => {
    const form = document.querySelector("#vet-booking-form");
    form.hidden = !form.hidden;
  });

  document.querySelector("#vet-booking-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const client = document.querySelector("#vet-booking-client").value.trim();
    const pet = document.querySelector("#vet-booking-pet").value.trim();
    const service = document.querySelector("#vet-booking-service").value.trim();
    const date = document.querySelector("#vet-booking-date").value;
    const time = document.querySelector("#vet-booking-time").value;
    const status = document.querySelector("#vet-booking-status").value;

    if (!client || !pet || !service || !date || !time) {
      showStatus("#vet-booking-status-message", "Preencha todos os campos do agendamento.");
      return;
    }

    vetAgenda.unshift({ client, pet, service, date, time, status });
    renderVetAgenda();
    event.currentTarget.reset();
    event.currentTarget.hidden = true;
    showStatus("#vet-booking-status-message", "Cliente agendado com sucesso.");
  });

  function showDashboard() {
    access.hidden = true;
    dashboard.hidden = false;
    const image = document.querySelector("#vet-profile-image");
    image.src = account.image || defaultVetImage;
    image.alt = `Imagem do consultório ${account.clinic}`;
    document.querySelector("#vet-profile-name").textContent = account.name || "Veterinário";
    document.querySelector("#vet-profile-clinic").textContent = account.clinic;
    document.querySelector("#vet-profile-specialty").textContent = account.specialty || "Não informado";
    document.querySelector("#vet-profile-cpf").textContent = account.cpf || "Não informado";
    document.querySelector("#vet-profile-crmv").textContent = account.crmv || "Não informado";
    document.querySelector("#vet-profile-email").textContent = account.email;
    document.querySelector("#vet-profile-consultorio").textContent = account.clinic;
    const status = document.querySelector("#vet-status");
    const statusText = document.querySelector("#vet-profile-status-text");
    const isActive = Boolean(account.active);
    status.textContent = isActive ? "Ativo" : "Inativo";
    statusText.textContent = isActive ? "Ativo" : "Inativo";
    status.classList.toggle("is-active", isActive);
    status.classList.toggle("is-inactive", !isActive);
    document.querySelector("#vet-status-toggle").textContent = isActive ? "Desativar perfil" : "Ativar perfil";
    renderVetAgenda();
  }

  document.querySelectorAll("[data-vet-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.vetMode === "register"));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const clinic = document.querySelector("#vet-clinic").value.trim();
    const email = document.querySelector("#vet-email").value.trim().toLocaleLowerCase("pt-BR");
    const password = document.querySelector("#vet-password").value;

    if (registering) {
      const submitButton = document.querySelector("#vet-submit");
      submitButton.disabled = true;
      showStatus("#vet-auth-status", "Enviando cadastro...");
      fetch("/api/veterinarians/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.querySelector("#vet-name").value.trim(),
          clinic,
          email,
          password,
          specialty: specialtySelect.value,
          cpf: cpfInput.value.trim(),
          crmv: crmvInput.value.trim(),
          image: imageInput.value.trim()
        })
      }).then(async (response) => {
        const result = await readApiResponse(response);
        if (!response.ok) throw new Error(result.error || "Não foi possível cadastrar o perfil.");
        form.reset();
        setMode(false);
        showStatus("#vet-auth-status", result.message);
      }).catch((error) => {
        showStatus("#vet-auth-status", error.message);
      }).finally(() => {
        submitButton.disabled = false;
      });
      return;
    }

    const submitButton = document.querySelector("#vet-submit");
    submitButton.disabled = true;
    showStatus("#vet-auth-status", "Verificando perfil...");
    fetch("/api/veterinarians/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinic, email, password })
    }).then(async (response) => {
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      account = {
        ...result.veterinarian,
        active: true,
        image: result.veterinarian.image || defaultVetImage
      };
      showDashboard();
      form.reset();
    }).catch((error) => {
      showStatus("#vet-auth-status", error.message);
    }).finally(() => {
      submitButton.disabled = false;
    });
  });
  document.querySelector("#vet-status-toggle").addEventListener("click", () => {
    if (!account) return;
    account.active = !account.active;
    showDashboard();
  });
  document.querySelector("#vet-logout").addEventListener("click", () => {
    dashboard.hidden = true;
    access.hidden = false;
    form.reset();
    setMode(false);
  });
}

function setupForms() {
  document.querySelector("#reset-search").addEventListener("click", () => {
    document.querySelector("#location-search").value = "";
    specialtyFilter.value = "";
    renderClinics(clinics);
    updateMapSearch("");
  });
  document.querySelector("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderClinics(filteredClinics());
    updateMapSearch(document.querySelector("#location-search").value, specialtyFilter.value);
  });
  document.querySelector("#location-search").addEventListener("input", () => renderClinics(filteredClinics()));
  specialtyFilter.addEventListener("change", () => {
    updateMapSearch(document.querySelector("#location-search").value, specialtyFilter.value);
  });

  document.querySelector("#appointment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    showStatus("#appointment-status", "Pedido de exemplo registrado nesta tela. Nenhum profissional foi contatado.");
  });
  document.querySelector("#emergency-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showStatus("#emergency-status", "Enviando pedido...");

    fetch("/api/emergency-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pet: form.elements.pet.value,
        problem: form.elements.problem.value
      })
    }).then(async (response) => {
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o pedido.");
      form.reset();
      showStatus("#emergency-status", `Pedido salvo para consulta pela clínica. Protocolo: ${result.id}. Em caso de urgência, procure atendimento veterinário imediatamente.`);
    }).catch((error) => {
      showStatus("#emergency-status", `Não foi possível salvar o pedido: ${error.message}`);
    }).finally(() => {
      submitButton.disabled = false;
    });
  });
  document.querySelector("#review-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    renderReviews([{ author: "Sua avaliação", clinic: form.querySelector("#review-clinic").value, rating: form.querySelector("#review-rating").value, text: form.querySelector("#review-comment").value }]);
    form.reset();
    showStatus("#review-status", "Avaliação adicionada somente a esta demonstração.");
  });
  document.querySelector("#support-form").addEventListener("submit", (event) => {
    event.preventDefault();
    event.currentTarget.reset();
    showStatus("#support-status", "Mensagem de exemplo recebida nesta tela. Nada foi enviado.");
  });

  let selectedPaymentPlan = "";
  const checkoutPanel = document.querySelector("#checkout-panel");
  const checkoutStatus = document.querySelector("#checkout-status");
  const checkoutForm = document.querySelector("#checkout-form");

  document.querySelectorAll(".plan-select").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedCard = button.closest(".plan-card");
      document.querySelectorAll(".plan-card").forEach((card) => card.classList.toggle("selected", card === selectedCard));
      document.querySelectorAll(".plan-select").forEach((item) => {
        const selected = item === button;
        item.setAttribute("aria-pressed", String(selected));
        item.textContent = selected ? "Selecionado" : "Selecionar";
      });
      showStatus("#plan-status", "");
      selectedPaymentPlan = button.dataset.plan;
      if (selectedPaymentPlan === "Casual") {
        checkoutPanel.hidden = true;
        showStatus("#plan-status", "O plano Casual é gratuito e não exige pagamento.");
        return;
      }

      const price = selectedCard.querySelector(".plan-price").textContent;
      document.querySelector("#checkout-plan-summary").textContent = `Plano ${selectedPaymentPlan} · ${price} por mês`;
      checkoutStatus.textContent = "";
      checkoutPanel.hidden = false;
      checkoutPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  document.querySelector("#checkout-cancel").addEventListener("click", () => {
    checkoutPanel.hidden = true;
    selectedPaymentPlan = "";
    document.querySelectorAll(".plan-card").forEach((card) => card.classList.remove("selected"));
    document.querySelectorAll(".plan-select").forEach((button) => {
      button.setAttribute("aria-pressed", "false");
      button.textContent = "Selecionar";
    });
  });

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedPaymentPlan) {
      checkoutStatus.textContent = "Selecione um plano para continuar.";
      return;
    }

    const submitButton = document.querySelector("#checkout-submit");
    const paymentType = new FormData(checkoutForm).get("payment-type");
    submitButton.disabled = true;
    checkoutStatus.textContent = "Preparando checkout seguro...";
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPaymentPlan, paymentType })
      });
      const result = await readApiResponse(response);
      if (response.status === 401) {
        checkoutStatus.textContent = "O checkout exige uma conta, mas o login de tutor não está disponível.";
        return;
      }
      if (!response.ok) throw new Error(result.error || "Não foi possível iniciar o pagamento.");
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== "https:" || !/(^|\.)mercadopago\.com(\.br)?$/i.test(checkoutUrl.hostname)) {
        throw new Error("O servidor retornou um endereço de pagamento inválido.");
      }
      window.location.assign(checkoutUrl.toString());
    } catch (error) {
      checkoutStatus.textContent = error.message || "Não foi possível conectar ao servidor.";
    } finally {
      submitButton.disabled = false;
    }
  });

  const paymentResult = new URLSearchParams(window.location.search).get("payment");
  if (paymentResult === "returned") {
    showView("planos");
    checkoutStatus.textContent = "Você retornou do Mercado Pago. Verifique a confirmação do pagamento na sua conta Mercado Pago; os benefícios ainda não são ativados automaticamente.";
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
  }
}

addSpecialtyOptions();
renderSpecialties();
renderReviews(exampleReviews);
setupNavigation();
setupAdCarousel();
setupTutorRegistration();
setupVetPortal();
setupForms();
renderClinics(clinics);
updateMapSearch("");