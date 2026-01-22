const twilio = require("twilio");

const getTwilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_CONTENT_SID;

  return { accountSid, authToken, whatsappFrom, contentSid };
};

const isWhatsappConfigured = () => {
  const { accountSid, authToken, whatsappFrom } = getTwilioConfig();
  return Boolean(accountSid && authToken && whatsappFrom);
};

const getTwilioClient = () => {
  const { accountSid, authToken } = getTwilioConfig();
  if (!accountSid || !authToken) {
    return null;
  }
  return twilio(accountSid, authToken);
};

const normalizeWhatsappNumber = (phoneNumber) => {
  const trimmed = String(phoneNumber || "").trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("whatsapp:")) {
    return trimmed;
  }
  return `whatsapp:${trimmed}`;
};

const formatExpiryDate = (date) =>
  date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const buildBodyMessage = (name, expiryDateText) =>
  `Hello ${name}, your card will expire tomorrow (${expiryDateText}). Please renew it to avoid interruption.`;

const sendExpiryWhatsApp = async (managedUser, expiryDate) => {
  if (!isWhatsappConfigured()) {
    return { skipped: true, reason: "twilio_not_configured" };
  }

  const to = normalizeWhatsappNumber(managedUser.phoneNumber);
  if (!to) {
    return { skipped: true, reason: "missing_phone" };
  }

  const { whatsappFrom, contentSid } = getTwilioConfig();
  const client = getTwilioClient();
  if (!client) {
    return { skipped: true, reason: "missing_client" };
  }

  const expiryDateText = formatExpiryDate(expiryDate);
  const name = managedUser.name || "there";

  const messagePayload = {
    from: whatsappFrom,
    to,
  };

  if (contentSid) {
    messagePayload.contentSid = contentSid;
    messagePayload.contentVariables = JSON.stringify({
      1: name,
      2: expiryDateText,
    });
  } else {
    messagePayload.body = buildBodyMessage(name, expiryDateText);
  }

  const message = await client.messages.create(messagePayload);
  return { skipped: false, sid: message.sid };
};

module.exports = {
  isWhatsappConfigured,
  sendExpiryWhatsApp,
};
