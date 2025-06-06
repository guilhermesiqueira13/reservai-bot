# ReservAI Bot

Este projeto fornece um servidor de chatbot simples usando Express e Dialogflow para gerenciar agendamentos.

## Configuração

1. Instale as dependências:
   ```bash
   npm install
   ```
   Isso instala os pacotes necessários, como **dotenv**, que é indispensável para carregar variáveis de ambiente.

2. Crie o seu arquivo `.env` copiando o exemplo disponibilizado:
   ```bash
   cp .env.example .env
   ```
   Ajuste os valores dentro do `.env` conforme o seu ambiente.

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm start
   ```
    ou
   ```bash
   node index.js
   ```

O servidor iniciará na porta especificada no seu `.env` (o padrão é `3000`).
