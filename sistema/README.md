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
`(valor do transporte + Σ valor unitário de cada item × lotação do veículo) ÷ divisor`

- **Itens por pessoa**: **Ingressos** (fixo) + os produtos criados no botão **Adicionar produto** (nome + valor unitário).
  Cada item tem o **valor unitário** e o valor **até 5 anos** (em branco = mesmo valor).
- **Criança até 5 anos completos que ocupa poltrona**: mesmo cálculo usando os valores "até 5 anos" dos itens.
- **Criança de colo**: não ocupa poltrona e paga só o *Valor para criança de colo*.
- **Valor final à mão**: no cadastro da excursão, a caixa *Definir o valor final à mão* troca o valor gerado pelo sistema
  pelo digitado (`valorFinal`; criança até 5 anos com poltrona em `valorFinalInfantil`, em branco = mesmo valor).
  Vale para todos os veículos, na compra online, na reserva, no link de inscrição e no cadastro de viajantes.
  Leito, opcionais e colo continuam à parte. Desmarcar volta ao cálculo automático. (`R.valorFinalManual`)
- Excursões antigas (com o "valor total dos ingressos" no veículo) continuam com o mesmo preço até serem editadas;
  ao editar, o total é convertido para valor unitário (total ÷ lotação).
- A regra fica em `sistema/js/venda-regras.js` (`custosVeiculo`, `precoDeCent`) e é a mesma no sistema, no link de inscrição,
  na reserva e na venda online (o servidor recalcula pela idade na data da saída).

## Opcionais da excursão
No cadastro da excursão, seção **Opcionais** → **Adicionar opcional**: título, descrição e valor (ex.: passeio de barco, almoço, camisa).
- O viajante marca os que quiser na **compra online**, na **reserva** e na **escolha rápida de poltrona**; o valor de cada opcional
  marcado é somado ao valor dele (e à cobrança no Asaas). Não entra no rateio do veículo e não tem desconto de cupom.
- No **Cadastrar/Editar viajante** do painel há as mesmas caixinhas (marcar/desmarcar soma/tira do "Valor a pagar").
- A lista de viajantes mostra um selo com cada opcional, e a planilha/PDF ganham a coluna **Opcionais**.
- O link de inscrição antigo (`inscricao.html`) não oferece opcionais (o valor dele é travado pelas regras do banco).
- Banco: `excursoes/{uid}/{exId}/opcionais/{id}` = `{ titulo, descricao, valor, ordem }`; no viajante, `opcionais/{id}` = `{ titulo, valor }`.
  Não precisa republicar as regras. Regras de preço em `venda-regras.js` (`opcionaisDe`, `opcionaisCent`).

## Grupo do WhatsApp da excursão
No cadastro da excursão, botão **Adicionar link do grupo do WhatsApp** (link de convite `https://chat.whatsapp.com/...`).
Depois da compra online o cliente vai direto para o grupo:
- **Pix e cartão**: a cobrança é criada com `callback.successUrl` → depois de pagar, o Asaas leva para `sistema/obrigado.html?p={pedido}`,
  que mostra a confirmação com **Baixar o comprovante** e **Entrar no grupo oficial** (sem sair sozinha). O domínio precisa ser o mesmo cadastrado no Asaas
  (*Minha conta → Informações → site*); se o Asaas recusar, a cobrança é criada sem o redirecionamento (o link continua em *Minhas viagens*).
  Outro domínio: variável `SITE_URL` na Vercel.
- **Boleto**: a página de compra termina numa tela com **Baixar o boleto** e **Entrar no grupo oficial da excursão** (não sai sozinha);
  no parcelado avisa que as próximas parcelas chegam no WhatsApp 5 dias antes de cada vencimento.
- O link também aparece em **Minhas viagens**. Ele não é mostrado na página pública da excursão — só para quem comprou.
- API: `GET /api/pedido-grupo?p={pedido}`.

