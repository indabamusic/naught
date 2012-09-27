/*global describe before after it*/
var fs, naught_bin, path, naught_main, assert, async, exec, spawn, steps, root, test_root, http, port, hostname, timeout, step_count, fse, zlib;

fs = require('fs');
fse = require('fs-extra');
http = require('http');
spawn = require('child_process').spawn;
path = require("path");
assert = require("assert");
async = require("async");
zlib = require('zlib');

root = path.join(__dirname, "..");
test_root = path.join(root, "test");
naught_main = path.join(root, "lib", "main.js");
port = process.env.PORT || 11904;
hostname = 'localhost';
timeout = 5;

function exec(cmd, args, opts, cb){
  var bin, stdout, stderr;
  if (args == null) args = []
  if (opts == null) opts = {}
  if (cb == null) cb = function(){};
  bin = spawn(cmd, args, opts);
  stdout = ""
  bin.stdout.on('data', function(data) {
    stdout += data;
  });
  stderr = ""
  bin.stderr.on('data', function(data) {
    stderr += data;
  });
  bin.on('exit', function(code, signal) {
    cb(stdout, stderr, code, signal);
  });
}

function import$(obj, src){
  var key, own = {}.hasOwnProperty;
  for (key in src) if (own.call(src, key)) obj[key] = src[key];
  return obj;
}

function naught_exec(args, env, cb) {
  if (env == null) env = {}
  import$(import$({}, process.env), env)
  exec("node", [naught_main].concat(args), {
    cwd: __dirname,
    env: env
  }, function(stdout, stderr, code, signal) {
    cb(stdout, stderr, code);
  });
}

function collectLogFiles(test_path, cb) {
  fs.readdir(path.join(test_root, test_path), function (err, files) {
    if (err) return cb(err);
    files.sort()
    if (! /\.gz$/.test(files[0])) {
      files.push(files.shift());
    }
    async.map(files, function (file, cb) {
      fs.readFile(path.join(test_root, test_path, file), function (err, data) {
        if (err) return cb(err);
        if (/\.gz$/.test(file)) {
          zlib.gunzip(data, function (err, data) {
            if (err) return cb(err);
            cb(null, {file: file, data: data});
          });
        } else {
          cb(null, {file: file, data: data});
        }
      });
    }, function (err, results) {
      var full_data;
      full_data = "";
      results.forEach(function(item) {
        full_data += item.data.toString();
      });
      cb(null, results, full_data);
    });
  });
}

function use(script) {
  return function (cb) {
    fse.copy(path.join(test_root, script), path.join(test_root, "server.js"), cb);
  }
}

function mkdir(dir) {
  return function (cb) {
    fse.mkdir(path.join(test_root, dir), cb);
  }
}

function rm(files) {
  return function (cb) {
    async.forEach(files, function (item, cb) {
      fs.unlink(path.join(test_root, item), cb);
    }, cb);
  };
}

function remove(files) {
  return function (cb) {
    async.forEach(files, function (item, cb) {
      fse.remove(path.join(test_root, item), cb);
    }, cb);
  }
}

function get(url, expected_resp) {
  return function (cb) {
    http.request({
      hostname: hostname,
      port: port,
      path: url,
    }, function (res) {
      var body;
      assert.strictEqual(res.statusCode, 200);
      body = ""
      res.on('data', function(data) {
        body += data;
      });
      res.on('end', function() {
        assert.strictEqual(body, expected_resp);
        cb();
      });
    }).end();
  }
}

