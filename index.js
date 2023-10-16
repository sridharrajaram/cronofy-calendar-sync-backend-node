const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
require('dotenv').config();

const PORT = process.env.PORT || 5001;

const app = express();

const JwtSecretKey = process.env.JWT_SECRET_KEY

app.use(cors({
  origin: ['http://localhost:3000'],
  methods: ["POST", "GET"],
  credentials: true
}));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// DB Connection
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Middleware - to verify the user authentication
const verifyUser = (req, res, next) => {
  const authCookie = req.cookies.authCookie
  if (!authCookie) {
    return res.json({ Error: "You are not authenticated" })
  } else {
    jwt.verify(authCookie, JwtSecretKey, (err, decoded) => {
      if (err) {
        return res.json({ Error: "Invalid Token" })
      }
      else if (decoded.name) {
        req.name = decoded.name;
        next()
      }
    })
  }
}

//user authentication verification module
app.get('/', verifyUser, (req, res) => {
  return res.json({ status: "Success", name: req.name });
})


//user register module
app.post("/register", (req, res) => {
  var sql = "INSERT INTO users (`name`, `email`, `password`) VALUES (?)";
  bcrypt.genSalt(10, function (err, salt) {
    bcrypt.hash(req.body.password.toString(), salt, function (err, hash) {
      if (err) {
        console.error(err); // Log the error
        return res.json("Error hashing password");
      }
      // Make an array of values:
      var values = [req.body.name, req.body.email, hash];
      // Execute the SQL statement, with the value array:
      db.query(sql, [values], function (err, data) {
        if (err) {
          console.error(err); // Log the error
          return res.json("Error DB");
        }
        return res.json({ status: "success" });
      });
    });
  });
});

//user login module
app.post("/login", (req, res) => {
  var sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [req.body.email], (err, data) => {
    if (err) {
      console.error(err)
      return res.json({ Error: "Error in DB connection" })
    }
    if (data.length > 0) {
      bcrypt.compare(req.body.password.toString(), data[0].password, (err, resp) => {
        if (err) {
          console.err(err)
          return res.json({ Error: "Password not matching" })
        }
        if (resp) {
          const name = data[0].name;
          const token = jwt.sign({ name }, JwtSecretKey, { expiresIn: '1d' });
          res.cookie('authCookie', token);
          return res.json({ status: "Success" });
        }
        else {
          return res.json({ status: "Error" });
        }
      })
    } else {
      return res.json({ Error: "Email not matching" })
    }
  })
});

//user logout module
app.get('/logout', (req, res) => {
  res.clearCookie('authCookie');
  return res.json({ status: "Success" });
})


app.listen(PORT, () => {
  console.log(`Server started running on port ${PORT}`);
  db.connect((err) => {
    if (err) throw err;
    console.log("Database Connected!");
  });
});
