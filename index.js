const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("Crown Art Server is Running");
});

app.listen(port, () => {
  console.log(`Crown Art Server is Running on port: ${port}`);
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.llwcx8n.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // <---crownArtDB collections--->

    const usersCollection = client.db("crownArtDB").collection("users");
    const classesCollection = client.db("crownArtDB").collection("classes");
    const bookingsCollection = client.db("crownArtDB").collection("bookings");
    const paymentsCollection = client.db("crownArtDB").collection("payments");

    // <---json web token apis--->

    app.post("/jwt", (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;

      const query = { email: email };

      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      next();
    };

    // <---users collections apis--->

    app.get("/users/instructors", async (req, res) => {
      const filter = { role: "instructor" };

      const result = await usersCollection.find(filter).toArray();
      res.send(result);
    });

    app.get("/popularInstructors", async (req, res) => {
      const result = await usersCollection
        .find({ role: "instructor" })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };

      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };

      const user = await usersCollection.findOne(query);

      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };

      const user = await usersCollection.findOne(query);

      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };

      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        res.send({ message: "user already exists" });
      } else {
        const result = await usersCollection.insertOne(user);
        res.send(result);
      }
    });

    app.patch("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };

      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch(
      "/users/instructor/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const query = { _id: new ObjectId(req.params.id) };

        const updateDoc = {
          $set: {
            role: "instructor",
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    app.put("/instructor/:email", verifyJWT, async (req, res) => {
      const userData = req.body;

      const query = { email: req.params.email };

      const user = await usersCollection.findOne(query);

      const updatedDoc = {
        $set: {
          name: userData?.name,
          image: userData?.image,
          bio: userData?.bio,
          qualification: userData?.qualification,
          experience: userData?.experience,
          teachingArea: userData?.teachingArea,
        },
      };

      if (user?.role === "instructor") {
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    });

    // <---classes collections apis--->

    app.get("/classes/admin", verifyJWT, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const result = await classesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });

    app.get("/popularClasses", async (req, res) => {
      const result = await classesCollection
        .find({ status: "approved" })
        .limit(6)
        .sort({ enrolled: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await classesCollection.findOne(query);
      res.send(result);
    });

    app.get("/classes/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const query = { email: email };

      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/classes", verifyJWT, async (req, res) => {
      const result = await classesCollection.insertOne(req.body);
      res.send(result);
    });

    app.put("/classes/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const info = req.body;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          name: info.name,
          seats: info.seats,
          price: info.price,
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put("/classes/admin/feedback/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const info = req.body;

      const query = { _id: new ObjectId(id) };

      const options = { upsert: true };

      const updateDoc = {
        $set: {
          feedback: info.feedback,
        },
      };

      const result = await classesCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.patch("/classes/admin/approve/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "approved",
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/admin/deny/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "denied",
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // <---bookings collection apis--->

    app.get("/classBookings", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };

      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/classBookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    app.post("/classBookings", async (req, res) => {
      const classItem = req.body;

      const existingBooking = await bookingsCollection.findOne({
        $and: [
          { bookedItemId: classItem?.bookedItemId },
          { email: classItem?.email },
        ],
      });

      if (existingBooking) {
        res.send({ message: "Already added once!" });
      } else {
        const result = await bookingsCollection.insertOne(classItem);
        res.send(result);
      }
    });

    app.delete("/classBookings/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    // <---create payment intent--->

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;

      if (price) {
        const amount = parseFloat(price) * 100;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    // <---payments collection apis--->

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;

      const insertResult = await paymentsCollection.insertOne(payment);

      const classId = { _id: new ObjectId(payment.bookingItemId) };
      const seatsToDecrease = 1;

      const classData = await classesCollection.findOne(classId);
      const currentEnrollment = classData.enrolled;
      const newEnrollment = currentEnrollment + 1;

      const updateClassSeats = await classesCollection.updateOne(classId, {
        $inc: { seats: -seatsToDecrease, enrolled: newEnrollment },
      });

      const query = { _id: new ObjectId(payment.bookedItemId) };

      const deleteResult = await bookingsCollection.deleteMany(query);

      res.send({ insertResult, updateClassSeats, deleteResult });
    });

    app.get("/enrolledClasses/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await paymentsCollection
        .aggregate([
          {
            $match: {
              email: email,
            },
          },
          { $sort: { date: -1 } },
        ])
        .toArray();
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
