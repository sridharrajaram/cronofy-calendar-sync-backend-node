const express = require("express");
const bodyParser = require('body-parser');
const cors = require("cors");
const mysql = require("mysql");
const PORT = 5001;

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = mysql.createConnection({
    host: 'localhost',
    port:3306,
    user: 'root',
    password: 'Mysql@123$',
    database: 'calsync'
})

app.post('/register', (req,res) => {
        var sql = "INSERT INTO users (`name`, `email`, `password`) VALUES (?)";
        //Make an array of values:
        var values = [
          req.body.name,
          req.body.email,
          req.body.password
        ];
        //Execute the SQL statement, with the value array:
        db.query(sql, [values], function (err, data) {
          if (err){
            return res.json("Error DB");
          }
          return res.json(data);
        });
})


app.post('/login', (req,res) => {
  var sql = "SELECT * FROM users WHERE `email` = ? AND `password` = ?";
  //Execute the SQL statement, with the value array:
  db.query(sql, [req.body.email,req.body.password], function (err, data) {
    if (err){
      return res.json("Error DB");
    }
    if (data.length > 0){
      return res.json("Success")
    } else {
      return res.json("Fail")
    }
  });
})


app.listen(PORT, ()=>{
    console.log(`Server started running on port ${PORT}`)
})
