const nodemailer = require("nodemailer");
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

module.exports = {
  transporter
};