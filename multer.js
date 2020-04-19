exports = module.exports = function (multer, tmpFolder) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, tmpFolder);
    },
    filename: function (req, file, cb) {
      cb(null, file.fieldname + '-' + Date.now())
    }
  });
  return multer({ storage: storage });
};