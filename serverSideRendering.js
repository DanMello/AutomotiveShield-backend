const path = require('path');
const fs = require('fs');
const filePath = path.resolve('/home/deploy/mellocloud/automotiveshield/index.html');

exports.init = function (_, res) {
  fs.readFile(filePath, 'utf8', function (err,data) {
    if (err) {
      return console.log(err);
    };
    res.send(data);
  });
};