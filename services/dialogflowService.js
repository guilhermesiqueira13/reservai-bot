const dialogflow = require("@google-cloud/dialogflow");

const keyFilename = process.env.DIALOGFLOW_KEY_FILE || "./reservai_twilio.json";
const projectId =
  process.env.DIALOGFLOW_PROJECT_ID || "reservai-twilio-qrps";

const sessionClient = new dialogflow.SessionsClient({ keyFilename });

function detectIntent(sessionId, text) {
  const sessionPath = sessionClient.projectAgentSessionPath(
    projectId,
    sessionId
  );
  const request = {
    session: sessionPath,
    queryInput: {
      text: { text, languageCode: "pt-BR" },
    },
  };
  return sessionClient.detectIntent(request);
}

module.exports = { detectIntent };
