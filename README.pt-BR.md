<p align="center">
  <img src="frontend/public/game/logo-wordmark.png" alt="Urubu da Monad" width="280" />
</p>

# Urubu da Monad

[English version](./README.md)

Mini app de trading para Farcaster + Monad.

O projeto conecta um frontend em Next.js com contratos onchain de trading binario, passkeys para carteira embedded, rotas server-side para integrar protocolo e ramp BRL via Orda.

## Stack do projeto

| Camada | Tech stack | Uso no projeto |
| --- | --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, CSS Modules | Interface do jogo, tela de trade, wallet UI, passkeys e ramp |
| Estado e dados | TanStack Query, Zod | Cache, refetch de snapshot onchain, validacao de payloads |
| Onchain client | viem, wagmi | Leitura e escrita em contratos, `approve`, `openPosition`, `settle` |
| Farcaster | `@farcaster/miniapp-sdk`, `@farcaster/miniapp-wagmi-connector` | Mini app, contexto do Farcaster e conexao de carteira |
| Backend do app | Next.js Route Handlers | APIs internas para snapshot do protocolo, sessao passkey, quotes e status |
| Passkeys | webauthx, cookies no servidor | Criacao/autenticacao de carteira e assinatura server-side |
| Ramp fiat | `@ordanetwork/sdk` | On-ramp e off-ramp BRL/PIX |
| OG/image | `@vercel/og` | Geracao de imagem social do app |
| Smart contracts | Solidity 0.8.20, Foundry, OpenZeppelin | `Binary`, `LiquidityVault`, `ConfigurationManager` e oraculos |
| Oracle | Pyth, Uniswap V3 TWAP, Uniswap V4 spot | Fonte de preco para abertura e settle das posicoes |
| Keeper | Node.js, TypeScript, viem, Vitest | Bot que monitora posicoes e chama `settle()` |

## Estrutura do projeto

- `frontend/`: app Next.js com UI, API routes e integracoes com Farcaster, passkeys, Orda e protocolo.
- `contracts/`: contratos Solidity, scripts de deploy e testes Foundry.
- `keeper/`: bot separado para monitorar eventos do contrato e executar settle/liquidacao.

## Backend em uma frase

O backend fica dentro do proprio app Next.js, via `app/api/*`, sem banco tradicional: o estado principal vem da blockchain, e a sessao da carteira com passkey fica em cookies assinados no servidor.

## Principais integracoes do backend

- `/api/protocol/*`: snapshot do protocolo e recuperacao de posicao ativa.
- `/api/passkeys/*`: registro, login, sessao, transferencia e acoes no contrato.
- `/api/orda/*`: cotacao e acompanhamento de on-ramp e off-ramp.
- `/api/og`: imagem Open Graph dinamica.

## Contratos principais

- `Binary`: abre e encerra posicoes long/short.
- `LiquidityVault`: vault ERC4626 que segura a liquidez do protocolo.
- `ConfigurationManager`: configura oracle, fee, duration e limites.
- `PythOracle`, `UniswapTWAPOracle`, `UniswapV4Oracle`: implementacoes de oracle.

## Como rodar localmente

### Frontend

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

### Contracts

```bash
cd contracts
forge build
forge test
```

### Keeper

```bash
cd keeper
npm install
npm run start
```

## Variaveis importantes

- `NEXT_PUBLIC_URL`: URL publica do mini app
- `PASSKEY_WALLET_SECRET`: segredo para selar a sessao da passkey
- `PASSKEY_RP_ID` e `PASSKEY_ORIGIN`: configuracao WebAuthn
- `ORDA_CLIENT_ID` e `ORDA_CLIENT_SECRET`: credenciais da Orda
- `FARCASTER_HEADER`, `FARCASTER_PAYLOAD`, `FARCASTER_SIGNATURE`: associacao da mini app no Farcaster

## Resumo

Esse repo e um monorepo simples com tres pecas:

- app Next.js para frontend + backend
- contratos Solidity com Foundry
- keeper em TypeScript para operacao do protocolo
