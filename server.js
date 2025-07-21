// server.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const serviceAccount = require("./mountaineer-deals-firebase-adminsdk-fbsvc-7ecf26f6a5.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Create Express app
const app = express();

// Enable CORS for your frontend
app.use(
  cors({
    origin: "https://mountaineer-deals.web.app",
  })
);

// Use raw body parser for Stripe webhooks, JSON for other routes
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    bodyParser.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// Endpoint to create a Stripe Checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:
        "https://mountaineer-deals.web.app/secure_qr_verified_autocreate.html",
      cancel_url: "https://mountaineer-deals.web.app/subscribe.html",
    });
    res.json({ id: session.id });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Stripe webhook endpoint
app.post("/webhook", (req, res) => {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details.email;

    if (email) {
      const userRef = db.collection("users").doc(email);
      userRef.set(
        {
          active: true,
          subscriptionType: "paid",
        },
        { merge: true }
      );
      console.log(`Activated subscription for ${email}`);
    }
  }

  res.status(200).send("Received");
});

// Start the server
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
