const http = require("node:http");
const { createHash, createPublicKey, randomBytes, randomUUID, scrypt: scryptCallback, timingSafeEqual, verify } = require("node:crypto");
const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const emergencyDataFile = process.env.EMERGENCY_DATA_FILE || path.join(__dirname, "data", "emergency-requests.json");
const authDataFile = process.env.AUTH_DATA_FILE || path.join(__dirname, "data", "users.json");
const veterinarianDataFile = process.env.VETERINARIAN_DATA_FILE || path.join(__dirname, "data", "veterinarians.json");
const paymentDataFile = process.env.PAYMENT_DATA_FILE || path.join(__dirname, "data", "payment-orders.json");
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;
const scrypt = promisify(scryptCallback);
const sessions = new Map();
const googleStates = new Map();
const loginAttempts = new Map();
const assets = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/imagens/Logo%20BuscaVet%20com%20C%C3%A3o%20e%20Gato.png", { file: path.join("imagens", "Logo BuscaVet com Cão e Gato.png"), type: "image/png" }],
  ["/imagens/Logo%20BuscaVet%20com%20C%C3%A3es%20e%20Gato.png", { file: path.join("imagens", "Logo BuscaVet com Cães e Gato.png"), type: "image/png" }],
  ["/painel-emergencia", { file: "emergency-panel.html", type: "text/html; charset=utf-8" }],
  ["/emergency-panel.js", { file: "emergency-panel.js", type: "text/javascript; charset=utf-8" }],
  ["/pix", { file: "pix.html", type: "text/html; charset=utf-8" }],
  ["/pix.html", { file: "pix.html", type: "text/html; charset=utf-8" }],
  ["/pix.js", { file: "pix.js", type: "text/javascript; charset=utf-8" }]
]);
const paymentPlans = new Map([
  ["Essencial", { price: 14.90 }],
  ["Intermediário", { price: 29.90 }],
  ["Pro", { price: 49.90 }]
]);

let writeQueue = Promise.resolve();
let veterinarianWriteQueue = Promise.resolve();
let paymentWriteQueue = Promise.resolve();
let googleKeys;
let googleKeysExpiresAt = 0;

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 16 * 1024) chunks.push(chunk);
  }
  if (size > 16 * 1024) {
    const error = new Error("O pedido é muito grande.");
    error.statusCode = 413;
    throw error;
  }

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body;
  } catch {
    const error = new Error("Envie os dados em formato JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

function getPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture || null,
    whatsapp: user.whatsapp || null,
    neighborhood: user.neighborhood || null,
    petSituation: user.petSituation || null,
    provider: user.googleSub ? "google" : "email",
    createdAt: user.createdAt
  };
}

function getSessionId(request) {
  const cookie = request.headers.cookie || "";
  const match = /(?:^|;\s*)bv_session=([a-f0-9]{64})(?:;|$)/.exec(cookie);
  return match?.[1] || null;
}

function getSessionUser(request, users) {
  const sessionId = getSessionId(request);
  const session = sessionId && sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return users.find((user) => user.id === session.userId) || null;
}

function setSessionCookie(request, response, user) {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(id);
  }
  const sessionId = randomBytes(32).toString("hex");
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + sessionLifetimeSeconds * 1000 });
  const secure = process.env.AUTH_COOKIE_SECURE === "true"
    || (process.env.AUTH_COOKIE_SECURE !== "false" && Boolean(request.socket.encrypted));
  response.setHeader("Set-Cookie", `bv_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure ? "; Secure" : ""}`);
}

