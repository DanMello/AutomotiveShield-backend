const MongoClient = require('mongodb').MongoClient;
const url = "mongodb://dan:mello321@localhost:27017/automotiveshield"
const connection = MongoClient.connect(url, { useUnifiedTopology: true, useNewUrlParser: true });

module.exports = {
  connection
};