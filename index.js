const express = require("express");
const cors = require("cors");
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
const stripe = require('stripe')('sk_test_51MUAyfH6sQUTsOebPErzlhKZ6fx6fDXc84SjbTQ1wntv2zewVsEp4C5FYljM3fJyM8C88op8h3BFvCHfKXyReURI00LLEzsnsF');

const { MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
const serverName = "Medicare site by Ahmed";

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

//nodemailer

function sendBookingEmail(booking){
  const {patient, patientName, treatment, date, slot} = booking;
  let transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
        user: process.env.USER_NAME,
        pass: process.env.SENDGRID_API_KEY
    }
 })

 transporter.sendMail({
  from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
    text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
    html: `
      <div>
        <p> Hello ${patientName}, </p>
        <h3>Your Appointment for ${treatment} is confirmed</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>
      </div>
    ` // html body
}, function(error, info){
  if (error) {
    console.log(error);
  } else {
    console.log('Email sent: ' + info.response);
  }
});

}

function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'UnAuthorized access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded){
    if(err){
      return res.status(403).send({message: 'Forbidden access'});
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
    try {
      await client.connect();
      const serviceCollection = client.db('doctors_portal').collection('services');
      const bookingCollection = client.db('doctors_portal').collection('booking');
      const userCollection = client.db('doctors_portal').collection('users');
      const doctorCollection = client.db('doctors_portal').collection('doctors');
      const paymentCollection = client.db('doctors_portal').collection('payments');


      const verifyAdmin = async (req, res, next) => {
        const requester = req.decoded.email;
        const requesterAccount = await userCollection.findOne({ email: requester });
        if (requesterAccount.role === 'admin') {
          next();
        }
        else {
          res.status(403).send({ message: 'forbidden' });
        }
      }

      app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
        const service = req.body;
        const price = service.price;
        const amount = price*100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount : amount,
          currency: 'usd',
          payment_method_types:['card']
        });
        res.send({clientSecret: paymentIntent.client_secret})
      });

        app.get('/service', async(req,res) =>{
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/user', verifyJWT, async(req,res) =>{
          const users = await userCollection.find().toArray();
          res.send(users);
        })

        app.get('/admin/:email', async (req, res) => {
          const email = req.params.email;
          const user = await userCollection.findOne({ email: email });
          const isAdmin = user.role === 'admin';
          res.send({ admin: isAdmin })
        })
        
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
          const email = req.params.email;
          const filter = { email: email };
          const updateDoc = {
            $set: { role: 'admin' },
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.send(result);
        })

        app.put('/user/:email', async(req,res) =>{
          const email = req.params.email;
          const user = req.body;
          const filter = {email: email};
          const options = { upsert: true };
          const updateDoc = {
            $set: user,
          };
          const result = await userCollection.updateOne(filter, updateDoc, options);
          const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
          res.send({result, token});
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
        app.get('/booking', verifyJWT, async(req,res) =>{
          const patient = req.query.patient;
          const decodedEmail = req.decoded.email;
          if(patient === decodedEmail){
            const query = { patient: patient };
            const bookings = await bookingCollection.find(query).toArray();
            return res.send(bookings);
          }
          else{
            return res.status(403).send({message: 'Forbidden access'});
          }
        })

        app.get('/booking/:id', verifyJWT, async(req, res) =>{
          const id = req.params.id;
          const query = {_id: ObjectId(id)};
          const booking = await bookingCollection.findOne(query);
          res.send(booking);
        })

        app.post('/booking', async(req,res) =>{
          const booking = req.body;
          const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient};
          const exists = await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          }
          const result = await bookingCollection.insertOne(booking);
          //send email about appointment confirmation
          console.log('sending email');
          sendBookingEmail(booking);
          return res.send({success: true, result});
        })

        app.patch('/booking/:id', verifyJWT, async(req, res) =>{
          const id  = req.params.id;
          const payment = req.body;
          const filter = {_id: ObjectId(id)};
          const updatedDoc = {
            $set: {
              paid: true,
              transactionId: payment.transactionId
            }
          }
    
          const result = await paymentCollection.insertOne(payment);
          const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
          res.send(updatedBooking);
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
          const doctors = await doctorCollection.find().toArray();
          res.send(doctors);
        })
    
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
          const doctor = req.body;
          const result = await doctorCollection.insertOne(doctor);
          res.send(result);
        });
    
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
          const email = req.params.email;
          const filter = { email: email };
          const result = await doctorCollection.deleteOne(filter);
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