describe("naught", function() {
  describe("using server1.js", function () {
    before(use("server1.js"))

    it("starts a server", function (cb) {
      naught_exec(["start", "server.js"], {
        PORT: port,
        hi: "sup dawg",
      }, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "Bootup. booting: 1, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 0\n");
        assert.strictEqual(stdout, "workers online: 1\n")
        assert.strictEqual(code, 0)
        cb();
      });
    })

    it("prints the status of the running server when run twice", function (cb) {
      naught_exec(["start", "server.js"], {}, function(stdout, stderr, code) {
        assert.strictEqual(stderr, "");
        assert.strictEqual(stdout, "workers online: 1\n");
        assert.strictEqual(code, 1)
        cb();
      });
    })

    it("queries the status of a running server", function (cb) {
      naught_exec(["status"], {}, function(stdout, stderr, code) {
        assert.strictEqual(stderr, "");
        assert.strictEqual(stdout, "workers online: 1\n");
        assert.strictEqual(code, 0)
        cb();
      });
    })

    it("is up and running", get("/hi", "server1 sup dawg"))
  })

  describe("using server2.js", function () {
    before(use("server1.js"))

    it("deploys to a running server", function (cb) {
      naught_exec(["deploy"], {hi: "hola"}, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "SpawnNew. booting: 0, online: 1, dying: 0, new_booting: 1, new_online: 0\n" +
          "NewOnline. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 1\n" +
          "ShutdownOld. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 1\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 1\n" +
          "done\n");
        assert.strictEqual(stdout, "");
        assert.strictEqual(code, 0)
        cb();
      });
    })

    it("changes environment variables of workers", get("/hi", "server2 hola"))

    it("stops a running server", function (cb) {
      naught_exec(["stop"], {}, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "ShutdownOld. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n");
        assert.strictEqual(stdout, "");
        assert.strictEqual(code, 0)
        cb();
      });
    })

    it("prints helpful output when stopping a server twice", function (cb) {
      naught_exec(["stop"], {}, function(stdout, stderr, code) {
        assert.strictEqual(stdout, "");
        assert.strictEqual(stderr, "server not running\n");
        assert.strictEqual(code, 1)
        cb();
      });
    })

    it("redirects stdout to a log file", function (cb) {
      fs.readFile(path.join(test_root, "stdout.log"), "utf8", function (err, contents) {
        assert.strictEqual(contents, "server1 attempting to listen\n" +
          "server2 attempting to listen\n");
        cb();
      });
    })

    it("redirects stderr to a log file", function (cb) {
      fs.readFile(path.join(test_root, "stderr.log"), "utf8", function (err, contents) {
        assert.strictEqual(contents, "server1 listening\n" +
          "server2 listening\n");
        cb();
      });
    })

    it("writes events to a naught log", function (cb) {
      fs.readFile(path.join(test_root, "naught.log"), "utf8", function (err, contents) {
        assert.strictEqual(contents,
          "Bootup. booting: 1, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "Ready. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "Status. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "Status. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "SpawnNew. booting: 0, online: 1, dying: 0, new_booting: 1, new_online: 0\n" +
          "NewOnline. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 1\n" +
          "ShutdownOld. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 1\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 1\n" +
          "Ready. booting: 0, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "Shutdown. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n");
        cb();
      });
    })

    after(rm(["naught.log", "stderr.log", "stdout.log", "server.js"]))
  })

  describe("using server3.js", function () {
    before(use("server3.js"))
    before(mkdir("foo"))

    it("accepts non-default args", function (cb) {
      naught_exec([
          "start",
          "--worker-count", "5",
          "--ipc-file", "some/dir/ipc",
          "--log", "log/naught/a.log",
          "--stderr", "log/stderr/b",
          "--stdout", "log/stdout/c.",
          "--max-log-size", "300",
          "--cwd", "foo",
          "server.js",
          "--custom1", "aoeu",
          "herp derp",
      ], {
        PORT: port,
      }, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "Bootup. booting: 5, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 4, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 3, online: 2, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 2, online: 3, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 1, online: 4, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 0, online: 5, dying: 0, new_booting: 0, new_online: 0\n");
        assert.strictEqual(stdout, "workers online: 5\n")
        assert.strictEqual(code, 0)
        cb();
      })
    })

    it("passes command line arguments to server correctly", get("/argv", "--custom1,aoeu,herp derp"))

    it("responds to get requests with multiple workers", get("/stdout", "stdout3"))
  })

  describe("with sufficient log output to rotate", function () {
    before(get("/stderr", "stderr3"))
    before(get("/stdout", "stdout3"))
    before(get("/stderr", "stderr3"))

    it("stops a running server with multiple workers", function (cb) {
      naught_exec(["stop", "some/dir/ipc"], {}, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "ShutdownOld. booting: 0, online: 4, dying: 1, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 3, dying: 2, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 2, dying: 3, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 1, dying: 4, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 0, dying: 5, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 4, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 3, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 2, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n");
        assert.strictEqual(stdout, "");
        assert.strictEqual(code, 0)
        cb();
      });
    })

    it("rotates and gzips naught log", function (cb) {
      collectLogFiles("log/naught", function (err, files, data) {
        if (err) return cb(err)
        assert.strictEqual(files.length, 4);
        assert.strictEqual(data,
          "Bootup. booting: 5, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 4, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 3, online: 2, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 2, online: 3, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 1, online: 4, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 0, online: 5, dying: 0, new_booting: 0, new_online: 0\n" +
          "Ready. booting: 0, online: 5, dying: 0, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 4, dying: 1, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 3, dying: 2, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 2, dying: 3, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 1, dying: 4, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 0, dying: 5, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 4, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 3, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 2, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "Shutdown. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n");
        cb();
      });
    })

    it("rotates and gzips stderr log", function (cb) {
      collectLogFiles("log/stderr", function (err, files, data) {
        if (err) return cb(err)
        assert.strictEqual(files.length, 2);
        assert.strictEqual(data,
          "server3 listening\n" +
          "server3 listening\n" +
          "server3 listening\n" +
          "server3 listening\n" +
          "server3 listening\n" +
          "3 stderr abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stderr abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stderr abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stderr abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stderr abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stderr abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n");
        cb();
      });
    })

    it("rotates and gzips stdout log", function (cb) {
      collectLogFiles("log/stdout", function (err, files, data) {
        if (err) return cb(err)
        assert.strictEqual(files.length, 2);
        assert.strictEqual(data,
          "server3 attempting to listen\n" +
          "server3 attempting to listen\n" +
          "server3 attempting to listen\n" +
          "server3 attempting to listen\n" +
          "server3 attempting to listen\n" +
          "3 stdout abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stdout abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stdout abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stdout abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stdout abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n" +
          "3 stdout abcdefghijklmnopqrstuvwxyz123456789101121314151617181920\n");
        cb();
      });
    })

    after(remove(["foo", "log", "some", "server.js"]))
  })

  describe("using server4.js", function () {
    // start a server that won't shut down
    before(function (cb) {
      naught_exec(["start", "--worker-count", "2", "server.js"], {
        PORT: port,
      }, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "Bootup. booting: 2, online: 0, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 1, online: 1, dying: 0, new_booting: 0, new_online: 0\n" +
          "WorkerOnline. booting: 0, online: 2, dying: 0, new_booting: 0, new_online: 0\n");
        assert.strictEqual(stdout, "workers online: 2\n")
        assert.strictEqual(code, 0)
        cb();
      });
    })
    
    it("stops a hanging server with a timeout", function (cb) {
      naught_exec(["stop", "--timeout", "0.3"], {}, function(stdout, stderr, code) {
        assert.strictEqual(stderr,
          "ShutdownOld. booting: 0, online: 1, dying: 1, new_booting: 0, new_online: 0\n" +
          "ShutdownOld. booting: 0, online: 0, dying: 2, new_booting: 0, new_online: 0\n" +
          "DestroyOld. booting: 0, online: 0, dying: 2, new_booting: 0, new_online: 0\n" +
          "DestroyOld. booting: 0, online: 0, dying: 2, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 1, new_booting: 0, new_online: 0\n" +
          "OldExit. booting: 0, online: 0, dying: 0, new_booting: 0, new_online: 0\n");
        assert.strictEqual(stdout, "");
        assert.strictEqual(code, 0)
        cb();
      });
    })

    after(rm(["naught.log", "stderr.log", "stdout.log", "server.js"]))
  })
})