## Relatórios da excursão
Ícone 📄 **Relatórios** na lista de excursões, ou os botões **Custos** e **Quem pagou (Asaas)** no Financeiro. Os dois exportam XLSX e PDF.
- **Custos e valores**: ônibus/transporte, ingressos e cada produto (unitário, até 5 anos, quantidade e total) por veículo e somados,
  valor por poltrona, receita prevista, recebido e resultado (receita − custo).
- **Quem pagou e quem não pagou**: compras online com as parcelas consultadas **na hora no Asaas** (pago, parcial, vencido, aguardando, cancelado,
  próximo vencimento, cobrança pelo WhatsApp) + os demais viajantes com os pagamentos do Financeiro. Se o Asaas não responder, mostra o que o webhook já gravou.
  API: `GET /api/relatorio-pagamentos?e={exId}&own={uidAgencia}` com o token do sistema (agência dona, colaborador ou admin).
  O botão do WhatsApp (Financeiro e Quem pagou) leva o boleto da próxima parcela em aberto de quem comprou online: link do PDF + linha
  digitável (cartão ou Pix: link de pagamento). O wa.me só aceita texto, por isso o PDF não vai anexado.
  API: `POST /api/asaas-whatsapp { pedido, acao: "cobranca" }`. Quem foi cadastrado à mão não tem boleto: a mensagem vai sem ele.

| Veículo | Divisor |
|---|---|
| Van 15 | 10 |
| Van 20 | 15 |
| Micro 32 | 20 |
| Micro 36 | 28 |
| Ônibus 42 | 29 |
| Ônibus 46 | 32 |
| Ônibus 50 | 35 |
| Ônibus Double Decker 60 (`dd60`) | 40 |
| Ônibus 64 (só excursões antigas) | 40 |

**Double Decker 60**: mapa de dois pisos (superior 1–48; inferior 49–60, leito completo).
As poltronas **leito (49 a 60) custam + R$ 20** por pessoa: na compra online, na reserva, na escolha rápida e no painel
(ao sentar/tirar alguém do leito o valor do viajante sobe/desce R$ 20; compras online não mudam). Regra em `venda-regras.js` (`VEICULOS.dd60.leito`, `extraPoltronaCent`).
O ônibus de 64 não aparece mais para excursões novas, mas continua valendo nas que já o usam.

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
excursoes/{uidAgencia}/{id}        excursões + veiculos/{vId} + ingresso {valor, valorInfantil} + produtos/{pId} {nome, valor, valorInfantil, ordem}
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

7. **WhatsApp e lembretes**: antes de criar a cobrança, o sistema configura as notificações do cliente no Asaas
   (`ligarWhatsapp` / `ajustesNotificacoes` em `api/_lib/asaas.js`): WhatsApp ligado (o celular é o WhatsApp do cadastro),
   **cobrança criada** sempre ligada (o cliente recebe a cobrança ao finalizar) e o lembrete antes do vencimento passa para
   **5 dias antes** de cada parcela (`DIAS_LEMBRETE`; o Asaas aceita 0, 5, 10, 15 ou 30). Aviso no dia e de atraso seguem o painel do Asaas.
7b. **Excluir no sistema = cancelar no Asaas**: ao excluir um viajante de compra online (em Viajantes ou no Financeiro) ou a excursão,
   a compra inteira é encerrada pela `/api/pedido-cancelar` (`excluir: true`): sem pagamento, a cobrança é cancelada no Asaas;
   com parcela paga, só as parcelas em aberto são apagadas (o pago se estorna pelo Asaas). Poltronas liberadas, viajantes removidos,
   pedido "cancelado" — o cliente não vê mais fatura em aberto em Minhas viagens.
8. **Apagar no Asaas = cancelar no sistema**: quando todas as cobranças de um pedido sem pagamento são apagadas no Asaas
   (webhook `PAYMENT_DELETED`), o pedido é cancelado e as poltronas liberadas. Pedidos que ficaram presos antes disso se
   acertam sozinhos quando o cliente abre Minhas viagens (`cancelarSeApagadoNoAsaas`; com o Asaas fora do ar nada muda).