function clearSessionCookie(request, response) {
  const sessionId = getSessionId(request);
  if (sessionId) sessions.delete(sessionId);
  const secure = process.env.AUTH_COOKIE_SECURE === "true"
    || (process.env.AUTH_COOKIE_SECURE !== "false" && Boolean(request.socket.encrypted));
  response.setHeader("Set-Cookie", `bv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  const forwardedProtocol = request.headers["x-forwarded-proto"]?.split(",")[0].trim();
  const expectedProtocol = publicBaseUrl
    ? new URL(publicBaseUrl).origin
    : `${forwardedProtocol || (request.socket.encrypted ? "https" : "http")}://${request.headers.host}`;
  if (new URL(origin).origin !== expectedProtocol) {
    const error = new Error("Origem da solicitação inválida.");
    error.statusCode = 403;
    throw error;
  }
}

async function loadUsers() {
  try {
    const content = await readFile(authDataFile, "utf8");
    const users = JSON.parse(content);
    if (!Array.isArray(users)) throw new Error("O arquivo de contas não contém uma lista.");
    return users;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function updateUsers(update) {
  const previousWrite = writeQueue;
  let releaseWrite;
  writeQueue = new Promise((resolve) => { releaseWrite = resolve; });
  await previousWrite;

  try {
    const users = await loadUsers();
    const result = await update(users);
    await mkdir(path.dirname(authDataFile), { recursive: true });
    const temporaryFile = `${authDataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(users, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, authDataFile);
    return result;
  } finally {
    releaseWrite();
  }
}

async function loadVeterinarians() {
  try {
    const content = await readFile(veterinarianDataFile, "utf8");
    const veterinarians = JSON.parse(content);
    if (!Array.isArray(veterinarians)) throw new Error("O arquivo de veterinários não contém uma lista.");
    return veterinarians;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function updateVeterinarians(update) {
  const previousWrite = veterinarianWriteQueue;
  let releaseWrite;
  veterinarianWriteQueue = new Promise((resolve) => { releaseWrite = resolve; });
  await previousWrite;

  try {
    const veterinarians = await loadVeterinarians();
    const result = await update(veterinarians);
    await mkdir(path.dirname(veterinarianDataFile), { recursive: true });
    const temporaryFile = `${veterinarianDataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(veterinarians, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, veterinarianDataFile);
    return result;
  } finally {
    releaseWrite();
  }
}

async function savePaymentOrder(order) {
  const previousWrite = paymentWriteQueue;
  let releaseWrite;
  paymentWriteQueue = new Promise((resolve) => { releaseWrite = resolve; });
  await previousWrite;

  try {
    let orders;
    try {
      orders = JSON.parse(await readFile(paymentDataFile, "utf8"));
      if (!Array.isArray(orders)) throw new Error("O arquivo de pagamentos não contém uma lista.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      orders = [];
    }

    orders.unshift(order);
    await mkdir(path.dirname(paymentDataFile), { recursive: true });
    const temporaryFile = `${paymentDataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(orders, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, paymentDataFile);
  } finally {
    releaseWrite();
  }
}

async function updatePaymentOrder(externalReference, update) {
  const previousWrite = paymentWriteQueue;
  let releaseWrite;
  paymentWriteQueue = new Promise((resolve) => { releaseWrite = resolve; });
  await previousWrite;

  try {
    const orders = JSON.parse(await readFile(paymentDataFile, "utf8"));
    if (!Array.isArray(orders)) throw new Error("O arquivo de pagamentos não contém uma lista.");
    const order = orders.find((candidate) => candidate.externalReference === externalReference);
    if (!order) throw new Error("Pedido de pagamento não encontrado.");
    Object.assign(order, update);
    const temporaryFile = `${paymentDataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(orders, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, paymentDataFile);
  } finally {
    releaseWrite();
  }
}

function getPublicBaseUrl() {
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) {
    const error = new Error("Pagamentos indisponíveis: o administrador precisa configurar PUBLIC_BASE_URL com o endereço HTTPS do site.");
    error.statusCode = 503;
    throw error;
  }
  const baseUrl = new URL(value);
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    const error = new Error("Pagamentos exigem PUBLIC_BASE_URL configurado com um endereço HTTPS válido.");
    error.statusCode = 503;
    throw error;
  }
  return baseUrl.origin;
}

function getMercadoPagoAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    const error = new Error("Pagamentos indisponíveis: o administrador precisa configurar as credenciais do Mercado Pago.");
    error.statusCode = 503;
    throw error;
  }
  return token;
}

async function createMercadoPagoCheckout(request, response) {
  assertSameOrigin(request);
  const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(response, 415, { error: "O conteúdo deve ser enviado em formato JSON." });
    return;
  }

  const body = await readJsonBody(request);
  const planName = typeof body.plan === "string" ? body.plan : "";
  const paymentType = typeof body.paymentType === "string" ? body.paymentType : "";
  const plan = paymentPlans.get(planName);
  if (!plan || !["subscription", "one-time"].includes(paymentType)) {
    sendJson(response, 400, { error: "Selecione um plano pago e uma modalidade de pagamento válidos." });
    return;
  }

  const users = await loadUsers();
  const user = getSessionUser(request, users);
  if (!user) {
    sendJson(response, 401, { error: "Entre na sua conta antes de continuar para o pagamento." });
    return;
  }

  const accessToken = getMercadoPagoAccessToken();
  const baseUrl = getPublicBaseUrl();
  const externalReference = randomUUID();
  const order = {
    id: randomUUID(),
    externalReference,
    userId: user.id,
    plan: planName,
    amount: plan.price,
    paymentType,
    status: "creating",
    createdAt: new Date().toISOString()
  };
  await savePaymentOrder(order);

  const returnUrl = new URL("/", baseUrl);
  returnUrl.searchParams.set("payment", "returned");
  returnUrl.searchParams.set("reference", externalReference);
  const subscription = paymentType === "subscription";
  const endpoint = subscription ? "https://api.mercadopago.com/preapproval" : "https://api.mercadopago.com/checkout/preferences";
  const checkoutPayload = subscription
    ? {
      reason: `BuscaVet - Plano ${planName}`,
      external_reference: externalReference,
      payer_email: user.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plan.price,
        currency_id: "BRL"
      },
      back_url: returnUrl.toString(),
      status: "pending"
    }
    : {
      items: [{
        id: `buscavet-${planName.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-")}`,
        title: `BuscaVet - Plano ${planName} (1 mês)`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: plan.price
      }],
      payer: { email: user.email },
      external_reference: externalReference,
      back_urls: {
        success: returnUrl.toString(),
        pending: returnUrl.toString(),
        failure: returnUrl.toString()
      },
      auto_return: "approved"
    };

  try {
    const checkoutResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": order.id
      },
      body: JSON.stringify(checkoutPayload),
      signal: AbortSignal.timeout(15000)
    });
    const checkout = await checkoutResponse.json();
    const checkoutUrl = typeof checkout.init_point === "string" ? new URL(checkout.init_point) : null;
    const validCheckoutHost = checkoutUrl
      && checkoutUrl.protocol === "https:"
      && (checkoutUrl.hostname === "mercadopago.com" || checkoutUrl.hostname.endsWith(".mercadopago.com")
        || checkoutUrl.hostname === "mercadopago.com.br" || checkoutUrl.hostname.endsWith(".mercadopago.com.br"));
    if (!checkoutResponse.ok || !validCheckoutHost) {
      console.error("Mercado Pago recusou a criação do checkout:", checkoutResponse.status);
      await updatePaymentOrder(externalReference, { status: "checkout_error" });
      sendJson(response, 502, { error: "Não foi possível iniciar o pagamento. Confira as credenciais e a configuração da conta do Mercado Pago." });
      return;
    }

    await updatePaymentOrder(externalReference, {
      status: "pending",
      mercadoPagoId: typeof checkout.id === "string" ? checkout.id : null
    });
    sendJson(response, 201, { checkoutUrl: checkoutUrl.toString() });
  } catch (error) {
    await updatePaymentOrder(externalReference, { status: "checkout_error" });
    throw error;
  }
}

