require('dotenv').config()

const env = process.env.NODE_ENV === "production" ? "production" : "development";
const tmpFolder = env === "production" ? '../assets/tmp/' : './public/tmp/';
const express = require("express");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connection, ObjectId, ObjectIdValid } = require('./mongodb');
const multer = require('multer');
const ffmpeg = require('./ffmpeg');
const storage = require('./multer')(multer, tmpFolder);
const {transporter} = require('./nodemailer');
const Jimp = require('jimp');
const uuid = require('uuid');
const tokenSecret = process.env.TOKEN_SECRET;
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

app.use(express.json());

app.use(express.urlencoded({extended: true})); 

if (env === 'development') {
  app.use(express.static('public'));
};

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
        return;
      };
      if (result === null) {
        res.json({
          error: true, 
          message: 'Your email and password combination is invalid.'
        });
        return;
      };
      bcrypt.compare(password, result.password, function(err, result) {
        if (err) {
          res.json({
            error: true, 
            message: 'Something went wrong trying to log you in please try again.'
          });
          return;
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
              return;
            };
            res.json({
              message: 'You have logged in successfully you will now be redirected.',
              token: token
            });
          });
        } else {
          res.json({error: true, message: 'Your email and password combination is invalid.'})
          return;
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
});

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

app.post('/api/getUser', (req, res) => {

  const {token} = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('token decoded')
        resolve(decoded.email);
      });
    });
  };

  function findUser(decodedEmail) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("users")
        .findOne({"email": decodedEmail}, (err, result) => {
          if (err) reject(err);
          console.log('user found')
          resolve(result);
        })
      });
    })
  };

  
  async function runAsync() {
    const decodedEmail = await verifiedToken();
    const {password, ...rest} = await findUser(decodedEmail);

    res.json({
      user: {...rest}
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/updateemail', (req, res) => {

  const {token, email, password} = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('token decoded')
        resolve(decoded.email);
      });
    });
  };

  function findUserAndGetPassword(decodedEmail) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("users")
        .findOne({"email": decodedEmail}, (err, result) => {
          if (err) reject(err);
          console.log('user found')
          resolve(result.password);
        })
      });
    })
  };

  function verifyPassword(storedPassword) {
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, storedPassword, function(err, result) {
        if (err) reject(err)
        if (result === true) {
          console.log('password verified')
          resolve();
        } else {
          reject(new Error('The password you entered does not match our records.'))
        };
      });
    });
  };

  function updateEmail(decodedEmail) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("users")
        .updateOne({email: decodedEmail}, {$set: {"email": email}}, (err, result) => {
          if (err || result === null) reject(new Error('Something when wrong updating your email please try again.'));
          resolve();
        });
      });
    });
  };

  function deleteCurrentToken() {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("tokens")
        .deleteOne({token: token}, (err, result) => {
          if (err || result === null) reject(new Error('Something went wrong removing your login token from database but dont worry it will automatically be deleted in 24 hours.'));
          resolve();
        });
      });
    });
  };

  function createNewToken () {
    const newToken = jwt.sign({ email: email }, tokenSecret);
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("tokens")
        .insertOne({
          token: newToken,
          activeAt: new Date()
        }, (err, result) => {
          if (err) reject(new Error('Something went wrong updating your log in token. Please try logging in with your new email.'));
          resolve(newToken);
        });
      });
    });
  };

  async function runAsync() {
    const decodedEmail = await verifiedToken();
    const storedPassword = await findUserAndGetPassword(decodedEmail);
    const passwordVerified = await verifyPassword(storedPassword);
    const emailUpdated = await updateEmail(decodedEmail);
    const tokenDeleted = await deleteCurrentToken();
    const newToken = await createNewToken();

    res.json({
      token: newToken,
      email: email,
      message: 'Email updated successfully'
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/updateservice', (req, res) => {
  
  const { token, service, newService } = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('token decoded')
        resolve(decoded.email);
      });
    });
  };

  function updateService(email) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("users")
        .updateOne({
          "email": email,
          "services": service
          }, 
          { $set: { "services.$": newService } }, (err, result) => {
          if (err || result === null) reject(new Error('Something when wrong updating your service please try again.'));
          resolve(newService);
        });
      });
    });
  };

  async function runAsync() {
    const email = await verifiedToken();
    const newService = await updateService(email);

    res.json({
      newService,
      message: 'Service updated successfully.'
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/addnewservice', (req, res) => {
  
  const { token, newService } = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('token decoded')
        resolve(decoded.email);
      });
    });
  };

  function addNewService(email) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("users")
        .updateOne({
          "email": email,
          }, 
          { $push: { "services": newService } }, (err, result) => {
          if (err || result === null) reject(new Error('Something when wrong adding your new service please try again.'));
          resolve();
        });
      });
    });
  };

  async function runAsync() {
    const email = await verifiedToken();
    await addNewService(email);

    res.json({
      message: 'New service added successfully.'
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/deleteservice', (req, res) => {
  
  const { token, service } = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('token decoded')
        resolve(decoded.email);
      });
    });
  };

  function removeService(email) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("users")
        .updateOne({
          "email": email,
          }, 
          { $pull: { "services": service } }, (err, result) => {
          if (err || result === null) reject(new Error('Something when wrong adding your new service please try again.'));
          resolve();
        });
      });
    });
  };

  async function runAsync() {
    const email = await verifiedToken();
    await removeService(email);

    res.json({
      message: 'Service: ' + service + ' removed successfully.'
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/uploadwork', (req, res) => {
  const upload = storage.array('file', 12);
  upload(req, res, function (err) {
    if ((err instanceof multer.MulterError) || err) {
      res.json({
        error:true,
        message: err.message
      })
      return;
    };

    function createScreenShot(video) {
      return new Promise((resolve, reject) => {
        const filename = uuid.v4();
        const thumbnailName = `thumbnail-${filename}.png`;
        ffmpeg(tmpFolder + video)
        .on('end', function() {
          resolve(thumbnailName)
        })
        .on('error', function(err) {
          reject(err);
        })
        .screenshots({
          timestamps: [1],
          filename: thumbnailName,
          folder: tmpFolder
        });
      })
    };

    function minifyImage(image) {
      return new Promise((resolve, reject) => {
        const filePath = tmpFolder + image;
        Jimp.read(filePath).then(picture => {
          return picture
            .quality(50)
            .write(filePath)
        }).then(() => {
          resolve();
        }).catch(err => {
          reject(err);
        });
      });
    };

    function handleUploads() {

      const videoTypes = ['quicktime', 'mp4'];
      const photoTypes = ['jpg', 'jpeg', 'png'];
      return new Promise(async (resolve, reject) => {
        const files = await Promise.all(req.files.map(async (file) => {
          if ((videoTypes.indexOf(file.mimetype.split('/').pop()) > -1 )) {
            const thumbnailName = await createScreenShot(file.filename).catch(err => reject(err));
            file.thumbnailName = thumbnailName;
          } else if ((photoTypes.indexOf(file.mimetype.split('/').pop()) > -1 )) {
            await minifyImage(file.filename).catch(err => reject(err));
          }
          return file;
        }));
        resolve(files);
      });
    };

    async function runAsync() {
      const files = await handleUploads();
      res.json(files);
    };

    runAsync().catch(err => {
      res.status(400).json({
        error:true,
        message: err.message
      })
    });
  });
});

app.get('/api/getPost', (req, res) => {

  function getPost() {
    return new Promise((resolve, reject) => {
      const postId = req.query.postId;
      if (ObjectIdValid(postId)) {
        connection.then(client => {
          client
          .db("automotiveshield")
          .collection("cars")
          .findOne({"_id": new ObjectId(postId)}, (err, result) => {
            if (err) {
              console.log(err);
            };
            if (result === null) {
              reject(new Error('We could not find any posts with that id. The post has probably been deleted'))
            };
            resolve(result);
          });
        }).catch(err => {
          reject(err);
        });
      } else {
        reject(new Error('Invalid Post Id, please return to your posts and try again.'));
      }
    });
  };

  async function runAsync() {
    const post = await getPost();
    res.json({
      post
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/createpost', (req, res) => {
  
  const { token, uploads, service, car, description, thumbnailIndex, postId } = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('email', decoded.email);
        resolve(decoded.email);
      });
    });
  };

  function updateTokenActiveTime(token) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("tokens")
        .updateOne({token: token}, {$set: {"activeAt": new Date()}}, (err, result) => {
          if (err || result === null) {
            reject(err || new Error('Token not found.'));
          };
          console.log('Token Active Time Updated')
          resolve('Token Active Time Updated');
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  function checkDataBaseForToken(token) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("tokens")
        .findOne({
          token: token
        }, (err, result) => {
          if (err || result === null) {
            reject(err || new Error('Token not found.'))
          };
          console.log('Token Found')
          resolve('Token Found');
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  function moveFiles() {
    const fs = require('fs');
    const path = require('path');
    let today = new Date();
    let date = today.getDate().toString();
    let month = (today.getMonth() + 1).toString();
    let year = today.getFullYear().toString();
    if (date < 10) date = '0' + date;
    if (month < 10) month = '0' + month;
    return new Promise(async (resolve, reject) => {
      const files = await Promise.all(uploads.map(async (file) => {
        if (!file.saved) {
          const oldPath = path.resolve(tmpFolder) + '/' + file.filename;
          const videoType = ['video/mp4', 'video/quicktime'];
          let extension = file.mimetype.split('/').pop();
          if (extension === 'quicktime') extension = 'MOV';
          const userPath = env === "production" ?  path.resolve('../assets/userData') : path.resolve('./public/userData');
          const customFolderStructure = `${userPath}/${year}/${month}/${date}/`;
          if (!fs.existsSync(customFolderStructure)) {
            fs.mkdirSync(customFolderStructure, { recursive: true });
          };
          const newPath = `${customFolderStructure}${file.filename}.${extension}`;
          file.publicFilePath = `/userData/${year}/${month}/${date}/${file.filename}.${extension}`;
          fs.rename(oldPath, newPath, function (err) {
            if (err) reject(err);
          });
          if (videoType.includes(file.mimetype)) {
            const oldThumbnailPath = path.resolve(tmpFolder) + '/' + file.thumbnailName;
            const newThumbnailPath = `${customFolderStructure}${file.thumbnailName}`;
            file.publicThumbnailPath = `/userData/${year}/${month}/${date}/${file.thumbnailName}`;
            fs.rename(oldThumbnailPath, newThumbnailPath, function (err) {
              if (err) reject(err);
            });
          };
          file.saved = true;
        }
        return file;
      }));
      resolve(files);
    });
  };

  function sendFilesToDatabase(files) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("cars")
        .insertOne({
          service: service,
          car: car,
          description: description,
          date: new Date(),
          thumbnailIndex: thumbnailIndex,
          uploads: files
        }, (err, result) => {
          if (err || result === null) {
            if (err) reject(new Error('Something went wrong saving your files to the database.'));
          };
          resolve('Post successfully created. You can return to the our work page to see your new post.');
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  function updateDataBase(files) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("cars")
        .update({'_id' : new ObjectId(postId)}, {
          "$set": {
            "service" : service,
            "car": car,
            "description": description,
            "date": new Date(),
            "thumbnailIndex": thumbnailIndex,
            "uploads": files 
          }
        }, (err, result) => {
          if (err || result === null) {
            if (err) reject(new Error('Something went wrong editing your post in the database.'));
          };
          resolve('Post successfully edited. You can return to the our work page to see your new post.');
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  async function runAsync() {
    const decodedEmail = await verifiedToken();
    await checkDataBaseForToken(token);
    await updateTokenActiveTime(token);
    const files = await moveFiles();
    let success;
    if (postId) {
      success = await updateDataBase(files);
    } else {
      success = await sendFilesToDatabase(files);
    };
    res.json({
      message: success
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.post('/api/deletepost', (req, res) => {
  const {token, postId} = req.body;

  function verifiedToken() {
    return new Promise((resolve, reject) => {
      jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
          reject(err);
        };
        console.log('email', decoded.email);
        resolve(decoded.email);
      });
    });
  };

  function checkDataBaseForToken(token) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("tokens")
        .findOne({
          token: token
        }, (err, result) => {
          if (err || result === null) {
            reject(err || new Error('Token not found.'))
          };
          console.log('Token Found')
          resolve('Token Found');
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  function updateTokenActiveTime(token) {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("tokens")
        .updateOne({token: token}, {$set: {"activeAt": new Date()}}, (err, result) => {
          if (err || result === null) {
            reject(err || new Error('Token not found.'));
          };
          console.log('Token Active Time Updated')
          resolve('Token Active Time Updated');
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  function deletePost() {
    return new Promise((resolve, reject) => {
      if (ObjectIdValid(postId)) {
        connection.then(client => {
          client
          .db("automotiveshield")
          .collection("cars")
          .deleteOne({"_id": new ObjectId(postId)}, (err, result) => {
            if (err || result === null) reject(new Error('Something went wrong deleting your post please try again.'));
            resolve('Successfully deleted post. You can return to our work page to see the changes.');
          });
        });
      } else {
        reject(new Error('Invalid post Id.'));
      };
    });
  };

  async function runAsync() {
    await verifiedToken();
    await checkDataBaseForToken(token);
    await updateTokenActiveTime(token);
    const response = await deletePost();

    res.json({
      message: response
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    })
  });
});

app.get('/api/cars', (req, res) => {
  const limit = parseInt(req.query.limit);
  const skip = parseInt(req.query.skip);

  function getCars() {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("cars")
        .find({})
        .sort({"date": -1})
        .limit(limit)
        .skip(skip)
        .toArray((err, array) => {
          if (err) {
            reject(err);
          };
          resolve(array);
        })
      }).catch(err => {
        reject(err);
      });
    });
  };

  function getCount() {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("cars")
        .countDocuments((err, count) => {
          if (err) {
            reject(err);
          };
          resolve(count)
        });
      }).catch(err => {
        reject(err);
      });
    });
  };

  async function runAsync() {
    const cars = await getCars();
    const count = await getCount();
    res.json({
      cars,
      count
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    });
  });
});

app.get('/api/searchwork', (req, res) => {
  const search = req.query.search;
  let date = Date.parse(search) ? new Date(search) : null;
  let nextDay = Date.parse(search) ? new Date(new Date(search).setDate(date.getDate() + 1)) : null;
  function getCars() {
    return new Promise((resolve, reject) => {
      connection.then(client => {
        client
        .db("automotiveshield")
        .collection("cars")
        .find({
          $or:[
            {"service": {$regex : `(?i)^${search}`}},
            {"car": {$regex : `^(?i)${search}`}},
            {"description": {$regex : `(?i)^${search}`}},
            {"date": {"$gte": date, "$lt": nextDay}}
          ]
        })
        .sort({"date": -1})
        .toArray((err, array) => {
          if (err) {
            reject(err);
          };
          resolve(array);
        })
      }).catch(err => {
        reject(err);
      });
    });
  };

  async function runAsync() {
    const cars = await getCars();
    res.json({
      cars,
      count: cars.length
    });
  };

  runAsync().catch(err => {
    res.json({
      error: true,
      message: err.message
    });
  });
});

require('./routes')(app);

app.listen(3005);