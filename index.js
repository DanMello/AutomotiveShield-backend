require('dotenv').config()

const express = require("express");
const nodemailer = require("nodemailer");
const {connection} = require('./mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const tokenSecret = process.env.TOKEN_SECRET;
const app = express();

const settings = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
};
const transporter = nodemailer.createTransport(settings);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

app.use(express.json());

app.post('/api/contact', (req, res) => {
  const {firstName, lastName, email, message} = req.body;
  const emailMessage = `
    <h1>You have received a message from ${firstName} ${lastName}.</h1>
    <h2>Email: ${email}</h2>
    <h2>Message:</h2>
    <div style='font-size: 25px;'>${message}</div>
  `;
  const emailSettings = {
    from: '"Automotive Shield" <jdanmello@gmail.com>',
    to: 'jdanmello@gmail.com',
    subject: 'Message from Automotive shield website',
    html: emailMessage
  };
  const emailPromise = new Promise((resolve, reject) => {
    transporter.sendMail(emailSettings, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      };
    });
  });
  emailPromise.then(() => {
    res.json({message: "We have received your message and we will get back to you shortly."});
  }).catch(err => {
    res.json({error: true, message: err.message})
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  connection.then(client => {
    client
    .db("automotiveshield")
    .collection("users")
    .findOne({"email": email}, (err, result) => {
      if (err) {
        res.json({error: true, message: 'Something went wrong trying to log you in please try again.'})
      };
      if (result === null) {
        res.json({
          error: true, 
          message: 'Your email and password combination is invalid.'
        });
      };
      bcrypt.compare(password, result.password, function(err, result) {
        if (err) {
          res.json({
            error: true, 
            message: 'Something went wrong trying to log you in please try again.'
          });
        };
        if (result === true) {
          const token = jwt.sign({ email: email }, tokenSecret);
          client
          .db("automotiveshield")
          .collection("tokens")
          .insertOne({
            token: token,
            activeAt: new Date()
          }, (err, _) => {
            if (err) {
              res.json({
                error: true, 
                message: 'Something went wrong trying to log you in please try again.'
              });
            };
            res.json({
              message: 'You have logged in successfully you will now be redirected.',
              token: token
            });
          });
        } else {
          res.json({error: true, message: 'Your email and password combination is invalid.'})
        };
      });
    });
  }).catch(err => {
    res.json({error: true, message: err.message})
  });
});

app.post('/api/logout', (req, res) => {
  const { token } = req.body;
  connection.then(client => {
    client
    .db("automotiveshield")
    .collection("tokens")
    .deleteOne({
      token: token
    }, (err, result) => {
      if (err || result === null) {
        res.json({
          error: true, 
          message: 'Something went wrong removing your login token from database but dont worry it will automatically be deleted in 24 hours.'
        });
        return;
      };
      res.json({
        message: 'Logged out successfully.'
      });
    });
  }).catch(err => {
    res.json({
      error: true, 
      message: err.message
    });
  });
})

app.post('/api/checkToken', (req, res) => {
  const { token } = req.body;

  function sendError() {
    res.json({
      error: true, 
      message: 'Something went wrong validating your login, your login token has probably expired or you are logged out. Please log back in.'
    });
  };

  if (token === null) {
    sendError();
    return;
  };

  jwt.verify(token, tokenSecret, function(err, decoded) {
    if (err) {
      sendError();
      return;
    };
    connection.then(client => {
      client
      .db("automotiveshield")
      .collection("tokens")
      .findOne({
        token: token
      }, (err, result) => {
        if (err || result === null) {
          sendError();
          return;
        };
        client
        .db("automotiveshield")
        .collection("tokens")
        .updateOne({token: token}, {$set: {"activeAt": new Date()}}, (err, result) => {
          if (err || result === null) {
            sendError();
            return;
          };
          res.json({
            message: "You are verified."
          });
        });
      });
    }).catch(err => {
      res.json({
        error: true, 
        message: err.message
      });
    });
  });
});

app.get('/api/cars', (req, res) => {

  if (req.query.limit !== undefined) {
    const limit = parseInt(req.query.limit)
    connection.then(client => {
      client
      .db("automotiveshield")
      .collection("cars")
      .find({})
      .limit(limit)
      .toArray((err, array) => {
        // const cars = array.sort(function (a, b) {
        //   if (a.date > b.date) return -1;
        //   if (a.date < b.date) return 1;
        //   return 0;
        // })
        res.json({cars: array});
      })
    });
  }
  // res.json({error: true, message: err.message})
});

require('./routes')(app);

app.listen(3005);