async function createPixHostedCheckout(request, response) {
  assertSameOrigin(request);
  const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(response, 415, { error: "O conteúdo deve ser enviado em formato JSON." });
    return;
  }

  const body = await readJsonBody(request);
  const registrationId = typeof body.registrationId === "string" ? body.registrationId : "";
  if (!/^[\da-f-]{36}$/i.test(registrationId)) {
    sendJson(response, 400, { error: "Cadastro inválido para gerar o Pix." });
    return;
  }

  const registrations = await loadEmergencyRequests();
  const registration = registrations.find((item) => item.id === registrationId && item.type === "tutor-registration");
  if (!registration) {
    sendJson(response, 404, { error: "Cadastro não encontrado. Envie o cadastro novamente para gerar o Pix." });
    return;
  }

  let orders;
  try {
    orders = JSON.parse(await readFile(paymentDataFile, "utf8"));
    if (!Array.isArray(orders)) throw new Error("O arquivo de pagamentos não contém uma lista.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    orders = [];
  }
  const existingOrder = orders.find((order) => order.registrationId === registrationId && order.status === "pending" && order.checkoutUrl);
  if (existingOrder) {
    sendJson(response, 200, { checkoutUrl: existingOrder.checkoutUrl });
    return;
  }

  const accessToken = getMercadoPagoAccessToken();
  const baseUrl = getPublicBaseUrl();
  const externalReference = randomUUID();
  const order = {
    id: randomUUID(),
    externalReference,
    registrationId,
    plan: "SOS",
    amount: 10,
    paymentType: "pix",
    status: "creating",
    createdAt: new Date().toISOString()
  };
  await savePaymentOrder(order);

  const returnUrl = new URL("/pix", baseUrl);
  returnUrl.searchParams.set("payment", "returned");
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  try {
    const checkoutResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": order.id
      },
      body: JSON.stringify({
        items: [{
          id: "buscavet-sos",
          title: "BuscaVet - Atendimento SOS",
          quantity: 1,
          currency_id: "BRL",
          unit_price: 10
        }],
        external_reference: externalReference,
        payment_methods: { default_payment_method_id: "pix" },
        back_urls: {
          success: returnUrl.toString(),
          pending: returnUrl.toString(),
          failure: returnUrl.toString()
        },
        auto_return: "approved"
      }),
      signal: AbortSignal.timeout(15000)
    });
    const checkout = await checkoutResponse.json();
    const candidateUrl = token.startsWith("TEST-") ? checkout.sandbox_init_point : checkout.init_point;
    const checkoutUrl = typeof candidateUrl === "string" ? new URL(candidateUrl) : null;
    const validCheckoutHost = checkoutUrl
      && checkoutUrl.protocol === "https:"
      && (checkoutUrl.hostname === "mercadopago.com" || checkoutUrl.hostname.endsWith(".mercadopago.com")
        || checkoutUrl.hostname === "mercadopago.com.br" || checkoutUrl.hostname.endsWith(".mercadopago.com.br"));
    if (!checkoutResponse.ok || !validCheckoutHost) {
      console.error("Mercado Pago recusou a criação do Pix:", checkoutResponse.status);
      await updatePaymentOrder(externalReference, { status: "checkout_error" });
      sendJson(response, 502, { error: "Não foi possível gerar o Pix. Confira as credenciais e a configuração da conta Mercado Pago." });
      return;
    }

    await updatePaymentOrder(externalReference, {
      status: "pending",
      mercadoPagoId: typeof checkout.id === "string" ? checkout.id : null,
      checkoutUrl: checkoutUrl.toString()
    });
    sendJson(response, 201, { checkoutUrl: checkoutUrl.toString() });
  } catch (error) {
    await updatePaymentOrder(externalReference, { status: "checkout_error" });
    throw error;
  }
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(hash).toString("hex") };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendResendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "O envio de e-mail não está configurado neste servidor." };

  const from = process.env.VETERINARIAN_EMAIL_FROM;
  if (!from) return { sent: false, reason: "O remetente de e-mail não está configurado neste servidor." };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    console.error("Resend recusou o envio do e-mail:", response.status);
    return { sent: false, reason: "O servidor de e-mail recusou o envio." };
  }
  return { sent: true };
}

