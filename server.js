var express = require('express');
var app = express(),
    http = require('http'),
    server = http.createServer(app),
    io = require('socket.io').listen(server, { log: false });

var fs = require('fs');

var sys = require('sys');
var exec = require('child_process').exec;
var child;

var handy = require('./public/handy.js');

server.listen(13013);

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

var unknms = 0;
// meant to be passed to the client
var users = {};

/*
 * Permission bits:
 *
 *   topic: 1 << 0
 *   perl:  1 << 1
 *   ban:   1 << 2
 *   chmod: 1 << 3 // that one is kind of the most valuable
 *                 // ie. that's the Oficerish bit
 *
 */
var cmds = {
  help: {
    args: [],
    fn:   cmd_help,
    help: "show this listing"
  },

  color: {
    args: ['color'],
    fn:   cmd_color,
    help: "change your nick's color (RGB)"
  },

  colors: {
    args: [],
    fn:   cmd_colors,
    help: "list the colors you can use in a conversation"
  },

  nick: {
    args: [],
    fn:   cmd_nick,
    help: "change your nick"
  },

  whois: {
    args: [],
    fn:   cmd_whois,
    help: "show some info about a given user"
  },

  topic: {
    args: ['newtopic'],
    fn:   cmd_topic,
    help: "set the topic",
    perm: {
      ch: 't',
      bit: 1 << 0
    }
  },

  login: {
    args: ['nick', 'password'],
    fn:   cmd_login,
    help: "login to a user (remember to /register before)"
  },

  register: {
    args: ['nick', 'password'],
    fn:   cmd_register,
    help: "register a nick"
  },

  ban: {
    args: ['nick'],
    fn:   cmd_ban,
    help: "ban a given user",
    perm: {
      ch: 'b',
      bit: 1 << 2
    }
  },

  priv: {
    args: ['nick', 'msg'],
    fn:   cmd_priv,
    help: "send a private message"
  },

  perl: {
    args: ['code'],
    fn:   cmd_perl,
    help: "run a bit of Perl",
    perm: {
      ch: 'p',
      bit: 1 << 1
    }
  },

  chmod: {
    args: ['[+-]perm', 'user'],
    fn:   cmd_chmod,
    help: "change user's permissions",
    perm: {
      ch: 'o',
      bit: 1 << 3
    }
  }
};

