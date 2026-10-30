# Garbosa System

Sistema interno de gestão de excursões — acessível em `https://garbosaturismo.com.br/sistema/`.
Fica isolado nesta pasta e não altera nenhuma página do site.

SPA (página única) com rotas por hash: `#/login`, `#/cadastro`, `#/calendario`, `#/excursoes`,
`#/viajantes/{id}`, `#/poltronas/{id}`, `#/viagens`, `#/usuarios`, `#/logs`.

## Perfis
- **Agência de turismo**: calendário, excursões (valor por poltrona), viajantes, poltronas, inserir veículos.
- **Transporte / Fretamento**: calendário e viagens com orçamento (chofer + diesel + gastos + margem).
- **Administrador** (`contato@feliperodrigues.net`): acesso a tudo + controle de usuários
  (adicionar, editar, desativar, remover, redefinir senha) + relatório de logs de acesso.
  A senha do admin **não** fica no código: é definida ao criar a conta.

Todas as páginas exportam **XLSX** e **PDF** (o PDF de poltronas desenha o mapa do veículo).

## Recursos da agência
- **Link de inscrição automático** (`inscricao.html?e={id}`): gerado ao cadastrar a excursão, com valor final, data e local de saída.
  Pode ser encerrado/reaberto. O valor gravado é validado pelas regras (o viajante não consegue alterar o preço).
- **Financeiro**: valor previsto, recebido e a receber; registrar pagamentos parciais, quitar, histórico e cobrança pelo WhatsApp.
- **Colaboradores por @ do Instagram**: compartilham a excursão (viajantes, poltronas e financeiro).
- **Importar planilha** no formato do Google Forms: Numeração, Carimbo, Nome completo, RG, Whatsapp, Faixa etária
  (o valor é lido do texto, ex.: "R$231,00"), Forma de pagamento, OBS ("Poltrona 5" posiciona) e Pagamento ("Pago integral" quita).
  Colunas reconhecidas pelo nome; nomes repetidos são ignorados.
  Limpezas automáticas: "ok" no Pagamento conta como pago; valores arrastados (R$231,01, 231,02…) voltam para o valor da faixa;
  documento/telefone só com zeros ficam em branco; linhas sem letras no nome (somas/fórmulas no fim da planilha) são ignoradas.
- **Sino de notificações**: inscrição pelo link, veículo agendado, colaboração, pagamentos e vendas online.
- **Venda online com Asaas** (`comprar.html?e={id}`): veja a seção abaixo.

## Cálculo do valor por poltrona
`(valor do transporte + ingressos) ÷ divisor`

| Veículo | Divisor |
|---|---|
| Van 15 | 10 |
| Van 20 | 15 |
| Micro 32 | 20 |
| Micro 36 | 28 |
| Ônibus 42 | 29 |
| Ônibus 46 | 32 |
| Ônibus 50 | 35 |
| Ônibus 64 | 40 |

## Valor final da transportadora
`custo = chofer + diesel + gastos adicionais` → `valor final = custo × (1 + margem/100)`

## Configuração no Firebase (uma vez)
1. **Authentication → Sign-in method** → ativar **E-mail/senha**.
2. **Authentication → Settings → Authorized domains** → adicionar `garbosaturismo.com.br`.
3. **Realtime Database → Regras** → colar o conteúdo de `database.rules.json` e publicar.
4. Criar a conta do administrador em `#/cadastro` com `contato@feliperodrigues.net`.
5. **Authentication → Sign-in method → Google** ativado. No primeiro acesso pelo Google o sistema pede os dados
   que faltam (agência, CPF/CNPJ, WhatsApp, @ e tipo). Usuários removidos pelo admin ficam em `bloqueados/` e não conseguem se recadastrar.

## Estrutura do banco
```
usuarios/{uid}                     perfil (nome, empresa, documento, whatsapp, email, tipo, ativo)
agencias/{uid}                     nome da agência (lista para a transportadora)
viagens/{id}                       veículos agendados pelas transportadoras
excursoes/{uidAgencia}/{id}        excursões + veiculos/{vId}
viajantes/{uidAgencia}/{exId}/{id} passageiros
poltronas/{uidAgencia}/{exId}/{vId}/{numero} = idViajante
logs/{id}                          login, logout, sessão, cadastro e ações do admin
instagram/{handle}                 { uid, nome, empresa } — busca de colaboradores
inscricoes/{exId}                  dados públicos do link de inscrição
compartilhadas/{uid}/{exId}        = uid da agência dona (excursões compartilhadas comigo)
notificacoes/{uid}/{id}            avisos do sino
```

