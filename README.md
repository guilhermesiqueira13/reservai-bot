# ReservAI Bot

This project provides a simple chatbot server using Express and Dialogflow to manage appointments.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
   This installs required packages such as **dotenv** which is necessary for loading environment variables.

2. Create your `.env` file by copying the example provided:
   ```bash
   cp .env.example .env
   ```
   Adjust the values inside `.env` as needed for your environment.

3. Start the development server:
   ```bash
   npm start
   ```
   or
   ```bash
   node index.js
   ```

The server will start on the port specified in your `.env` file (default is `3000`).
