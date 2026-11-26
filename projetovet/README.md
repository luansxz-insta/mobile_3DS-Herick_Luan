# BuscaVet

## Iniciar

Requer Node.js 18 ou superior. Dentro desta pasta, execute:

```bash
npm start
```

Abra http://localhost:3000 no navegador. Não precisa instalar dependências.

Para habilitar o painel da clínica, configure uma senha e inicie o servidor:

```bash
EMERGENCY_PANEL_PASSWORD='use-uma-senha-forte' npm start
```

No PowerShell:

```powershell
$env:EMERGENCY_PANEL_PASSWORD = "use-uma-senha-forte"
npm start
```

Abra http://localhost:3000/painel-emergencia para entrar no painel com essa senha. O formulário da aba Emergência não exige login; cada envio é salvo em `data/emergency-requests.json` e aparece no painel. O arquivo fica no servidor e não deve ser publicado. Para usar em produção, configure HTTPS e armazenamento persistente protegido.

O mapa da aba Encontrar pesquisa clínicas veterinárias no Google Maps, começando por Curitiba (PR); após informar outra região, use Buscar para atualizar o mapa. A lista de Curitiba contém nomes e endereços publicados no OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0); os dados podem estar desatualizados, então confirme endereço e atendimento diretamente com cada clínica. Avaliações, formulários gerais e planos são demonstrações locais.

## Pagamentos dos planos

Os planos pagos usam os preços mensais exibidos na página. Para habilitar o checkout, configure no servidor um Access Token do Mercado Pago e o endereço HTTPS público do site:

```bash
MERCADOPAGO_ACCESS_TOKEN='TEST-seu-token-de-teste' \
PUBLIC_BASE_URL='https://seu-dominio.example' \
npm start
```

Use credenciais de teste (`TEST-...`) no ambiente de testes e credenciais de produção somente após validar a conta e a integração no painel do Mercado Pago. Não coloque tokens no navegador, no HTML, nem no repositório. O Mercado Pago hospeda a tela de pagamento; o BuscaVet não coleta dados de cartão. O checkout avulso oferece os meios habilitados para a conta (como Pix, cartão e boleto); assinatura cria uma cobrança recorrente mensal, sujeita aos meios oferecidos pelo Mercado Pago.

Os checkouts iniciados ficam registrados em `data/payment-orders.json`, arquivo privado com permissão restrita. O retorno do provedor não é usado para confirmar pagamento: esta versão ainda não verifica notificações/webhooks nem libera automaticamente os recursos do plano. Confirme transações na conta do Mercado Pago antes de conceder benefícios.

O envio do formulário SOS abre o WhatsApp com os dados do tutor e, após salvar o cadastro, direciona para `/pix`. O servidor cria um checkout avulso de R$ 10,00 no Mercado Pago com Pix como método padrão; o checkout hospedado coleta quaisquer dados de pagador necessários sem pedir e-mail ou login no BuscaVet. Configure as mesmas variáveis `MERCADOPAGO_ACCESS_TOKEN` e `PUBLIC_BASE_URL` acima. Credenciais `TEST-...` usam o endereço de sandbox retornado pelo Mercado Pago. A página do BuscaVet não exibe QR Pix diretamente. O pagamento deve ser confirmado no painel do Mercado Pago; não há confirmação automática/webhook nesta versão.

## Contas e acesso com Google

O formulário público de cadastro do tutor não exige conta, e-mail ou senha. Os dados enviados são salvos em `data/emergency-requests.json` para consulta no painel restrito da clínica. A autenticação de contas continua disponível no servidor, mas não é exposta na interface principal; por isso, o checkout de planos que exige uma conta não pode ser concluído pela interface atual. Proteja e faça backup do diretório `data`; não o publique.

Para habilitar o Google:

1. No Google Cloud Console, configure a tela de consentimento OAuth e crie um cliente OAuth do tipo **Aplicativo da Web**.
2. Cadastre a origem do site e o URI de redirecionamento autorizado, por exemplo `http://localhost:3000` e `http://localhost:3000/auth/google/callback` para desenvolvimento local.
3. Configure as variáveis abaixo antes de iniciar o servidor:

```bash
GOOGLE_CLIENT_ID='seu-client-id' \
GOOGLE_CLIENT_SECRET='seu-client-secret' \
GOOGLE_REDIRECT_URI='http://localhost:3000/auth/google/callback' \
PUBLIC_BASE_URL='http://localhost:3000' \
npm start
```

O URI de redirecionamento precisa corresponder exatamente ao cadastrado no Google. Em produção, use HTTPS, configure os endereços públicos HTTPS no Google e defina `PUBLIC_BASE_URL` para a origem pública. Se o TLS terminar em um proxy, configure também `AUTH_COOKIE_SECURE=true`. Nunca coloque o segredo OAuth no navegador ou no repositório.

As contas por e-mail não têm verificação de endereço nesta versão. O armazenamento em arquivo e sessões em memória atendem a uma instalação simples em um único servidor; para produção com múltiplas instâncias, use banco de dados e armazenamento de sessão compartilhado.

O pedido de emergência é armazenado para a clínica consultar, mas o sistema não envia alertas nem garante resposta imediata. Em uma urgência, procure um hospital veterinário ou serviço de emergência da sua região.

O CSS, o HTML e o JavaScript ficam em arquivos separados; o painel usa `emergency-panel.html` e `emergency-panel.js`.

## Cadastro e confirmação de veterinários

Os cadastros profissionais são armazenados em `data/veterinarians.json` com a senha protegida por hash. O perfil começa com status `pending` e só pode entrar no painel profissional depois que o link de confirmação for usado.

Para enviar automaticamente o e-mail de confirmação com os dados do veterinário e do consultório:

1. Crie uma chave de API no Resend e verifique o domínio de envio.
2. Copie `.env.example` para `.env` e preencha `RESEND_API_KEY` e `VETERINARIAN_EMAIL_FROM` com sua chave e um remetente desse domínio verificado. Em `VETERINARIAN_NOTIFICATION_EMAIL`, coloque a caixa que deve receber o aviso de novo cadastro.
3. Defina `PUBLIC_BASE_URL` para a URL em que o site pode ser acessado. Em Codespaces, use a URL pública encaminhada da porta 3000; `localhost` só funciona quando o navegador acessa o mesmo computador que executa o servidor.
4. Reinicie o servidor com `npm start`.

O veterinário recebe o link de confirmação e o endereço configurado em `VETERINARIAN_NOTIFICATION_EMAIL` recebe os dados do novo cadastro. O arquivo `.env` é local e não deve ser enviado ao Git. Em produção, configure essas variáveis como segredos do ambiente, use HTTPS em `PUBLIC_BASE_URL` e mantenha o domínio verificado no provedor. Sem essas variáveis, o cadastro permanece pendente e o servidor informa qual envio não foi configurado.