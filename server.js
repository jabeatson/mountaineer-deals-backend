const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")("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");
const admin = require("firebase-admin");

const serviceAccount = require("./mountaineer-deals-firebase-adminsdk-fbsvc-7ecf26f6a5.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use(cors({
  origin: "https://mountaineer-deals.web.app"
}));
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: "https://mountaineer-deals.web.app/secure_qr_verified_autocreate.html",
      cancel_url: "https://mountaineer-deals.web.app/subscribe.html"
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error("Stripe session creation failed:", err);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});

app.post("/webhook", express.raw({ type: "application/json" }), (request, response) => {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerEmail = session.customer_details.email;

    const userRef = db.collection("users").doc(customerEmail);

    userRef.set({
      active: true,
      subscriptionType: "paid"
    }, { merge: true });

    console.log(`User ${customerEmail} subscription activated.`);
  }

  response.status(200).send("Received");
});

app.listen(4242, () => console.log("Server running on port 4242"));