async function sendVeterinarianConfirmationEmail(veterinarian, token) {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!publicBaseUrl) return { sent: false, reason: "O endereço público do site não está configurado neste servidor." };

  const confirmationUrl = new URL("/api/veterinarians/confirm", publicBaseUrl);
  confirmationUrl.searchParams.set("token", token);

  const details = [
    ["Nome do veterinário", veterinarian.name],
    ["Consultório", veterinarian.clinic],
    ["E-mail", veterinarian.email],
    ["Especialidade", veterinarian.specialty],
    ["CPF", veterinarian.cpf],
    ["CRMV", veterinarian.crmv]
  ];
  const detailsHtml = details.map(([label, value]) =>
    `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join("");

  return sendResendEmail(
    veterinarian.email,
    "Confirme o cadastro do seu consultório no BuscaVet",
    `<p>Olá, ${escapeHtml(veterinarian.name)}.</p>
      <p>Recebemos o cadastro do seu consultório. Confira os dados informados:</p>
      <ul>${detailsHtml}</ul>
      <p><a href="${confirmationUrl.toString()}">Confirmar cadastro e ativar o perfil</a></p>
      <p>Se você não realizou este cadastro, ignore este e-mail.</p>`
  );
}

async function sendVeterinarianNotificationEmail(veterinarian) {
  const recipient = normalizeEmail(process.env.VETERINARIAN_NOTIFICATION_EMAIL);
  if (!recipient || !isValidEmail(recipient)) {
    return { sent: false, reason: "Configure VETERINARIAN_NOTIFICATION_EMAIL para receber os avisos de cadastro." };
  }

  const details = [
    ["Nome do veterinário", veterinarian.name],
    ["Consultório", veterinarian.clinic],
    ["E-mail", veterinarian.email],
    ["Especialidade", veterinarian.specialty],
    ["CPF", veterinarian.cpf],
    ["CRMV", veterinarian.crmv]
  ];
  const detailsHtml = details.map(([label, value]) =>
    `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join("");

  return sendResendEmail(
    recipient,
    "Novo cadastro de veterinário aguardando confirmação",
    `<p>Um novo perfil profissional foi cadastrado e aguarda confirmação de e-mail.</p>
      <ul>${detailsHtml}</ul>`
  );
}
function validateAuthOrigin(request) {
  if (request.method === "POST") assertSameOrigin(request);
}

