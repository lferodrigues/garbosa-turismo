# Garbosa System

Sistema interno de gestão de excursões — acessível em `https://garbosaturismo.com.br/sistema/`.
Fica isolado nesta pasta e não altera nenhuma página do site.

SPA (página única) com rotas por hash: `#/login`, `#/cadastro`, `#/calendario`, `#/excursoes`,
`#/viajantes/{id}`, `#/poltronas/{id}`, `#/viagens`, `#/usuarios`, `#/logs`.

## Perfis
- **Agência de turismo**: calendário, excursões (valor por poltrona), viajantes, poltronas, inserir veículos.
- **Transporte / Fretamento**: calendário e viagens com orçamento (chofer + diesel + gastos + margem).
- **Administrador** (`contato@feliperodrigues.net`, e-mail confirmado): acesso a tudo + controle de usuários
  (adicionar, editar, desativar, remover, redefinir senha) + relatório de logs de acesso.
  A senha do admin **não** fica no código: é definida ao criar a conta.

Todas as páginas exportam **XLSX** e **PDF** (o PDF de poltronas desenha o mapa do veículo).

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
4. Criar a conta do administrador em `#/cadastro` com `contato@feliperodrigues.net` e confirmar o e-mail.

## Estrutura do banco
```
usuarios/{uid}                     perfil (nome, empresa, documento, whatsapp, email, tipo, ativo)
agencias/{uid}                     nome da agência (lista para a transportadora)
viagens/{id}                       veículos agendados pelas transportadoras
excursoes/{uidAgencia}/{id}        excursões + veiculos/{vId}
viajantes/{uidAgencia}/{exId}/{id} passageiros
poltronas/{uidAgencia}/{exId}/{vId}/{numero} = idViajante
logs/{id}                          login, logout, sessão, cadastro e ações do admin
```
