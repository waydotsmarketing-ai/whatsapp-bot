const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "farjan_secure_verify_token_123";

// Meta Developer Console-ൽ നിന്നുള്ള പെർമനന്റ് അക്സസ് ടോക്കൺ
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "YOUR_META_ACCESS_TOKEN";

// ഒന്നിലധികം കടകളുടെ വിവരങ്ങൾ
const SHOPS = {
  // ആദ്യത്തെ കടയുടെ Phone Number ID
  "DEFAULT": {
    name: "Farjan Cafeteria",
    menuUrl: "https://cafeteria-os--test-menu-tpxicdsx.web.app?shop=farjan",
    branches: [
      { name: "AZIZIYA", lat: 25.2530, lng: 51.4640 },
      { name: "BANI HAJER", lat: 25.3210, lng: 51.3850 },
      { name: "UMM AL AMAD", lat: 25.4520, lng: 51.3980 }
    ]
  }
};

// 1. Meta Webhook Verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully!");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. Incoming WhatsApp Message Handler (POST)
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
      const entryVal = body.entry[0].changes[0].value;
      const messageObj = entryVal.messages[0];
      const from = messageObj.from;
      const phoneId = entryVal.metadata ? entryVal.metadata.phone_number_id : null;
      const shopConfig = SHOPS[phoneId] || SHOPS["DEFAULT"];

      // A. കസ്റ്റമർ "Hi" അയക്കുമ്പോൾ: Language Selection List നൽകുന്നു
      if (messageObj.type === "text") {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phoneId}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            type: "interactive",
            interactive: {
              type: "list",
              header: { type: "text", text: shopConfig.name },
              body: { text: `Welcome to ${shopConfig.name}! 🍔\n\nChoose your preferred language to continue:` },
              action: {
                button: "Choose Language",
                sections: [
                  {
                    title: "Languages / اللغات",
                    rows: [
                      { id: "lang_en", title: "English 🇬🇧", description: "Continue in English" },
                      { id: "lang_ar", title: "العربية 🇶🇦", description: "المتابعة باللغة العربية" }
                    ]
                  }
                ]
              }
            }
          },
          { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
        );
      }

      // B. ഭാഷ തിരഞ്ഞെടുത്താൽ: ഔദ്യോഗിക "Send location" ബട്ടൺ നൽകുന്നു
      if (messageObj.type === "interactive" && messageObj.interactive.type === "list_reply") {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phoneId}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            type: "interactive",
            interactive: {
              type: "location_request_message",
              body: { text: "Share your location so we can find your nearest branch." },
              action: { name: "send_location" }
            }
          },
          { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
        );
      }

      // C. കസ്റ്റമർ ലൊക്കേഷൻ അയച്ചാൽ: Nearest Branch കാൽക്കുലേറ്റ് ചെയ്ത് ഓർഡർ ലിങ്ക് നൽകുന്നു
      if (messageObj.type === "location") {
        const userLat = messageObj.location.latitude;
        const userLng = messageObj.location.longitude;

        let nearestBranch = shopConfig.branches[0];
        let minDistance = 999999;

        shopConfig.branches.forEach((b) => {
          const dist = Math.hypot(b.lat - userLat, b.lng - userLng);
          if (dist < minDistance) {
            minDistance = dist;
            nearestBranch = b;
          }
        });

        await axios.post(
          `https://graph.facebook.com/v19.0/${phoneId}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: {
              body: `Yeheeeii....! 🎉🔥\nYour nearest branch is *${nearestBranch.name}*.\n\nBrowse our menu and order directly here:\n👉 ${shopConfig.menuUrl}`
            }
          },
          { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
        );
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err.response?.data || err.message);
    return res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("Farjan Cafeteria WhatsApp Webhook is Running Live!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});