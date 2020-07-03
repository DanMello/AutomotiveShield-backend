const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const ObjectIdValid = mongodb.ObjectID.isValid;
const url = `mongodb://${process.env.CREDENTIALS}@localhost:27017/${process.env.DATABASE}`
const connection = MongoClient.connect(url, { useUnifiedTopology: true, useNewUrlParser: true });

module.exports = {
  connection,
  ObjectId,
  ObjectIdValid
};