Regras: o boleto só oferece as parcelas que vencem **antes da saída**; toda parcela tem no mínimo R$ 5,00;
o servidor recalcula preço, cupom, parcelas e poltronas — o navegador só mostra.

### Arquivos
```
api/venda.js              GET  dados públicos da excursão + poltronas ocupadas
api/cupom.js              POST confere um cupom
api/pedido.js             POST fecha a compra (reserva poltronas + cobrança no Asaas)
api/asaas-webhook.js      POST avisos do Asaas (pago, vencido, estornado)
api/pedido-cancelar.js    POST agência cancela pedido sem pagamento
api/relatorio-pagamentos.js GET quem pagou / quem não pagou (parcelas consultadas no Asaas)
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
- **excursoes.html mostra só excursões do sistema**: itens publicados pelo Garbosa System ou cujo botão leva a uma excursão do sistema
  (`sistema/comprar|inscricao|reservar|poltrona.html?e=…`). Páginas antigas/fixas não aparecem; sem nenhuma, mostra "Nenhuma excursão disponível".
  A página usa o mesmo visual da página inicial (cabeçalho, cartões, chamada e rodapé de `Assets/css/novosite/home.css`).
- **Oculta no Administrar site = não aparece em lugar nenhum**: some do catálogo, dos destaques e do banner da página inicial,
  perde o selo automático, e os links públicos (compra, reserva, escolha de poltrona e inscrição) mostram
  "Esta excursão não está disponível no momento" (`ocultaNoSite` em `api/_lib/venda.js`). Ao reexibir, tudo volta.
  Excursão que nunca foi para o catálogo continua com o link da agência funcionando. A página inicial não tem mais
  excursões fixas no HTML: banner e destaques vêm só do Administrar site.
- **Status (selo)** no cadastro: *Promoção*, *Últimas vagas* ou *Esgotado* aparece no canto da foto no catálogo e nos destaques.
- **Banner da página inicial**: no Administrar site, o botão <i class="fa-solid fa-images"></i> (ou a caixa *Mostrar no banner* no cadastro)
  coloca a excursão no banner do topo, depois do slide de boas-vindas, com folder, título, descrição, data/local, botão e selo.
  Sem nenhuma marcada, o banner fica com os slides fixos do HTML. Campo `banner` em `site/excursoes/{id}` (**republicar as regras**).
- **Destinos em destaque**: as marcadas com ⭐ (botão de estrela no Administrar site); sem nenhuma marcada, aparecem as primeiras do catálogo —
  sempre com os selos Promoção / Últimas vagas / Esgotado.
- **Selo automático**: excursões do sistema — e itens do catálogo cujo botão leva a uma excursão do sistema — ganham sozinhas
  **Últimas vagas** quando faltam 40% ou menos das poltronas (ocupadas = poltronas marcadas no mapa, somando todos os veículos;
  viajantes sem poltrona marcada não contam; `vagasDaExcursao`) e **Esgotado** quando todas estão ocupadas. "Esgotado" marcado à mão continua valendo;
  nos outros casos o automático tem prioridade sobre o selo manual. O catálogo e os destaques consultam `GET /api/venda?vagas=1`
  (cache de 1 minuto); as páginas de compra, reserva e poltrona mostram o mesmo selo no topo, e a tela Viajantes do painel também.
  Regra em `venda-regras.js` (`seloVagas`, `PCT_ULTIMAS`).
  Esgotado deixa a foto em preto e branco e troca o botão por "Esgotado" (sem link). A venda online só fecha desmarcando *Vender pela internet* na excursão.
- Banco: `site/excursoes/{id}` (leitura pública; escrita do admin ou da agência dona).
- Vercel: variável **`GITHUB_TOKEN`** (token do GitHub com permissão *Contents: Read and write* no repositório).

## Ônibus com embarque próprio (ex.: Descoberto)
Em **Poltronas**, escolha a aba do veículo e toque em **Embarque do veículo**: cidade, CEP(s), local e horário de saída
(ex.: Descoberto · 36690-000 · Praça de Descoberto · 03:30).
- Nas páginas de compra, reserva e escolha rápida, esse ônibus **só aparece para quem tem CEP da lista** (na escolha rápida
  aparece o campo *CEP de onde mora*), e quem é da cidade **só escolhe poltrona nele**. Os outros CEPs usam os outros veículos.
- O topo das páginas mostra "Saída de Descoberto: Praça de Descoberto, às 03:30" e o mapa desse ônibus tem o mesmo aviso.
- O servidor recusa poltrona nesse ônibus para CEP de fora (`conferirEmbarque`). **Distribuir** no painel só coloca nele
  viajantes com CEP da cidade. O PDF do mapa traz o embarque no título.
- Banco: `excursoes/{uid}/{exId}/veiculos/{vk}/embarque` = `{ cidade, ceps, local, hora }` (sem mudança nas regras).
- CEP **36690-000** sempre vai no **veículo 2**, mesmo sem embarque cadastrado (`CEP_VEICULO_2`): o cliente só vê esse veículo, o servidor
  recusa poltrona nos outros (`veiculoLiberado`) e o **Distribuir** não o coloca em outro. Se um veículo tiver embarque próprio para esse
  CEP, vale esse veículo. Se ele lotar, a agência coloca a pessoa à mão no mapa do painel; quem já tem poltrona não muda de veículo.

## Mais de uma saída na excursão
No formulário da excursão, abaixo de **Local de saída**, toque em **Adicionar outra saída** e informe o local e o horário (até 10).
- É só informativo: o passageiro não escolhe o embarque. As saídas aparecem nas páginas de compra, reserva, poltrona e inscrição,
  em Minhas viagens (compras novas), nos detalhes da excursão, nas mensagens de WhatsApp e no PDF do mapa.
- Para separar um ônibus por cidade e CEP, continue usando o **Embarque do veículo** (acima).
- Banco: `excursoes/{uid}/{exId}/saidas` = `[{ local, hora }]`, copiado para `inscricoes/{exId}` (sem mudança nas regras).

## Financeiro Asaas
Menu **Operacional → Financeiro Asaas**: só o que está no Asaas, consultado na hora, com filtros por cliente, excursão, mês e situação, e exportação em XLSX e PDF.
- **Admin:** todas as cobranças da conta (inclusive as criadas direto no Asaas, como "Fora do sistema") e o saldo da conta.
- **Agência:** só as cobranças dos pedidos dela, sem o saldo da conta.
- API: `GET /api/relatorio-pagamentos?asaas=1` com o token do sistema.
- Mês: usa a data do pagamento nas cobranças recebidas e o vencimento nas demais.

## Vitrine dos links de poltrona e de compra
Os links `poltrona.html` e `comprar.html` (inclusive o botão Comprar do site) abrem primeiro uma vitrine; na compra, o botão é **Comprar** e leva ao login e ao pagamento. A reserva (`reservar.html`) não tem vitrine.
A vitrine mostra: fotos do local, resumo da viagem, preço, fotos dos veículos e o botão **Escolher poltrona**, que leva ao cadastro.
- **Personalizar:** em **Excursões**, botão **Personalizar vitrine** de cada excursão. A página tem prévia ao lado: título, descrição, fotos do local, dos veículos e de cada adicional (até 6 de cada, salvas no GitHub do site; segure e arraste para mudar a ordem), dados do veículo de cada foto (empresa, assentos, categoria, Wi-Fi, ar-condicionado, carregador, frigobar, banheiro e descrição, que mudam ao lado da foto no carrossel), aviso dos veículos e opção de esconder os preços. Só grava ao clicar em **Salvar**.
- Sem foto do local, aparece o folder. A descrição aparece também na página de reserva e no catálogo do site; na compra, fica só na vitrine.
- Banco: `excursoes/{uid}/{exId}/descricao`, `fotosLocal`, `fotosVeiculos` = `[{ caminho, raw, dados: { empresa, assentos, categoria, descricao, itens } }]`, `fotosOpcionais` = `{ idDoOpcional: [fotos] }` e `vitrine` = `{ titulo, aviso, ocultarPreco }` (sem mudança nas regras).
- **Menu e rodapé:** iguais aos do site principal (`index.html`), nas páginas de poltrona, compra e reserva. Quem mudar o menu ou o rodapé do site precisa mudar também em `vitrine.js` (`mostrarMoldura`) e copiar o estilo para `sistema.css`.
- Banco: `excursoes/{uid}/{exId}/fotosLocal` e `fotosVeiculos` = `[{ caminho, raw }]` (sem mudança nas regras).

## Cupons (administrador)
Menu **Administração → Cupons**: lista os cupons de todas as excursões, com uso e situação, e cria cupons sem limite de quantidade.
- **Novo cupom** vale para uma ou várias excursões futuras: desconto em R$, em % ou valor final. O valor com cupom é calculado para cada excursão ao criar; depois é um valor fixo.
- Quem já tem o mesmo código ou fica sem desconto válido é pulado, e o sistema avisa. Limite de pessoas e usos contam por excursão.
- Cupom só vale na compra online. O painel **Venda online** de cada excursão continua funcionando, inclusive para as agências.

## Galeria
Menu **Operacional → Galeria**: um álbum por excursão, com o nome dela, montado com as fotos que ela usa (local, veículos, adicionais e folder).
- Na página **Vitrine**, o botão **Escolher da galeria** reaproveita fotos de qualquer álbum, sem enviar de novo.
- Os álbuns vêm das próprias excursões: não há cópia no banco. Excluir a excursão ou tirar a foto da vitrine tira a foto da galeria (o arquivo continua no GitHub).

## Link de um veículo só
Em **Poltronas**, com mais de um veículo, o link do topo acompanha a aba escolhida: `poltrona.html?e={id}&v={veículo}`.
- O cliente vê só esse veículo, e o servidor recusa poltrona em outro.
- Esse link não pergunta o CEP, a não ser que o veículo tenha **Embarque do veículo** cadastrado. Como foi a agência que escolheu o veículo,
  a regra do CEP 36690-000 não troca a pessoa de ônibus (só recusa quem já tem cadastro com esse CEP em outro veículo).
- O link geral, com todos os veículos, continua em **Link de inscrição**.

## Escolha de poltrona sem pagamento (sem login)
Os dois links ficam em **Link de inscrição** de cada excursão e funcionam enquanto as inscrições estiverem abertas.
- `sistema/poltrona.html?e={id}` — **escolha rápida**: nome completo + RG (ou certidão de nascimento, com botão para enviar
  pelo WhatsApp (32) 9 9977-5281) e a poltrona no mapa. API `/api/poltrona-livre`. Viajantes com selo "poltrona".
- `sistema/reservar.html?e={id}` — **reserva completa**: mesmos dados da compra (CPF, nascimento, contato, endereço, colo), sem pagamento.
  API `/api/reserva`. Viajantes com selo "reserva" e pagamento "A combinar".
- Na escolha rápida dá para **Adicionar criança de colo** (até 5 anos completos na data da saída, pela data de nascimento):
  não ocupa poltrona, vai no colo de um adulto da lista e paga o *Valor para criança de colo*.
- **Documento já cadastrado**: antes do mapa, os documentos são comparados com os viajantes da excursão (RG, CPF ou matrícula,
  com ou sem pontuação: "MG-12.345.678" = "12345678"). Se já existir, aparece um pop-up com o nome abreviado e a poltrona
  perguntando se quer mudar algo: **manter** (não duplica; pode levar criança no colo), **mudar** (troca a poltrona/corrige o nome —
  só cadastros feitos por este link; os da agência mostram o botão do WhatsApp) ou corrigir o documento digitado.
- As duas reservam a poltrona em transação (sem duplicar lugar), avisam a agência no sino e não precisam de regras novas no banco.
