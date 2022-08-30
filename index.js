const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion} = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
const serverName = "Doctor's Portal";

// middleware
app.use(cors());
app.use(express.json());

// connecting mongodb and crud

const uri = 
    `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pegkils.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
    try {
      await client.connect();
      const serviceCollection = client.db('doctors_portal').collection('services');
      const bookingCollection = client.db('doctors_portal').collection('booking');

        app.get('/service', async(req,res) =>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        /*
        * API naming 
        - app.get('/booking') - get all booking in the collection
        - app.get('/booking/:id') - get a specific booking
        - app.post('/booking') - add a new booking
        - app.patch('/booking/:id') - 
        - app.delete('/booking/:id') - 
        */

        app.post('/booking', async(req,res) =>{
          const booking = req.body;
          const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient};
          const exist = await bookingCollection.findOne(query);
          if(exist){
            res.send({success: false, booking: exist})
          }
          const result = await bookingCollection.insertOne(booking);
          res.send(result);
        })
    } 
    finally {

    }
  }
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Doctor' Portal server");
});
  
app.listen(port, () => {
    console.log(`${serverName} server is running on port ${port}`);
});