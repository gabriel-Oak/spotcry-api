const express = require('express'); // Express web server framework
const request = require('request'); // "Request" library
const cors = require('cors');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');

const client_id = '0ce8fd4d755e41178c34a2c57813e023'; // Your client id
const client_secret = 'db945b7d1ed84d1cab8de989391569d9'; // Your secret
const redirect_uri = 'http://ec2-18-231-166-89.sa-east-1.compute.amazonaws.com/callback'; // Your redirect uri

const clients = {};

const stateKey = 'spotify_auth_state';

const app = express();

app.use(cors())
  .use(cookieParser());

app.get('/login/:id', function (req, res) {
  console.log(req.params.id);

  const state = req.params.id;
  res.cookie(stateKey, state);

  // your application requests authorization
  const scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function (req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  const code = req.query.code || null;
  const state = req.query.state || null;

  if (state === null) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {

        const access_token = body.access_token;
        const refresh_token = body.refresh_token;

        const options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function (error, response, body) {
          if (error) {
            return;
          }

          try {
            clients[state].emit('credentials', {
              ...body,
              tokens: {
                access_token,
                refresh_token
              }
            });
          } catch (e) {
            console.log(e);
          }
        });
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error
          })
        );
      }
    });
  }
});

app.get('/refresh/', function (req, res) {

  // requesting access token from refresh token
  const { authorization } = req.headers;
  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: authorization
    },
    json: true
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      const access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    } else {
      res.status(response.statusCode).send({ message: 'error' });
    }
  });
});

const server = require('http').createServer(app);
const io = require('socket.io')(server);

io.on('connection', socket => {
  socket.emit('connected', 'Successfuly connected');
  socket.on('disconnect', () => {
    clients[socket.id] = undefined;
  });

  clients[socket.id] = socket;
});

server.listen(3000);