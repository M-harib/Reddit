const cluster = require("cluster");
const os = require("os");
const path = require("path");

const numCPUs = Math.max(1, os.cpus().length);

if (cluster.isPrimary) {
  console.log(`[cluster] Primary ${process.pid} started — forking ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`[cluster] Worker ${worker.process.pid} exited (code=${code} signal=${signal}) — restarting`);
    cluster.fork();
  });
} else {
  require("./index");
  console.log(`[cluster] Worker ${process.pid} started`);
}
