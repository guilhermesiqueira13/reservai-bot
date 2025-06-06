const dialogflow = require("@google-cloud/dialogflow");

const sessionClient = new dialogflow.SessionsClient({
  keyFilename: "./reservai_twilio.json",
});

const projectId = "reservai-twilio-qrps";

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