## Venda online (Asaas)

### Como funciona
1. **Agência** cadastra a excursão e, em *Venda online (Asaas)*, escolhe o **início do parcelamento** (1º vencimento do boleto)
   e **até quantas vezes** (1 a 6). Pode escrever uma descrição que aparece na página de venda.
2. No ícone 🛒 **Venda online** (lista de excursões, Viajantes ou Financeiro) ficam o **link de venda**, os **cupons** e os **pedidos**.
3. **Cupom**: código, valor cobrado por pessoa com o cupom e **quantas pessoas por compra** usam o cupom.
   Ex.: cupom para 5 pessoas → numa compra com 7, as 5 primeiras pagam o valor promocional e a 6ª e a 7ª pagam o valor cheio.
   Opcional: limite total de pessoas e validade.
4. **Comprador** abre o link: vê a descrição, o valor e as formas de pagamento → preenche titular e dependentes
   (nome, CPF, RG, nascimento, e-mail, WhatsApp e endereço; dependentes podem herdar contato e endereço do titular; crianças de até 5 anos podem ir no colo)
   → aplica o cupom e vê o valor final → escolhe as poltronas no mapa (verde = livre, cinza = reservada) na ordem em que cadastrou
   → escolhe **cartão em até Nx**, **Pix à vista** ou **boleto em até Nx** → é levado à página de pagamento do Asaas.
5. As poltronas ficam reservadas na hora e os viajantes entram na lista (selo *online*). Os pagamentos chegam pelo webhook
   e entram sozinhos no **Financeiro** de cada viajante.
6. **Pix ou cartão não pagos até o dia seguinte**: o pedido expira, a cobrança é cancelada e as poltronas são liberadas.
   **Boleto vencido**: a agência é avisada e pode cobrar pelo WhatsApp ou cancelar o pedido no painel.

Regras: o boleto só oferece as parcelas que vencem **antes da saída**; toda parcela tem no mínimo R$ 5,00;
o servidor recalcula preço, cupom, parcelas e poltronas — o navegador só mostra.

### Arquivos
```
api/venda.js              GET  dados públicos da excursão + poltronas ocupadas
api/cupom.js              POST confere um cupom
api/pedido.js             POST fecha a compra (reserva poltronas + cobrança no Asaas)
api/asaas-webhook.js      POST avisos do Asaas (pago, vencido, estornado)
api/pedido-cancelar.js    POST agência cancela pedido sem pagamento
api/_lib/                 Firebase Admin, cliente do Asaas e regras de servidor
sistema/comprar.html      página pública de compra (+ js/comprar.js)
sistema/js/venda-regras.js regras compartilhadas (valores, cupom, parcelas, validações)
tests/                    testes (npm test) e servidor local com banco em memória (node tests/servidor-local.js)
```

### Configuração (uma vez)
1. **Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave privada** (baixa um .json).
2. **Vercel → Project → Settings → Environment Variables** (Production e Preview):
   | Variável | Valor |
   |---|---|
   | `ASAAS_API_KEY` | chave da API do Asaas (começa com `$aact_`, cole com o `$`) |
   | `ASAAS_WEBHOOK_TOKEN` | uma senha longa inventada (32+ caracteres, sem espaços) |
   | `FIREBASE_SERVICE_ACCOUNT` | o conteúdo inteiro do .json da conta de serviço |
   | `ASAAS_AMBIENTE` | `sandbox` só para testar com uma chave do sandbox; em produção não crie |
   Depois de salvar, faça um *Redeploy*.
3. **Asaas → Integrações → Webhooks → Adicionar**: URL `https://garbosaturismo.com.br/api/asaas-webhook`,
   token = o mesmo `ASAAS_WEBHOOK_TOKEN`, versão v3, fila ativada, eventos de **Cobranças**
   (PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED).
