async function readPixResponse(response) {
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

const pixStatus = document.querySelector("#pix-status");
const retryButton = document.querySelector("#pix-retry");
const params = new URLSearchParams(window.location.search);
const registrationId = params.get("registrationId");

retryButton.addEventListener("click", () => window.location.reload());

if (params.get("payment") === "returned") {
  pixStatus.textContent = "Você retornou do Mercado Pago. Confira a confirmação do pagamento diretamente na sua conta Mercado Pago.";
} else if (!registrationId) {
  pixStatus.textContent = "Não encontramos o cadastro para gerar o Pix. Volte ao site e preencha o formulário SOS.";
} else {
  fetch("/api/payments/pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationId })
  }).then(async (response) => {
    const result = await readPixResponse(response);
    if (!response.ok) throw new Error(result.error || "Não foi possível gerar o Pix.");
    const checkoutUrl = new URL(result.checkoutUrl);
    if (checkoutUrl.protocol !== "https:" || !/(^|\.)mercadopago\.com(\.br)?$/i.test(checkoutUrl.hostname)) {
      throw new Error("O servidor retornou um endereço de pagamento inválido.");
    }
    pixStatus.textContent = "Redirecionando para o checkout seguro do Mercado Pago...";
    window.location.assign(checkoutUrl.toString());
  }).catch((error) => {
    pixStatus.textContent = error.message || "Não foi possível conectar ao servidor.";
    retryButton.hidden = false;
  });
}
