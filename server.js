const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")("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");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");

const serviceAccount = require("./mountaineer-deals-firebase-adminsdk-fbsvc-7ecf26f6a5.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Allow CORS from your frontend
app.use(cors({ origin: "https://mountaineer-deals.web.app" }));

// Use raw body for webhooks, JSON elsewhere
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    bodyParser.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// Create Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const { priceId } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://mountaineer-deals.web.app/secure_qr_verified_autocreate.html",
      cancel_url: "https://mountaineer-deals.web.app/subscribe.html",
    });
    res.json({ id: session.id });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Webhook endpoint
app.post("/webhook", (req, res) => {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], endpointSecret);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details.email;
    // Activate user in Firestore
    db.collection("users").doc(email).set({ active: true, subscriptionType: "paid" }, { merge: true });
    console.log(`Activated subscription for ${email}`);
  }

  res.status(200).send("Received");
});

app.listen(4242, () => console.log("🚀 Server listening on port 4242"));