4. Asaas: ter uma **chave Pix** cadastrada (para cobranças Pix).
5. Firebase → Realtime Database → Regras: publicar de novo o `database.rules.json` (inclui `pedidos`, `cupons` e `venda`).

### Estrutura nova no banco
```
excursoes/{uid}/{exId}/venda           { ativa, primeiraParcela, maxParcelas }
excursoes/{uid}/{exId}/cupons/{CODIGO} { valor, porCompra, limite, validade, ativo }
pedidos/{uid}/{exId}/{pedidoId}        compra online (titular, viajantes, valores, asaas, pagamentos, status)
pedidosIdx/{pedidoId}                  { own, exId }           (só servidor)
vendasUso/{exId}/{CODIGO}              pessoas que já usaram o cupom
vendasCpf/{exId}/{cpf}                 pedido aguardando pagamento do titular (só servidor)
asaasEventos/{id}                      eventos do webhook já processados (só servidor)
```

## Área do viajante (conta, pré-cadastro e Minhas viagens)
- Para comprar pelo link, o viajante entra na conta (e-mail/senha ou Google). **Na primeira vez** cria a conta e faz o
  **pré-cadastro** (nome, CPF, RG, nascimento, e-mail, WhatsApp e endereço). O titular da compra é sempre o dono da conta.
- Nas próximas compras os dados vêm preenchidos e os **dependentes** usados antes aparecem para incluir com um toque.
- `sistema/minha-conta.html` — **Minhas viagens**: próximas viagens e histórico; ao tocar numa viagem aparecem
  os viajantes, as poltronas e as **parcelas pagas, em aberto e vencidas** (consultadas na hora no Asaas), com botão de pagar e boleto em PDF.
  Aba **Meus dados** para atualizar o cadastro e remover dependentes salvos.
- A conta do viajante usa uma sessão separada da agência; se um viajante tentar entrar no sistema da agência, é avisado e desconectado.
- Banco: `clientes/{uid}` (perfil + dependentes, o próprio viajante lê e grava) e `clientesPedidos/{uid}/{pedidoId}` (só servidor).
- API: `GET /api/minhas-viagens` e `GET /api/minhas-viagens?pedido=ID` (com o token da conta).

## Administrar site (só contato@feliperodrigues.net)
- Menu **Administração → Administrar site** (e botão na tela inicial do sistema).
- Adicionar, editar, ocultar, reordenar e remover as excursões do **catálogo (excursoes.html)**;
  ⭐ marca as que aparecem em **Destinos em destaque** no index.
- Fotos/folders são enviados para o GitHub (`Assets/img/excursoes/`) pela função `/api/site-imagem`;
  a Vercel publica de novo sozinha (≈1 min). Enquanto isso o site usa o link direto do GitHub.
- "Importar as excursões que já estão no site" cria a lista inicial a partir das excursões fixas.
- No cadastro da excursão: **Adicionar folder** e a caixa **Mostrar no catálogo do site**; no painel 🛒 Venda online
  há a mesma caixa. Marcada, a excursão entra no catálogo com o folder e o botão **Comprar** (link de venda).
- Se o banco não responder ou a lista estiver vazia, excursoes.html e o index mostram as excursões fixas.
- Banco: `site/excursoes/{id}` (leitura pública; escrita do admin ou da agência dona).
- Vercel: variável **`GITHUB_TOKEN`** (token do GitHub com permissão *Contents: Read and write* no repositório).

## Escolha de poltrona sem pagamento (sem login)
Os dois links ficam em **Link de inscrição** de cada excursão e funcionam enquanto as inscrições estiverem abertas.
- `sistema/poltrona.html?e={id}` — **escolha rápida**: nome completo + RG (ou certidão de nascimento, com botão para enviar
  pelo WhatsApp (32) 9 9977-5281) e a poltrona no mapa. API `/api/poltrona-livre`. Viajantes com selo "poltrona".
- `sistema/reservar.html?e={id}` — **reserva completa**: mesmos dados da compra (CPF, nascimento, contato, endereço, colo), sem pagamento.
  API `/api/reserva`. Viajantes com selo "reserva" e pagamento "A combinar".
- As duas reservam a poltrona em transação (sem duplicar lugar), avisam a agência no sino e não precisam de regras novas no banco.
