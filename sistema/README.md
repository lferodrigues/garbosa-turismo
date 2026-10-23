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
- **Sino de notificações**: inscrição pelo link, veículo agendado, colaboração e pagamentos.

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
