var express = require('express');
var app = express(),
    http = require('http'),
    server = http.createServer(app),
    io = require('socket.io').listen(server, { log: false });

var sys = require('sys');
var exec = require('child_process').exec;
var child;

var handy = require('./public/handy.js');

/* number of current unknown names */
var unknms = 0;

server.listen(13013);

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// meant to be passed to the client
var users = {};

io.sockets.on('connection', function (socket) {
  socket.on('adduser', function(username, color){
    socket.emit('clear');
    if (username == "" || username == "null"){
      username = "name_" + unknms++;
    }
    if (color == "" || color == "null"){
      color = "#525252";
    }
    socket.username = username;
    socket.color = color;
    users[username] = { name: username, color: color };
    /* output the history logs */
    child = exec("./db fetch", function(err, stdout, stderr){
      if (err !== null){
        console.log("ERR: reading messages from database failed: " + err);
      } else {
        var messages = JSON.parse(stdout);
        for (var i = 0; i < messages.length; i++){
          io.sockets.emit('updatetalk', messages[i][1], messages[i][2], messages[i][3], messages[i][4]);
        }
      }
    });
    console.log(username + " has joined");
    io.sockets.emit('updateusers', users);
    socket.emit('updateuser', socket.username, socket.color);
  });

  socket.on('sendchat', function (data) {
    /* do anything only when the message is not whitespace only */
    if (!handy.isBlank(data)){
      var args = data.split(" ");
      if (args[0] == "/color"){
        if (args[1] === undefined){
          socket.emit('updatetalk', 'SERVER', "#525252", "usage: /color <COLOR>", new Date().getTime() / 1000);
        } else {
          socket.color = args[1];
          users[socket.username].color = args[1];
          socket.emit('updateuser', socket.username, socket.color);
          socket.emit('set cookie', 'known', socket.username + ":" + socket.color);
          io.sockets.emit('updateusers', users);
        }
      }
      else if (args[0] == "/nick"){
        if (args[0] === undefined){
          socket.emit('updatetalk', 'SERVER', '#525252', "usage: /nick <NICK>", new Date().getTime() / 1000);
        } else {
          var newname = args.splice(1).join(" ");
          users[newname] = users[socket.username];
          users[newname].name = newname;
          delete users[socket.username];
          io.sockets.emit('updatetalk', 'SERVER', '#525252', socket.username + ' is now known as ' + newname, new Date().getTime() / 1000);
          socket.username = newname;
          socket.emit('updateuser', socket.username, socket.color);
          socket.emit('set cookie', 'known', socket.username + ":" + socket.color);
          io.sockets.emit('updateusers', users);
        }
      }
      else if (args[0] == "/topic"){
        io.sockets.emit('set topic', args.splice(1).join(" "));
      }
      else {
        console.log(socket.username + ": " + data);
        io.sockets.emit('updatetalk', socket.username, socket.color, data, /* ugly ass hack */ new Date().getTime() / 1000);
        /* save the message into the database */
        var cmd = "./db save '" + socket.username + "' '" + socket.color + "' '" + data + "'";
        child = exec(cmd, function(err, stdout, stderr){
          if (err !== null){
            console.log("ERR: saving to database failed: " + err);
          }
        });
      }
    }
  });

  socket.on('disconnect', function(){
    delete users[socket.username];
    console.log(socket.username + " disconnected");
  });
});
