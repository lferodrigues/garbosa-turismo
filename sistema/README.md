# Garbosa System

Sistema interno de gestão de excursões — acessível em `https://garbosaturismo.com.br/sistema/`.
Fica isolado nesta pasta e não altera nenhuma página do site.

## Perfis
- **Agência**: calendário, cadastro de excursões (valor por poltrona), viajantes, mapa de poltronas, inserir mais veículos.
- **Empresa de transporte**: calendário e cadastro de viagens com orçamento (chofer + diesel + gastos + margem).

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

## Estrutura do banco
```
usuarios/{uid}                     perfil (nome, empresa, tipo)
agencias/{uid}                     nome da agência (lista para a transportadora)
viagens/{id}                       veículos agendados pelas transportadoras
excursoes/{uidAgencia}/{id}        excursões + veiculos/{vId}
viajantes/{uidAgencia}/{exId}/{id} passageiros
poltronas/{uidAgencia}/{exId}/{vId}/{numero} = idViajante
```
