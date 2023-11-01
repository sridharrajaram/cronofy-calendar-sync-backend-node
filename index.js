const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const axios = require('axios');
require('dotenv').config();

const PORT = process.env.PORT || 5001;

const app = express();

const JwtSecretKey = process.env.JWT_SECRET_KEY
const cronofyClientId = process.env.DEV_CRONOFY_CLIENT_ID
const cronofyClientSecret = process.env.DEV_CRONOFY_CLIENT_SECRET
const cronofyScope = process.env.DEV_CRONOFY_SCOPE
const cronofyRedirectUri = process.env.DEV_REDIRECT_URI
const cronofyReqTokenUrl = process.env.DEV_CRONOFY_REQUEST_TOKEN_URL

const currentTimestamp = new Date();

app.use(cors({
  origin: ['http://localhost:3000'],
  methods: ["POST", "GET", "PUT", "DELETE"],
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
          const userId = data[0].id;
          const token = jwt.sign({ name }, JwtSecretKey, { expiresIn: '1d' });
          res.cookie('name', name);
          res.cookie('userId', userId);
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
  res.clearCookie('name');
  res.clearCookie('userId');
  return res.json({ status: "Success" });
})

app.post('/redeemcode', async (req, res) => {
  const { code } = req.body;
  const userName = req.cookies.name;
  const userId = req.cookies.userId;

  // Send a POST request to Cronofy to exchange the code for tokens
  try {
    const tokenResponse = await axios.post(`${cronofyReqTokenUrl}`, {
      client_id: cronofyClientId,
      client_secret: cronofyClientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: cronofyRedirectUri,
      avoid_link: true
    });

    // console.log(tokenResponse.data);
    const { access_token, expires_in, refresh_token, sub } = tokenResponse.data;
    const { profile_id, profile_name, provider_service } = tokenResponse.data.linking_profile;

    var sql = "INSERT INTO cronofytokens (`user_id`,`name`, `accessToken`, `expiresIn`, `refreshToken`, `sub`, `profileId`, `profileName`, `providerService`, `createdAt`, `updatedAt`) VALUES (?)";

    // Make an array of values:
    var values = [userId, userName, access_token, expires_in, refresh_token, sub, profile_id, profile_name, provider_service, currentTimestamp, currentTimestamp];

    db.query(sql, [values], function (err, data) {
      if (err) {
        // console.error(err); // Log the error
        return res.json({ Error: "Error DB" });
      } else {
        return res.json({ status: "Success" });
      }
    });
  } catch (err) {
    return res.json({ Error: err });
  }

});


// API endpoint to add a to-do item for a user
app.post('/addUserEmail', (req, res) => {
  const { emailAddress } = req.body;
  const userName = req.cookies.name;
  const userId = req.cookies.userId;

  const insertQuery = 'INSERT INTO useremails (user_id, name, personal_email) VALUES (?,?,?)';
  db.query(insertQuery, [userId, userName, emailAddress], (err, result) => {
    if (err) {
      res.status(500).send('Error adding email Address item');
    } else {
      res.status(200).json({ status: "Success" });
    }
  })
});

app.get('/getUserEmail', (req, res) => {

  const userName = req.cookies.name;
  const userId = req.cookies.userId;

  const getQuery = 'SELECT personal_email FROM useremails WHERE user_id = ?'
  db.query(getQuery, [userId], (err, results) => {
    if (err) {
      res.status(500).send(`Error getting email Addresses of user ${userName}`);
    } else {
      // console.log(results);
      const emailList = results.map((row) => row.personal_email);
      res.status(200).json(emailList)
    }
  });


})

app.post('/removeUserEmail', async (req, res) => {
  const { emailAddress } = req.body;
  const userId = req.cookies.userId;

  const sqlQuery = 'SELECT refreshToken, profileId FROM cronofytokens WHERE user_id = ? AND profileName = ?'
  db.query(sqlQuery, [userId, emailAddress], async (err, resultedData) => {
    if (err) {
      res.status(500).send('Error in fetching email Address item');
    } else {
      // Send a POST request to Cronofy to refresh the access code for refresh tokens
      try {
        const newTokenResponse = await axios.post(`${cronofyReqTokenUrl}`, {
          client_id: cronofyClientId,
          client_secret: cronofyClientSecret,
          grant_type: 'refresh_token',
          refresh_token: resultedData[0].refreshToken
        });
        
        const { access_token, expires_in, refresh_token } = newTokenResponse.data;
        const updateQuery = 'UPDATE cronofytokens SET accessToken = ?, expiresIn = ?, refreshToken = ?, updatedAt = ? WHERE user_id = ? AND profileName = ?'
        db.query(updateQuery, [access_token, expires_in, refresh_token, currentTimestamp, userId, emailAddress], async function (err, data) {
          if (err) {
            // console.error(err); // Log the error
            return res.json({ Error: "Error in updating new token in DB" });
          } else {
            try {
              const revokeProfile = await axios.post(`https://api.cronofy.com/v1/profiles/${resultedData[0].profileId}/revoke`, null, {
                headers: {
                  Authorization: `Bearer ${access_token}` // Fix the header syntax
                }
              });
              // console.log(revokeProfile)
              if (revokeProfile.status === 202) {
                const delQuery = 'DELETE FROM cronofytokens WHERE user_id = ? AND profileId = ?'
                db.query(delQuery, [userId, resultedData[0].profileId], function (err, deldata) {
                  if (err) {
                    return res.json({ Error: "Error while deleting data in token table" })
                  } else {
                    try {
                      const deleteQuery = 'DELETE FROM useremails WHERE user_id = ? AND personal_email = ?'
                      db.query(deleteQuery, [userId, emailAddress], function (err, deldata) {
                        if (err) {
                          return res.json({ Error: "Error while deleting data in user email table" })
                        } else {
                          return res.json({ status: "Success" })
                        }
                      })
                    } catch (error) {
                      return res.json({ Error: "Error while deleting data in user email table" })
                    }
                  }
                })
              } else {
                return res.json({ Error: "Error while revoking user profile" })
              }
            } catch (err) {
              return res.json({ Error: 'Authorization error while revoking profile' })
            }
          }
        });
      } catch (err) {
        return res.json({ Error: "Error in getting new access token" });
      }
    }
  })
})

app.listen(PORT, () => {
  console.log(`Server started running on port ${PORT} at ${currentTimestamp}`);
  db.connect((err) => {
    if (err) throw err;
    console.log("Database Connected!");
  });
});