io.sockets.on('connection', function (socket) {
  socket.on('user join', function(username, password){
    /* let's clear his screen */
    socket.emit('clear');
    /* let's see if that guy is on the blacklist */
    fs.readFile('blacklist', function(err, data){
      if (err) throw err;
      var array = data.toString().split("\n");
      for (i in array){
        if (array[i] == socket.handshake.address.address){
          console.log(array[i] + " is banned!");
          socket.emit('banned');
          socket.disconnect();
          break;
        }
      }
    });
    /* attempt to log the user in */
    var cmd = "./db login '" + username + "' '" + password + "' hashed";
    child = exec(cmd, function(err, stdout, stderr){
      if (err === null){
        var newuser = JSON.parse(stdout);
        socket.username = newuser[1];
        socket.color = newuser[3];
        socket.perm = parseInt(newuser[4]);
        if (socket.handshake !== undefined)
          socket.ip = socket.handshake.address.address;
        else
          socket.ip = '#unknown#gottafixit#';
        socket.emit('set cookie', 'known', newuser[1] + ":" + newuser[2]);
        /* create the users 'slot' */
        users[socket.username] = { id: socket.id, name: socket.username, color: socket.color, ip: socket.ip, perm: socket.perm };
        console.log(socket.username + " (" + socket.handshake.address.address + ") has joined");
        io.sockets.emit('updateusers', users);
        socket.emit('updateuser', socket.username, socket.color);
      } else {
        socket.username = "name_" + unknms++;
        socket.color = '#525252';
        socket.perm = 0;
        if (socket.handshake !== undefined)
          socket.ip = socket.handshake.address.address;
        else
          socket.ip = '#unknown#gottafixit#';
        /* create the users 'slot' */
        users[socket.username] = { id: socket.id, name: socket.username, color: socket.color, ip: socket.ip, perm: socket.perm };
        console.log(socket.username + " (" + socket.ip + ") has joined");
        io.sockets.emit('updateusers', users);
        socket.emit('updateuser', socket.username, socket.color);
      }
    });
    /* set the topic */
    child = exec("./db get_setting 'topic'", function(err, stdout, stderr){
      if (err !== null){
        console.log("ERR: setting the topic failed: " + err);
      } else {
        socket.emit('set topic', JSON.parse(stdout)[2]);
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
      /*
       * XXX that's a /command
       */
      if (args[0].slice(0, 1) == '/'){
        var canrun = false;
        var cmd = args[0].slice(1);
        if (cmds[cmd] !== undefined){
          /* check for the permissions */
          if (cmds[cmd].perm === undefined){
            /* here, the command has no permissions defined, so we allow the
             * user to run the command */
            canrun = true;
          } else {
            if (socket.perm & cmds[cmd].perm.bit){
              /* he has the permission */
              canrun = true;
            }
          }
          if (canrun){
            if (args.slice(1).length < cmds[cmd].args.length){
              var cmdargs = "";
              for (var i in cmds[cmd].args){
                cmdargs += "<" + cmds[cmd].args[i] + "> ";
              }
              socket.emit('updatetalk', cmd.toUpperCase(), '#525252', 'usage: /' + cmd + ' ' + cmdargs, new Date().getTime() / 1000);
            } else {
              cmds[cmd].fn(io, socket, data.split(" ").slice());
            }
          } else {
            socket.emit('updatetalk', 'SERVER', '#525252', cmd + ': permission denied', new Date().getTime() / 1000);
          }
        } else {
          socket.emit('updatetalk', 'SERVER', '#525252', "unknown command '" + cmd + "'", new Date().getTime() / 1000);
        }
      } else {
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

function cmd_help(io, socket, args)
{
  /* {{{ help */
  var msg = "";

  for (var cmd in cmds){
    if ((cmds[cmd].perm === undefined) || ((cmds[cmd].perm !== undefined) && (socket.perm & cmds[cmd].perm.bit))){
      msg += cmd + ' - ' + cmds[cmd].help + "\n";
    }
  }

  socket.emit('updatetalk', 'HELP', '#525252', msg, new Date().getTime() / 1000);
  /* }}} */
}

function cmd_color(io, socket, args)
{
  /* {{{ color */
  var cmd = "./db fetch_user " + socket.username;
  /* let's check if there already is such user */
  child = exec(cmd, function(err, stdout, stderr){
    if (err === null){
      var newcolor = args[1];
      var ch = exec("./db fetch_user " + socket.username, function(e,so,se){
        if (e === null){
          var u = JSON.parse(so);
          var ch2 = exec("./db update_user '" + u[0] + "' '" + socket.username + "' '" + newcolor + "'", function(a,b,c){});
        }
      });
      socket.color = newcolor;
      users[socket.username].color = newcolor;
      socket.emit('updateuser', socket.username, socket.color);
      io.sockets.emit('updateusers', users);
    }
  });
  /* }}} */
}

function cmd_colors(io, socket, args)
{
  /* {{{ colors */
  socket.emit('updatetalk', 'SERVER', '#525252', 'colors: `q`q `w`w `e`e `r`r `t`t `y`y `u`u `i`i', new Date().getTime() / 1000);
  /* }}} */
}

function cmd_nick(io, socket, args)
{
  /* {{{ nick */
  var cmd = "./db fetch_user " + args[1];
  /* let's check if there already is such user */
  child = exec(cmd, function(err, stdout, stderr){
    if (err !== null){
      var newname = args[1];
      var ch = exec("./db fetch_user " + socket.username, function(e,so,se){
        if (e === null){
          var u = JSON.parse(so);
          var ch2 = exec("./db update_user '" + u[0] + "' '" + newname + "'", function(a,b,c){});
          socket.emit('set cookie', 'known', newname + ":" + u[2]);
        }
      });
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
  /* }}} */
}

function cmd_whois(io, socket, args)
{
  /* {{{ whois */
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
    var msg = 'name:  ' + users[found].name + '\ncolor: ' + users[found].color + '\nperm: ' + users[found].perm.toString(2);
    if (socket.perm & cmds['chmod'].perm.bit){
      msg += '\nip: ' + users[found].ip;
    }
    socket.emit('updatetalk', 'WHOIS', '#525252', msg, new Date().getTime() / 1000);
  } else {
    socket.emit('updatetalk', 'WHOIS', '#525252', "user '"+args[1]+"' not found", new Date().getTime() / 1000);
  }
  /* }}} */
}

function cmd_topic(io, socket, args)
{
  /* {{{ topic */
  var newtopic = args.slice(1).join(" ");
  var cmd = "./db set_setting 'topic' '" + newtopic + "'";
  child = exec(cmd, function(err, stdout, stderr){
    if (err !== null){
      socket.emit('updatetalk', 'TOPIC', '#525252', stderr, new Date().getTime() / 1000);
    } else {
      io.sockets.emit('set topic', newtopic);
    }
  });
  /* }}} */
}

function cmd_login(io, socket, args)
{
  /* {{{ login */
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
  /* }}} */
}

function cmd_register(io, socket, args)
{
  /* {{{ register */
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
  /* }}} */
}

function cmd_priv(io, socket, args)
{
  /* {{{ priv */
  if (users[args[1]] !== undefined){
    if (args.length > 2){
      var msg = args.slice(2).join(" ");
      io.sockets.socket(users[args[1]].id).emit('updatetalk', socket.username + '»' + users[args[1]].name, socket.color, msg, new Date().getTime() / 1000);
      socket.emit('updatetalk', socket.username + "»" + users[args[1]].name, users[args[1]].color, msg, new Date().getTime() / 1000);
    } else {
      socket.emit('updatetalk', 'SERVER', '#525252', 'usage: /priv <nick> <message>', new Date().getTime() / 1000);
    }
  } else {
    socket.emit('updatetalk', 'PRIV', '#525252', 'user \'' + args[1] + '\' is not logged in!', new Date().getTime() / 1000);
  }
  /* }}} */
}

function cmd_ban(io, socket, args)
{
  /* {{{ ban */
  if (users[args[1]] !== undefined){
    fs.appendFile('blacklist', users[args[1]].ip + "\n", function(err){
      if (err !== null){
        console.log('ERR: appending ip to the blacklist: ' + err);
        socket.emit('updatetalk', 'BAN', '#525252', err, new Date().getTime() / 1000);
      } else {
        io.sockets.emit('updatetalk', 'BAN', '#525252', 'user \'' + args[1] + '\' (' + users[args[1]].ip + ') was banned!', new Date().getTime() / 1000);
        io.sockets.socket(users[args[1]].id).emit('banned');
        io.sockets.socket(users[args[1]].id).disconnect();
      }
    });
  } else {
    socket.emit('updatetalk', 'BAN', '#525252', 'user \'' + args[1] + '\' is not logged in!', new Date().getTime() / 1000);
  }
  /* }}} */
}

function cmd_perl(io, socket, args)
{
  /* {{{ perl */
  var code = args.slice(1).join(" ").replace(/'/g, '"');
  var final_code = "sudo -u nobody perl -e '" + code + "' < /dev/null";
  io.sockets.emit('updatetalk', socket.username, socket.color, '/perl ' + code, new Date().getTime() / 1000);
  child = exec(final_code, function(err, stdout, stderr){
    if (err === null){
      io.sockets.emit('updatetalk', 'PERL', '#525252', stdout, new Date().getTime() / 1000);
    } else {
      io.sockets.emit('updatetalk', 'PERL', '#525252', stderr, new Date().getTime() / 1000);
    }
  });
  /* }}} */
}

function cmd_chmod(io, socket, args)
{
  /* {{{ chmod */
  var op;
  var found = 0;
  var perm;
  var bit;

  if (args[1].slice(0, 1) == '+'){
    op = "add";
  } else if (args[1].slice(0, 1) == '-'){
    op = "rm";
  } else {
    socket.emit('updatetalk', 'CHMOD', '#525252', 'wrong action \''+args[1].slice(0,1)+'\' (can only be either \'+\' or \'-\')', new Date().getTime() / 1000);
    return;
  }

  perm = args[1].slice(1);

  /* okay, now let's check if the 'perm' actually exists */
  for (var cmd in cmds){
    if (cmds[cmd].perm !== undefined && cmds[cmd].perm.ch == perm){
      bit = cmds[cmd].perm.bit;
      found = 1;
      break;
    }
  }

  if (!found){
    socket.emit('updatetalk', 'CHMOD', '#525252', "unknown perm '" + perm + "'", new Date().getTime() / 1000);
    return;
  }

  /* okay, ready to update! */
  var cmd = "./db fetch_user " + args[2];
  /* let's check if there already is such user */
  child = exec(cmd, function(err, stdout, stderr){
    if (err === null){
      var u = JSON.parse(stdout);
      var newperm;
      if (op == "add"){
        newperm = u[4] | bit;
      } else if (op == "rm"){
        newperm = u[4] & (~bit);
      }
      var upcmd = "./db update_user '" + u[0] + "' '" + u[1] + "' '" + u[3] + "' '" + newperm + "'";
      var ch2 = exec(upcmd, function(a,b,c){});
      /* if the user is online at the time, give him the permissions right away */
      if (users[u[1]] !== undefined){
        users[u[1]].perm = newperm;
        io.sockets.socket(users[u[1]].id).perm = newperm;
      }
      socket.emit('updatetalk', 'CHMOD', '#525252', "permissions set correctly, new permissions: '" + newperm.toString(2) + "'", new Date().getTime() / 1000);
    } else {
      socket.emit('updatetalk', 'CHMOD', '#525252', stderr, new Date().getTime() / 1000);
    }
  });
  /* }}} */
}

