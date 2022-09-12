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

        app.get('/available', async(req,res) =>{
          const date = req.query.date;
          // step: 1 - get all services
          const services = await serviceCollection.find().toArray();
          // step: 2 - get the booking of that day
          const query = {date: date };
          const bookings = await bookingCollection.find(query).toArray();
          // step: 3 - for each service,  
          services.forEach(service =>{
            // step: 4 - finding the bookings for that service
            const serviceBookings = bookings.filter(booking => booking.treatment === service.name);
            // step: 5 - selecting slots for the service booking
            const bookedSlots = serviceBookings.map(booking => booking.slot);
            // step: 6 - selecting those slots that are not in bookedSlots
            const available = service.slots.filter(slot => !bookedSlots.includes(slot));
            service.slots = available;
          })
          res.send(services);
        })

        /*
        * API naming 
        - app.get('/booking') - get all booking in the collection
        - app.get('/booking/:id') - get a specific booking
        - app.post('/booking') - add a new booking
        - app.patch('/booking/:id') - 
        - app.put('/booking/:id') - // upsert ==> update or insert (if exist)
        - app.delete('/booking/:id') - 
        */
        app.get('/booking', async(req,res) =>{
          const patient = req.query.patient;
          const query = {patient: patient };
          const bookings = await bookingCollection.find(query).toArray();
          res.send(bookings);
        })

        app.post('/booking', async(req,res) =>{
          const booking = req.body;
          const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient};
          const exist = await bookingCollection.findOne(query);
          if(exist){
            return res.send({success: false, booking: exist})
          }
          const result = await bookingCollection.insertOne(booking);
          return res.send({success: true, result});
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