async function handleVeterinarianApi(request, response, pathname, url) {
  const allowedMethod = pathname === "/api/veterinarians/confirm"
    ? "GET"
    : pathname === "/api/veterinarians/register" || pathname === "/api/veterinarians/login"
      ? "POST"
      : null;
  if (!allowedMethod) {
    sendJson(response, 404, { error: "Rota veterinária não encontrada." });
    return true;
  }
  if (request.method !== allowedMethod) {
    sendJson(response, 405, { error: `Método não permitido. Use ${allowedMethod}.` }, { Allow: allowedMethod });
    return true;
  }

  if (pathname === "/api/veterinarians/register" && request.method === "POST") {
    validateAuthOrigin(request);
    const body = await readJsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const clinic = typeof body.clinic === "string" ? body.clinic.trim() : "";
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const specialty = typeof body.specialty === "string" ? body.specialty.trim() : "";
    const cpf = typeof body.cpf === "string" ? body.cpf.trim() : "";
    const crmv = typeof body.crmv === "string" ? body.crmv.trim() : "";
    const image = typeof body.image === "string" ? body.image.trim() : "";

    if (!name || name.length > 80 || !clinic || clinic.length > 120
      || !isValidEmail(email) || password.length < 6 || password.length > 128
      || !specialty || specialty.length > 100 || cpf.length > 20 || crmv.length > 40
      || (image && !/^https?:\/\//i.test(image))) {
      sendJson(response, 400, { error: "Preencha os dados do veterinário e use uma senha de 6 a 128 caracteres." });
      return true;
    }

    const credentials = await hashPassword(password);
    const confirmationToken = randomBytes(32).toString("hex");
    const veterinarian = await updateVeterinarians((veterinarians) => {
      if (veterinarians.some((candidate) => candidate.email === email)) {
        const error = new Error("Já existe um cadastro para este e-mail.");
        error.statusCode = 409;
        throw error;
      }
      const newVeterinarian = {
        id: randomUUID(),
        name,
        clinic,
        email,
        specialty,
        cpf: cpf || "Não informado",
        crmv: crmv || "Não informado",
        image,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        status: "pending",
        confirmationTokenHash: createHash("sha256").update(confirmationToken).digest("hex"),
        createdAt: new Date().toISOString(),
        confirmedAt: null
      };
      veterinarians.push(newVeterinarian);
      return newVeterinarian;
    });

    let confirmationEmailResult;
    try {
      confirmationEmailResult = await sendVeterinarianConfirmationEmail(veterinarian, confirmationToken);
    } catch (error) {
      console.error("Falha ao enviar confirmação do cadastro:", error);
      confirmationEmailResult = { sent: false, reason: "O servidor não conseguiu enviar a confirmação ao veterinário." };
    }
    let notificationEmailResult;
    try {
      notificationEmailResult = await sendVeterinarianNotificationEmail(veterinarian);
    } catch (error) {
      console.error("Falha ao enviar aviso de novo cadastro:", error);
      notificationEmailResult = { sent: false, reason: "O servidor não conseguiu enviar o aviso de cadastro." };
    }

    await updateVeterinarians((veterinarians) => {
      const stored = veterinarians.find((candidate) => candidate.id === veterinarian.id);
      if (stored) {
        stored.confirmationEmail = confirmationEmailResult;
        stored.notificationEmail = notificationEmailResult;
      }
      return veterinarian;
    });

    const emailSent = confirmationEmailResult.sent && notificationEmailResult.sent;
    const emailIssues = [
      confirmationEmailResult.sent ? "" : `Confirmação ao veterinário: ${confirmationEmailResult.reason}`,
      notificationEmailResult.sent ? "" : `Aviso de cadastro: ${notificationEmailResult.reason}`
    ].filter(Boolean);
    sendJson(response, 201, {
      veterinarian: { id: veterinarian.id, name, clinic, email, status: "pending" },
      emailSent,
      confirmationEmailSent: confirmationEmailResult.sent,
      notificationEmailSent: notificationEmailResult.sent,
      message: emailSent
        ? "Cadastro recebido. A confirmação foi enviada ao veterinário e o aviso foi enviado ao endereço configurado."
        : `Cadastro recebido e aguardando confirmação. ${emailIssues.join(" ")}`
    });
    return true;
  }

  if (pathname === "/api/veterinarians/login" && request.method === "POST") {
    validateAuthOrigin(request);
    const body = await readJsonBody(request);
    const clinic = typeof body.clinic === "string" ? body.clinic.trim() : "";
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const veterinarian = (await loadVeterinarians()).find((candidate) =>
      candidate.clinic.toLocaleLowerCase("pt-BR") === clinic.toLocaleLowerCase("pt-BR")
      && candidate.email === email
      && candidate.passwordSalt
      && candidate.passwordHash);
    if (!veterinarian) {
      sendJson(response, 401, { error: "Perfil não encontrado ou dados incorretos." });
      return true;
    }
    const passwordHash = Buffer.from(await scrypt(password, veterinarian.passwordSalt, 64));
    const expectedHash = Buffer.from(veterinarian.passwordHash, "hex");
    if (expectedHash.length !== passwordHash.length || !timingSafeEqual(expectedHash, passwordHash)) {
      sendJson(response, 401, { error: "Senha incorreta." });
      return true;
    }
    if (veterinarian.status !== "active") {
      sendJson(response, 403, { error: "Cadastro pendente. Confirme o e-mail enviado para ativar o perfil." });
      return true;
    }
    sendJson(response, 200, {
      veterinarian: {
        id: veterinarian.id,
        name: veterinarian.name,
        clinic: veterinarian.clinic,
        email: veterinarian.email,
        specialty: veterinarian.specialty,
        cpf: veterinarian.cpf,
        crmv: veterinarian.crmv,
        image: veterinarian.image,
        status: veterinarian.status
      }
    });
    return true;
  }

  if (pathname === "/api/veterinarians/confirm" && request.method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token || token.length > 128) {
      response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      response.end("Link de confirmação inválido.");
      return true;
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const veterinarian = await updateVeterinarians((veterinarians) => {
      const stored = veterinarians.find((candidate) => candidate.confirmationTokenHash === tokenHash);
      if (!stored) return null;
      if (stored.status !== "active") {
        stored.status = "active";
        stored.confirmedAt = new Date().toISOString();
        stored.confirmationTokenHash = null;
      }
      return stored;
    });
    if (!veterinarian) {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end("Link de confirmação inválido ou já utilizado.");
      return true;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Cadastro confirmado</title><main><h1>Cadastro confirmado</h1><p>O perfil de ${escapeHtml(veterinarian.name)} no consultório ${escapeHtml(veterinarian.clinic)} foi ativado.</p><p><a href="/">Voltar ao BuscaVet</a></p></main></html>`);
    return true;
  }

  return false;
}

async function handleAuthApi(request, response, pathname) {
  const isConfig = pathname === "/api/auth/config";
  const isMe = pathname === "/api/auth/me";
  const isRegister = pathname === "/api/auth/register";
  const isLogin = pathname === "/api/auth/login";
  const isLogout = pathname === "/api/auth/logout";

  if (!isConfig && !isMe && !isRegister && !isLogin && !isLogout) return false;
  if ((isConfig || isMe) && request.method !== "GET") {
    sendJson(response, 405, { error: "Método não permitido." }, { Allow: "GET" });
    return true;
  }
  if ((isRegister || isLogin || isLogout) && request.method !== "POST") {
    sendJson(response, 405, { error: "Método não permitido." }, { Allow: "POST" });
    return true;
  }
  validateAuthOrigin(request);

  if (isConfig) {
    sendJson(response, 200, { googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) });
    return true;
  }
  if (isMe) {
    const users = await loadUsers();
    const user = getSessionUser(request, users);
    sendJson(response, 200, { user: user ? getPublicUser(user) : null });
    return true;
  }
  if (isLogout) {
    clearSessionCookie(request, response);
    sendJson(response, 200, { user: null });
    return true;
  }

  const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(response, 415, { error: "O conteúdo deve ser enviado em formato JSON." });
    return true;
  }

  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || password.length < 8 || password.length > 128) {
    sendJson(response, 400, { error: "Informe um e-mail válido e uma senha de 8 a 128 caracteres." });
    return true;
  }

  const clientAddress = request.socket.remoteAddress || "unknown";
  const attempts = loginAttempts.get(clientAddress);
  if (isLogin && attempts && attempts.resetAt > Date.now() && attempts.count >= 10) {
    sendJson(response, 429, { error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." });
    return true;
  }

  if (isRegister) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
    const whatsappDigits = whatsapp.replace(/\D/g, "");
    const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
    const petSituation = typeof body.petSituation === "string" ? body.petSituation.trim() : "";
    if (!name || name.length > 80 || !neighborhood || neighborhood.length > 100 || !petSituation || petSituation.length > 1000
      || !/^\+?[\d\s().-]+$/.test(whatsapp) || whatsappDigits.length < 10 || whatsappDigits.length > 13) {
      sendJson(response, 400, { error: "Informe nome do tutor, WhatsApp válido (com DDD), bairro e o que está acontecendo com o pet." });
      return true;
    }

    const credentials = await hashPassword(password);
    const user = await updateUsers((users) => {
      if (users.some((candidate) => candidate.email === email)) {
        const error = new Error("Já existe uma conta com este e-mail. Entre ou use outro endereço.");
        error.statusCode = 409;
        throw error;
      }
      const newUser = {
        id: randomUUID(),
        name,
        email,
        whatsapp,
        neighborhood,
        petSituation,
        picture: null,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      return newUser;
    });
    setSessionCookie(request, response, user);
    sendJson(response, 201, { user: getPublicUser(user) });
    return true;
  }

  const users = await loadUsers();
  const user = users.find((candidate) => candidate.email === email && candidate.passwordSalt && candidate.passwordHash);
  const passwordHash = user
    ? Buffer.from(await scrypt(password, user.passwordSalt, 64))
    : Buffer.from(await scrypt(password, "buscavet-invalid-account-salt", 64));
  const expectedHash = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(64);
  const passwordMatches = expectedHash.length === passwordHash.length && timingSafeEqual(expectedHash, passwordHash);
  if (!user || !passwordMatches) {
    if (attempts && attempts.resetAt > Date.now()) {
      attempts.count += 1;
    } else {
      loginAttempts.set(clientAddress, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
    }
    sendJson(response, 401, { error: "E-mail ou senha incorretos." });
    return true;
  }

  loginAttempts.delete(clientAddress);
  setSessionCookie(request, response, user);
  sendJson(response, 200, { user: getPublicUser(user) });
  return true;
}

function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

async function getGoogleSigningKeys() {
  if (googleKeys && googleKeysExpiresAt > Date.now()) return googleKeys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Não foi possível validar a assinatura do Google.");
  const data = await response.json();
  googleKeys = data.keys;
  googleKeysExpiresAt = Date.now() + 60 * 60 * 1000;
  return googleKeys;
}

async function verifyGoogleIdToken(idToken, expectedNonce) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Resposta de autenticação do Google inválida.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Assinatura do Google inválida.");
  const keys = await getGoogleSigningKeys();
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Chave de assinatura do Google não encontrada.");
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signature = Buffer.from(parts[2], "base64url");
  const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!verify("RSA-SHA256", signedContent, publicKey, signature)
    || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)
    || !audience.includes(process.env.GOOGLE_CLIENT_ID)
    || (audience.length > 1 && claims.azp !== process.env.GOOGLE_CLIENT_ID)
    || claims.nonce !== expectedNonce
    || !Number.isFinite(claims.exp)
    || claims.exp <= Date.now() / 1000
    || claims.email_verified !== true
    || typeof claims.sub !== "string"
    || !isValidEmail(normalizeEmail(claims.email))) {
    throw new Error("Não foi possível verificar a conta do Google.");
  }
  return claims;
}

async function startGoogleOAuth(response) {
  if (!googleOAuthConfigured()) {
    sendJson(response, 503, { error: "Login do Google não configurado. Consulte as instruções do administrador." });
    return;
  }
  for (const [key, oauthState] of googleStates) {
    if (oauthState.expiresAt <= Date.now()) googleStates.delete(key);
  }
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  googleStates.set(state, { nonce, verifier, expiresAt: Date.now() + 10 * 60 * 1000 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  response.writeHead(302, { Location: url.toString(), "Cache-Control": "no-store" });
  response.end();
}

async function finishGoogleOAuth(request, response, url) {
  const state = url.searchParams.get("state");
  const oauthState = state && googleStates.get(state);
  if (state) googleStates.delete(state);
  if (!oauthState || oauthState.expiresAt <= Date.now() || url.searchParams.has("error")) {
    response.writeHead(302, { Location: "/?auth=google-error", "Cache-Control": "no-store" });
    response.end();
    return;
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") || "",
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: oauthState.verifier
    }),
    signal: AbortSignal.timeout(10000)
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || typeof tokenData.id_token !== "string") {
    throw new Error("O Google não concluiu a autenticação.");
  }
  const claims = await verifyGoogleIdToken(tokenData.id_token, oauthState.nonce);
  const email = normalizeEmail(claims.email);
  const picture = typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture : null;
  const user = await updateUsers((users) => {
    const existing = users.find((candidate) => candidate.googleSub === claims.sub);
    if (existing) {
      existing.googleSub = claims.sub;
      existing.name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 80) : existing.name;
      existing.picture = picture || existing.picture || null;
      return existing;
    }
    if (users.some((candidate) => candidate.email === email)) {
      const error = new Error("Este e-mail já possui uma conta. Entre com e-mail e senha para acessar.");
      error.statusCode = 409;
      throw error;
    }
    const newUser = {
      id: randomUUID(),
      name: (typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email).slice(0, 80),
      email,
      picture,
      googleSub: claims.sub,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    return newUser;
  });
  setSessionCookie(request, response, user);
  response.writeHead(302, { Location: "/?auth=google-success", "Cache-Control": "no-store" });
  response.end();
}

async function loadEmergencyRequests() {
  try {
    const content = await readFile(emergencyDataFile, "utf8");
    const requests = JSON.parse(content);
    if (!Array.isArray(requests)) throw new Error("O arquivo de pedidos de emergência não contém uma lista.");
    return requests;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveEmergencyRequest(request) {
  const previousWrite = writeQueue;
  let releaseWrite;
  writeQueue = new Promise((resolve) => { releaseWrite = resolve; });
  await previousWrite;

  try {
    const requests = await loadEmergencyRequests();
    requests.unshift(request);
    await mkdir(path.dirname(emergencyDataFile), { recursive: true });
    const temporaryFile = `${emergencyDataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(requests, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, emergencyDataFile);
    return request;
  } finally {
    releaseWrite();
  }
}

function isAuthorized(request) {
  const expectedPassword = process.env.EMERGENCY_PANEL_PASSWORD;
  if (!expectedPassword) return false;

  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(request.headers.authorization || "");
  if (!match) return false;
  const credentials = Buffer.from(match[1], "base64").toString("utf8");
  const separator = credentials.indexOf(":");
  if (separator < 0 || credentials.slice(0, separator) !== "clinica") return false;

  const suppliedHash = createHash("sha256").update(credentials.slice(separator + 1)).digest();
  const expectedHash = createHash("sha256").update(expectedPassword).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;
  const isEmergencyApi = pathname === "/api/emergency-requests";
  const isAuthApi = pathname.startsWith("/api/auth/");
  const isVeterinarianApi = pathname.startsWith("/api/veterinarians/");
  const isPaymentsApi = pathname === "/api/payments/checkout";
  const isPixApi = pathname === "/api/payments/pix";
  const isGoogleCallback = pathname === "/auth/google/callback";

  try {
    if (isAuthApi && await handleAuthApi(request, response, pathname)) return;
    if (isVeterinarianApi && await handleVeterinarianApi(request, response, pathname, url)) return;

    if (isPixApi) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Método não permitido." }, { Allow: "POST" });
        return;
      }
      await createPixHostedCheckout(request, response);
      return;
    }

    if (isPaymentsApi) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Método não permitido." }, { Allow: "POST" });
        return;
      }
      await createMercadoPagoCheckout(request, response);
      return;
    }

    if (pathname === "/auth/google" && request.method === "GET") {
      await startGoogleOAuth(response);
      return;
    }

    if (isGoogleCallback && request.method === "GET") {
      if (!googleOAuthConfigured()) {
        response.writeHead(302, { Location: "/?auth=google-error", "Cache-Control": "no-store" });
        response.end();
        return;
      }
      await finishGoogleOAuth(request, response, url);
      return;
    }

    if (isEmergencyApi && request.method === "POST") {
      const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
      if (contentType !== "application/json") {
        sendJson(response, 415, { error: "O conteúdo deve ser enviado em formato JSON." });
        return;
      }

      const body = await readJsonBody(request);
      if (body.type === "tutor-registration") {
        const tutorName = typeof body.tutorName === "string" ? body.tutorName.trim() : "";
        const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
        const whatsappDigits = whatsapp.replace(/\D/g, "");
        const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
        const petName = typeof body.petName === "string" ? body.petName.trim() : "";
        const petSituation = typeof body.petSituation === "string" ? body.petSituation.trim() : "";
        if (!tutorName || tutorName.length > 80 || !neighborhood || neighborhood.length > 100
          || petName.length > 80 || !petSituation || petSituation.length > 1000
          || !/^\+?[\d\s().-]+$/.test(whatsapp) || whatsappDigits.length < 10 || whatsappDigits.length > 13) {
          sendJson(response, 400, { error: "Informe nome, WhatsApp válido (com DDD), bairro e descreva brevemente a situação do pet." });
          return;
        }

        const savedRequest = await saveEmergencyRequest({
          id: randomUUID(),
          type: "tutor-registration",
          tutorName,
          whatsapp,
          neighborhood,
          petName,
          problem: petSituation,
          createdAt: new Date().toISOString()
        });
        sendJson(response, 201, { id: savedRequest.id, message: "Cadastro salvo para consulta pela clínica." });
        return;
      }

      const pet = typeof body.pet === "string" ? body.pet.trim() : "";
      const problem = typeof body.problem === "string" ? body.problem.trim() : "";
      if (!pet || pet.length > 80 || !problem || problem.length > 1000) {
        sendJson(response, 400, { error: "Informe o nome do pet (até 80 caracteres) e o problema (até 1000 caracteres)." });
        return;
      }

      const savedRequest = await saveEmergencyRequest({
        id: randomUUID(),
        pet,
        problem,
        createdAt: new Date().toISOString()
      });
      sendJson(response, 201, { id: savedRequest.id, message: "Pedido de emergência salvo para consulta pela clínica." });
      return;
    }

    if (isEmergencyApi && request.method === "GET") {
      if (!process.env.EMERGENCY_PANEL_PASSWORD) {
        sendJson(response, 503, { error: "O painel está desativado. Configure EMERGENCY_PANEL_PASSWORD para habilitá-lo." });
        return;
      }
      if (!isAuthorized(request)) {
        sendJson(response, 401, { error: "Senha incorreta." });
        return;
      }

      sendJson(response, 200, { requests: await loadEmergencyRequests() });
      return;
    }

    if (isEmergencyApi) {
      response.writeHead(405, { Allow: "GET, POST" });
      response.end("Método não permitido");
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Método não permitido");
      return;
    }

    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Arquivo não encontrado");
      return;
    }

    const content = await readFile(path.join(__dirname, asset.file));
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error("Erro ao processar pedido:", error);
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    if (isGoogleCallback) {
      const result = error.statusCode === 409 ? "google-existing" : "google-error";
      response.writeHead(302, { Location: `/?auth=${result}`, "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if (isAuthApi) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "Não foi possível processar a autenticação. Tente novamente." : error.message
      });
      return;
    }
    if (isVeterinarianApi) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "Não foi possível processar o cadastro veterinário. Tente novamente." : error.message
      });
      return;
    }
    if (isPaymentsApi) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "Não foi possível iniciar o pagamento. Tente novamente." : error.message
      });
      return;
    }
    if (isEmergencyApi) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "Não foi possível processar o pedido. Tente novamente." : error.message
      });
      return;
    }
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Não foi possível carregar o arquivo");
  }
}).listen(port, host, () => {
  console.log(`BuscaVet disponível em http://localhost:${port}`);
});
