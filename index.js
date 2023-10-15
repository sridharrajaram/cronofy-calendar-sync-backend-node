const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const Cronofy = require('cronofy');
const axios = require('axios');
require('dotenv').config();

const PORT = process.env.PORT || 5001;

const app = express();

const JwtSecretKey = process.env.JWT_SECRET_KEY
const cronofyClientId = process.env.CRONOFY_CLIENT_ID;
const cronofyClientSecret = process.env.CRONOFY_CLIENT_SECRET;
const cronofyScope = process.env.CRONOFY_SCOPE;

app.use(cors({
  origin: ['http://localhost:3000'],
  methods: ["POST", "GET"],
  credentials: true
}));

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

// // Initialize the Cronofy client
// const cronofy = new Cronofy({
//   client_id: process.env.CRONOFY_CLIENT_ID,
//   client_secret: process.env.CRONOFY_CLIENT_SECRET,
// });

const createUserProfile = async (user) => {
  try {
    const userProfile = await cronofy.createAccountProfile({
      profile_name: user.name, // You can use the user's username or any other identifier
    });

    // Create the calendar with the user's profile name
    const createCalendarResponse = await cronofy.createCalendar({
      profile_id: profileName,
    });

    // createCalendarResponse will contain information about the created calendar
    console.log('Cronofy User Profile created:', createCalendarResponse);
    return createCalendarResponse;
  } catch (error) {
    console.error('Error creating Cronofy User Profile:', error);
    throw error;
  }
};


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

app.get('/', verifyUser, (req, res) => {
  return res.json({ status: "Success", name: req.name });
})


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

      // const user = {
      //   email: req.body.email,
      //   username: req.body.name,
      // };

      // // Call the function on user registration
      // createUserProfile(user)
      //   .then((res) => {
      //     // Continue with your user registration process
      //     // This will be executed after the Cronofy user profile is created
      //     // Make an array of values:
      //     var values = [req.body.name, req.body.email, hash, res.profile_id];
      //     // Execute the SQL statement, with the value array:
      //     db.query(sql, [values], function (err, data) {
      //       if (err) {
      //         console.error(err); // Log the error
      //         return res.json("Error DB");
      //       }
      //       return res.json({ status: "success" });
      //     });
      //   })
      //   .catch((error) => {
      //     // Handle any errors that occur during profile creation
      //   });
    });
  });
});

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


app.get('/logout', (req, res) => {
  res.clearCookie('authCookie');
  return res.json({ status: "Success" });
})


// Define a route to initiate the Cronofy OAuth flow
app.get('/cronofy-auth', (req, res) => {
  // Construct the Cronofy OAuth authorization URL
  const authUrl = `https://app.cronofy.com/oauth/authorize?client_id=${cronofyClientId}&redirect_uri=http://localhost:${PORT}/cronofy-callback&response_type=code&scope=${cronofyScope}&state=${cronofyState}`;
  console.log(authUrl);
  // Redirect the user to Cronofy for authorization
  res.redirect(authUrl);
});

// Define a route to handle the OAuth callback
app.get('/cronofy-callback', (req, res) => {
  const code = req.query.code;

  // Exchange the authorization code for an access token
  axios
    .post('https://api.cronofy.com/v1/token', {
      client_id: cronofyClientId,
      client_secret: cronofyClientSecret,
      grant_type: 'authorization_code',
      code: code,
    })
    .then((response) => {
      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;

      // Use the access token to get the user's profile (sub_id)
      axios
        .get('https://api.cronofy.com/v1/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        .then((userResponse) => {
          const subId = userResponse.data.sub;
          const name = userResponse.data.name;

          // Use the access token to get the user's calendars and store cal_ids
          axios
            .get('https://api.cronofy.com/v1/calendars', {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            })
            .then((calendarsResponse) => {
              const calendars = calendarsResponse.data.calendars;

              // Save the sub_id and cal_ids in the MySQL database
              calendars.forEach((calendar) => {
                const calId = calendar.calendar_id;
                // Insert data into the database
                mysqlConnection.query(
                  'INSERT INTO calendars (name, sub_id, cal_id) VALUES (?, ?, ?)',
                  [name, subId, calId],
                  (error, results) => {
                    if (error) {
                      console.error('Error saving data to the database:', error);
                      res.send('Error saving data to the database');
                    } else {
                      console.log('Data saved to the database.');
                      res.send('Data saved to the database.');
                    }
                  }
                );
              });
            })
            .catch((error) => {
              console.error('Error getting calendars:', error);
              res.send('Error getting calendars');
            });
        })
        .catch((error) => {
          console.error('Error getting user profile:', error);
          res.send('Error getting user profile');
        });
    })
    .catch((error) => {
      console.error('Error exchanging code for access token:', error);
      res.send('Error exchanging code for access token');
    });
});



app.listen(PORT, () => {
  console.log(`Server started running on port ${PORT}`);
});
