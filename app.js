var express = require('express');
var app = express(),
    http = require('http'),
    server = http.createServer(app),
    io = require('socket.io').listen(server, { log: false });

server.listen(13013);

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// meant to be passed to the client
var users = {};

io.sockets.on('connection', function (socket) {
  socket.on('adduser', function(username, color){
    socket.username = username;
    socket.color = color;
    users[username] = { name: username, color: color };
    console.log(username + " has joined");
    io.sockets.emit('updateusers', users);
    socket.emit('updateuser', socket.username, socket.color);
  });

  socket.on('sendchat', function (data) {
    console.log(socket.username + ": " + data);
    io.sockets.emit('updatetalk', socket.username, socket.color, data);
  });

  socket.on('disconnect', function(){
    //delete users[socket.username];
    console.log(socket.username + " disconnected");
  });
});
