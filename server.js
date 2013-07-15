var express = require('express');
var app = express(),
    http = require('http'),
    server = http.createServer(app),
    io = require('socket.io').listen(server, { log: false });

var sys = require('sys');
var exec = require('child_process').exec;
var child;

var handy = require('./public/handy.js');

server.listen(13013);

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// meant to be passed to the client
var users = {};

io.sockets.on('connection', function (socket) {
  socket.on('user join', function(username, password){
    socket.emit('clear');
    /* attempt to log the user in */
    var cmd = "./db login '" + username + "' '" + password + "' hashed";
    child = exec(cmd, function(err, stdout, stderr){
      if (err === null){
        var newuser = JSON.parse(stdout);
        socket.username = newuser[1];
        socket.color = newuser[3];
        socket.perm = parseInt(newuser[4]);
        socket.emit('set cookie', 'known', newuser[1] + ":" + newuser[2]);
        /* create the users 'slot' */
        users[socket.username] = { name: socket.username, color: socket.color, ip: socket.ip, perm: socket.perm };
        console.log(socket.username + " (" + socket.handshake.address.address + ") has joined");
        io.sockets.emit('updateusers', users);
        socket.emit('updateuser', socket.username, socket.color);
      } else {
        socket.username = "noname";
        socket.color = '#525252';
        socket.perm = 0;
        socket.ip = socket.handshake.address.address;
        /* create the users 'slot' */
        users[socket.username] = { name: socket.username, color: socket.color, ip: socket.ip, perm: socket.perm };
        console.log(socket.username + " (" + socket.handshake.address.address + ") has joined");
        io.sockets.emit('updateusers', users);
        socket.emit('updateuser', socket.username, socket.color);
      }
    });
    /* output the history logs */
    child = exec("./db fetch 30", function(err, stdout, stderr){
      if (err !== null){
        console.log("ERR: reading messages from database failed: " + err);
      } else {
        var messages = JSON.parse(stdout);
        for (var i = messages.length - 1; i >= 0; i--){
          socket.emit('updatetalk', messages[i][1], messages[i][2], messages[i][3], messages[i][4]);
        }
      }
    });
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
        if (args[1] === undefined){
          socket.emit('updatetalk', 'SERVER', '#525252', "usage: /nick <NICK>", new Date().getTime() / 1000);
        } else {
          /* let's check if there already is such user */
          child = exec("./db fetch_user " + args[1], function(err, stdout, stderr){
            if (err !== null){
              var newname = args.splice(1).join(" ");
              users[newname] = users[socket.username];
              users[newname].name = newname;
              delete users[socket.username];
              io.sockets.emit('updatetalk', 'SERVER', '#525252', socket.username + ' is now known as ' + newname, new Date().getTime() / 1000);
              socket.username = newname;
              socket.emit('updateuser', socket.username, socket.color);
              io.sockets.emit('updateusers', users);
            } else {
              socket.emit('updatetalk', 'SERVER', '#525252', "name '" + args[1] + "' has already been taken", new Date().getTime() / 1000);
            }
          });
        }
      }
      else if (args[0] == "/topic"){
        io.sockets.emit('set topic', args.splice(1).join(" "));
      }
      else if (args[0] == "/colors"){
        socket.emit('updatetalk', 'SERVER', '#525252', 'colors: `q`q `w`w `e`e `r`r `t`t `y`y `u`u `i`i', new Date().getTime() / 1000);
      }
      else if (args[0] == "/register"){
        /* insert that user into the database */
        var cmd = "./db register '" + args[1] + "' '" + args[2] + "' '" + args[3] + "'";
        child = exec(cmd, function(err, stdout, stderr){
          if (err !== null){
            console.log("ERR: saving to database failed: " + err);
            socket.emit('updatetalk', 'SERVER', '#525252', stderr, new Date().getTime() / 1000);
          } else {
            socket.emit('updatetalk', 'SERVER', '#525252', "successfuly registered an account '" + args[1] + "'", new Date().getTime() / 1000);
          }
        });
      }
      else if (args[0] == "/login"){
        var cmd = "./db login '" + args[1] + "' '" + args[2] + "'";
        child = exec(cmd, function(err, stdout, stderr){
          if (err !== null){
            console.log("ERR: saving to database failed: " + err);
            socket.emit('updatetalk', 'SERVER', '#525252', stderr, new Date().getTime() / 1000);
          } else {
            socket.emit('updatetalk', 'SERVER', '#525252', "login into account '" + args[1] + "' successful", new Date().getTime() / 1000);
            var newuser = JSON.parse(stdout);
            delete users[socket.username];
            users[newuser[1]] = { name: newuser[1], color: newuser[3], perm: parseInt(newuser[4]), ip: socket.ip };
            socket.username = newuser[1];
            socket.color = newuser[3];
            socket.perm = parseInt(newuser[4]);
            socket.emit('updateuser', socket.username, socket.color);
            socket.emit('set cookie', 'known', socket.username + ":" + newuser[2]);
            io.sockets.emit('updateusers', users);
          }
        });
      }
      else if (args[0] == "/whois"){
        var found = 0;
        if (args[1] === undefined){
          args[1] = socket.username;
        }

        for (var user in users){
          if (user == args[1]){
            found = user;
          }
        }

        if (found){
          var msg = 'name:  ' + users[found].name + '\ncolor: ' + users[found].color + '\nperm:  ' + users[found].perm + '\nip:    ' + users[found].ip;
          console.log(msg);
          socket.emit('updatetalk', 'WHOIS', '#525252', msg, new Date().getTime() / 1000);
        } else {
          socket.emit('updatetalk', 'WHOIS', '#525252', "user '"+args[1]+"' not found", new Date().getTime() / 1000);
        }
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
