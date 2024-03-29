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
    const coursesCollection = client.db("crownArtDB").collection("courses");
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

    app.get("/users", async (req, res) => {
      const result = await usersCollection
        .aggregate([{ $sort: { role: 1 } }])
        .toArray();
      res.send(result);
    });

    app.get("/users/instructors", async (req, res) => {
      const filter = { role: "instructor" };

      const result = await usersCollection.find(filter).toArray();
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

    app.get("/users/:id", async (req, res) => {
      const result = await usersCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const updatedUser = { ...user, role: "student" };

      const query = { email: user.email };

      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        res.send({ message: "user already exists" });
      } else {
        const result = await usersCollection.insertOne(updatedUser);
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

    app.patch(
      "/users/student/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const query = { _id: new ObjectId(req.params.id) };

        const updateDoc = {
          $set: {
            role: "student",
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

    // <---courses collections apis--->

    app.get("/courses/admin", verifyJWT, async (req, res) => {
      const result = await coursesCollection
        .aggregate([{ $sort: { status: -1 } }])
        .toArray();
      res.send(result);
    });

    app.get("/courses", async (req, res) => {
      const result = await coursesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });

    app.get("/popularCourses", async (req, res) => {
      const result = await coursesCollection
        .find({ status: "approved" })
        .limit(6)
        .sort({ enrolled: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/courses/:id", async (req, res) => {
      const id = req.params.id;

      const result = await coursesCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/courses/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const query = { email: email };

      const result = await coursesCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/courses", verifyJWT, async (req, res) => {
      const result = await coursesCollection.insertOne(req.body);
      res.send(result);
    });

    app.put("/courses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const info = req.body;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          name: info.name,
          image: info.image,
          description: info.description,
          seats: info.seats,
          price: info.price,
          status: info.status,
        },
      };

      const result = await coursesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put("/courses/admin/feedback/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const info = req.body;

      const query = { _id: new ObjectId(id) };

      const options = { upsert: true };

      const updateDoc = {
        $set: {
          feedback: info.feedback,
        },
      };

      const result = await coursesCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.patch("/courses/admin/approve/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "approved",
        },
      };

      const result = await coursesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/courses/admin/deny/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "denied",
        },
      };

      const result = await coursesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/courses/:id", verifyJWT, async (req, res) => {
      const result = await coursesCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // <---bookings collection apis--->

    app.get("/courseBookings", verifyJWT, async (req, res) => {
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

    app.get("/courseBookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    app.post("/courseBookings", async (req, res) => {
      const courseItem = req.body;

      const existingBooking = await bookingsCollection.findOne({
        $and: [
          { bookedItemId: courseItem?.bookedItemId },
          { email: courseItem?.email },
        ],
      });

      if (existingBooking) {
        res.send({ message: "Already added once!" });
      } else {
        const result = await bookingsCollection.insertOne(courseItem);
        res.send(result);
      }
    });

    app.delete("/courseBookings/:id", async (req, res) => {
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

      const courseId = { _id: new ObjectId(payment.bookingItemId) };
      const seatsToDecrease = 1;

      const courseData = await coursesCollection.findOne(courseId);
      const currentEnrollment = courseData.enrolled;
      const newEnrollment = currentEnrollment + 1;

      const updateCourseSeats = await coursesCollection.updateOne(courseId, {
        $inc: { seats: -seatsToDecrease, enrolled: newEnrollment },
      });

      const query = { _id: new ObjectId(payment.bookedItemId) };

      const deleteResult = await bookingsCollection.deleteMany(query);

      res.send({ insertResult, updateCourseSeats, deleteResult });
    });

    app.get("/enrolledCourses/:email", verifyJWT, async (req, res) => {
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
