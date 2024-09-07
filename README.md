# hfb-bot
## Como instalar
1. [Instale o Node.js](https://www.alura.com.br/artigos/como-instalar-node-js-windows-linux-macos)
2. [Clone ou faça download deste repositório](https://docs.github.com/pt/repositories/creating-and-managing-repositories/cloning-a-repository)
3. Abra a pasta baixada/clonada no terminal ou prompt de comando ([tutorial para Windows](https://medium.com/@adsonrocha/como-abrir-e-navegar-entre-pastas-com-o-prompt-de-comandos-do-windows-10-68750eae8f47)).
4. Instale todas as dependências: `npm install`
## Como executar
1. Abra a pasta no terminal ou prompt de comando
2. Execute o comando `npm run start token`, com `token` sendo substituído por um token obtido no [Haxball Headless Token](https://www.haxball.com/headlesstoken). Tokens expiram, então obtenha um novo token para cada vez que for abrir.
3. Para fechar a sala, feche o terminal ou aperte Ctrl+C.
## Log e recs
Para utilizar os sistemas de logging e recs, é necessário criar um arquivo `.env`:
```env
DISCORD_TOKEN="DISCORD_TOKEN"
RECS_CHANNEL_ID="RECS_CHANNEL_ID"
GUILD_ID="GUILD_ID"
ENABLE_LOG=true
UNSAFE_CONNECTION_LOG="LINK_WEBHOOK_UNSAFE"
SAFE_CONNECTION_LOG="LINK_WEBHOOK_SAFE"
CHAT_LOG="LINK_WEBHOOK_CHAT"
```
### Logging
Para ativar o log, garanta que `ENABLE_LOG` esteja definido como `true`. Então preencha as outras 3 variáveis, `UNSAFE_CONNECTION_LOG`, `SAFE_CONNECTION_LOG` e `CHAT_LOG`, com o link do webhook para o log de IPs, IPs criptografados (seguro) e chat, respectivamente.
### Recs
Declare as variáveis `DISCORD_TOKEN`, `RECS_CHANNEL_ID` e `GUILD_ID` com o token de Discord do bot, o ID do canal de recs e o ID do servidor do Discord, respectivamente.
