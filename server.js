
const express = require("express");
const admin = require("firebase-admin");
const Stripe = require("stripe");
const bodyParser = require("body-parser");

// Initialize Firebase
const serviceAccount = require("./mountaineer-deals-firebase-adminsdk-fbsvc-7ecf26f6a5.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Initialize Stripe
const stripe = Stripe("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");

// Setup Express
const app = express();
app.use(bodyParser.json());

// Create Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const priceId = req.body.priceId;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: 'https://mountaineer-deals.web.app/secure_qr.html',
      cancel_url: 'https://mountaineer-deals.web.app/cancel.html',
    });
    res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe Webhook Handler
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (request, response) => {
  const sig = request.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      sig,
      "whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET"
    );
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerEmail = session.customer_email;

    if (customerEmail) {
      const usersRef = db.collection("users");
      usersRef.where("email", "==", customerEmail).get().then(snapshot => {
        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            doc.ref.update({
              active: true,
              subscriptionType: "paid"
            });
          });
        }
      }).catch(error => {
        console.error("Firestore update error:", error);
      });
    }
  }

  response.status(200).end();
});

// Start server
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
