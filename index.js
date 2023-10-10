const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const PORT = 5001;

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const db = mysql.createConnection({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "Mysql@123$",
  database: "calsync",
});

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

app.post("/login", (req, res) => {
  var sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql,[req.body.email], (err,data)=>{
    if(err){
      console.error(err)
      return res.json({Error: "Error in DB connection"})
    }
    if(data.length>0){
      bcrypt.compare(req.body.password.toString(), data[0].password, (err, resp)=> {
        if(err){
          console.err(err)
          return res.json({Error:"Password not matching"})
        }
        if (resp){
          return res.json({status:"Success"});
        }
        else {
          return res.json({status:"Error"});
        }
      })
    } else {
      return res.json({Error: "Email not matching"})
    }
  })
});

app.listen(PORT, () => {
  console.log(`Server started running on port ${PORT}`);
});
